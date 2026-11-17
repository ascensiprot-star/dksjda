import type { BosAction } from '../core/system';
import { db, optionalRows, intOrZero, numeric, asRecord, asArray, windowStartIso } from '../core/repository';
import { loadOrders, isRevenueOrder, type LegacyOrder, normalizeOrder } from '../core/metrics';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { stringField, optionalString, moneyMinorField, isoDateField, pagination, intField } from '../core/validation';

interface CostRow {
  product_id: string;
  unit_cost_minor: number;
  effective_from: string;
}

/**
 * Finance reads recorded money only.
 * Revenue comes from orders, COGS from recorded product costs, expenses from
 * the expense ledger and refunds from the refund ledger. Missing cost data is
 * reported as missing, never replaced by an assumed margin.
 */
export const financeActions: Record<string, BosAction> = {
  financeSummary: {
    permission: 'finance.read',
    description: 'Recorded P&L for a period.',
    handler: async (_ctx, input) => {
      const days = Math.min(730, Math.max(1, intField(input, 'days', { min: 1, max: 730, fallback: 30 })));
      const since = windowStartIso(days);
      const [orders, costs, expenses, refunds] = await Promise.all([
        loadOrders(days),
        db.rows<CostRow>(db.from('product_costs').select('*').order('effective_from', { ascending: false }).limit(50000)),
        optionalRows<{ amount_minor: number; category: string; incurred_on: string }>(
          db.from('expenses').select('amount_minor, category, incurred_on').gte('incurred_on', since.slice(0, 10))
        ),
        optionalRows<{ amount_minor: number; created_at: string }>(
          db.from('refunds').select('amount_minor, created_at').gte('created_at', since)
        ),
      ]);

      const costByProduct = new Map<string, number>();
      for (const cost of costs) {
        if (!costByProduct.has(cost.product_id)) {
          costByProduct.set(cost.product_id, intOrZero(cost.unit_cost_minor));
        }
      }
      const billable = orders.filter(isRevenueOrder);
      let revenueMinor = 0;
      let shippingMinor = 0;
      let vatMinor = 0;
      let cogsMinor = 0;
      let missingCostUnits = 0;
      for (const order of billable) {
        revenueMinor += order.totalMinor;
        shippingMinor += order.shippingMinor;
        vatMinor += order.vatMinor;
        for (const item of order.items) {
          const unitCost = costByProduct.get(item.productId);
          if (unitCost === undefined) {
            missingCostUnits += item.quantity;
          } else {
            cogsMinor += unitCost * item.quantity;
          }
        }
      }
      const expenseMinor = expenses.reduce((sum, expense) => sum + intOrZero(expense.amount_minor), 0);
      const refundMinor = refunds.reduce((sum, refund) => sum + intOrZero(refund.amount_minor), 0);
      const grossProfitMinor = revenueMinor - cogsMinor;
      return {
        windowDays: days,
        revenueMinor,
        vatMinor,
        shippingMinor,
        refundsMinor: refundMinor,
        cogsMinor,
        grossProfitMinor,
        expensesMinor: expenseMinor,
        netProfitMinor: grossProfitMinor - expenseMinor - refundMinor,
        orders: billable.length,
        missingCostUnits,
        costCoveragePercent:
          billable.reduce((sum, order) => sum + order.items.reduce((line, item) => line + item.quantity, 0), 0) > 0
            ? Math.round(
                (1 -
                  missingCostUnits /
                    billable.reduce((sum, order) => sum + order.items.reduce((line, item) => line + item.quantity, 0), 0)) *
                  1000
              ) / 10
            : null,
        basis: 'recorded_orders_costs_expenses_refunds',
        note: missingCostUnits
          ? 'Gross profit excludes units without a recorded product cost.'
          : 'Every sold unit has a recorded cost basis.',
      };
    },
  },

  expenses: {
    permission: 'finance.read',
    description: 'List recorded expenses.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const category = optionalString(input, 'category', 80);
      let query = db.from('expenses').select('*', { count: 'exact' });
      if (category) query = query.eq('category', category);
      const [rows, total] = await Promise.all([
        db.rows<any>(query.order('incurred_on', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('expenses').select('*', { count: 'exact', head: true })),
      ]);
      return { expenses: rows, total, limit, offset };
    },
  },

  expenseCreate: {
    permission: 'finance.write',
    description: 'Record an expense with a source document.',
    handler: async (ctx, input) => {
      const category = stringField(input, 'category', { required: true, max: 80 });
      const vendor = stringField(input, 'vendor', { required: true, max: 120 });
      const amountMinor = moneyMinorField(input, 'amountMinor', { required: true, min: 1 });
      const incurredOn = isoDateField(input, 'incurredOn', { required: true })!;
      const reference = stringField(input, 'reference', { required: true, max: 200 });
      const note = optionalString(input, 'note', 1000) || '';
      const id = bosId('exp');
      const expense = await db.write(
        db
          .from('expenses')
          .insert({
            id,
            category,
            vendor,
            amount_minor: amountMinor,
            currency: 'EUR',
            incurred_on: incurredOn.slice(0, 10),
            reference,
            note,
            status: 'recorded',
            created_by: ctx.actor.email,
          })
          .select('*')
          .single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'finance.expense.create',
        targetType: 'expense',
        targetId: id,
        after: { category, vendor, amountMinor, incurredOn, reference },
        requestId: ctx.requestId,
      });
      return { expense };
    },
  },

  productCosts: {
    permission: 'finance.read',
    description: 'List product cost history.',
    handler: async (_ctx, input) => {
      const productId = optionalString(input, 'productId', 120);
      let query = db.from('product_costs').select('*');
      if (productId) query = query.eq('product_id', productId);
      const rows = await db.rows<CostRow>(query.order('effective_from', { ascending: false }).limit(5000));
      return { costs: rows };
    },
  },

  productCostSet: {
    permission: 'finance.write',
    description: 'Record a product unit cost effective from a date.',
    handler: async (ctx, input) => {
      const productId = stringField(input, 'productId', { required: true, max: 120 });
      const unitCostMinor = moneyMinorField(input, 'unitCostMinor', { required: true });
      const effectiveFrom = isoDateField(input, 'effectiveFrom', { required: true })!;
      const existing = await db.one<CostRow>(
        db
          .from('product_costs')
          .select('*')
          .eq('product_id', productId)
          .eq('effective_from', effectiveFrom)
          .maybeSingle()
      );
      if (existing) throw conflict('This product already has a cost for that effective date.');
      const product = await db.one(db.from('products').select('id').eq('id', productId).maybeSingle());
      if (!product) throw badRequest('Product not found.');
      const row = {
        id: bosId('cst'),
        product_id: productId,
        unit_cost_minor: unitCostMinor,
        effective_from: effectiveFrom,
        created_by: ctx.actor.email,
      };
      await db.from('product_costs').insert(row);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'finance.product_cost.set',
        targetType: 'product',
        targetId: productId,
        after: { unitCostMinor, effectiveFrom },
        requestId: ctx.requestId,
      });
      return row;
    },
  },

  journal: {
    permission: 'finance.read',
    description: 'List journal entries with balanced lines.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const entries = await db.rows<any>(
        db.from('journal_entries').select('*').order('entry_date', { ascending: false }).range(offset, offset + limit - 1)
      );
      const ids = entries.map((entry) => entry.id);
      const lines = ids.length
        ? await optionalRows<any>(db.from('journal_lines').select('*').in('entry_id', ids))
        : [];
      return {
        entries: entries.map((entry) => ({
          ...entry,
          lines: lines.filter((line) => line.entry_id === entry.id),
        })),
      };
    },
  },

  journalCreate: {
    permission: 'finance.write',
    description: 'Post a balanced journal entry.',
    handler: async (ctx, input) => {
      const entryDate = isoDateField(input, 'entryDate', { required: true })!;
      const description = stringField(input, 'description', { required: true, max: 500 });
      const lines = asArray(input.lines).map(asRecord);
      if (lines.length < 2) throw badRequest('A journal entry needs at least two lines.');
      let debit = 0;
      let credit = 0;
      const prepared = lines.map((line) => {
        const accountCode = String(line.accountCode || '').trim();
        if (!accountCode) throw badRequest('Every line needs an accountCode.');
        const debitMinor = intOrZero(line.debitMinor);
        const creditMinor = intOrZero(line.creditMinor);
        if (debitMinor < 0 || creditMinor < 0) throw badRequest('Journal amounts cannot be negative.');
        if ((debitMinor > 0) === (creditMinor > 0)) {
          throw badRequest('Each line must be either a debit or a credit.');
        }
        debit += debitMinor;
        credit += creditMinor;
        return { accountCode, debitMinor, creditMinor, note: String(line.note || '') };
      });
      if (debit !== credit) throw badRequest('Journal entry is not balanced.', { debit, credit });
      const id = bosId('jnl');
      await db.from('journal_entries').insert({
        id,
        entry_date: entryDate.slice(0, 10),
        description,
        reference_type: optionalString(input, 'referenceType', 60) || 'manual',
        reference_id: optionalString(input, 'referenceId', 120) || null,
        created_by: ctx.actor.email,
      });
      for (const line of prepared) {
        await db.from('journal_lines').insert({
          id: bosId('jln'),
          entry_id: id,
          account_code: line.accountCode,
          debit_minor: line.debitMinor,
          credit_minor: line.creditMinor,
          note: line.note,
        });
      }
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'finance.journal.create',
        targetType: 'journal',
        targetId: id,
        after: { entryDate, description, debit, credit },
        requestId: ctx.requestId,
      });
      return { id, debit, credit, lines: prepared.length };
    },
  },

  financeAccounts: {
    permission: 'finance.read',
    description: 'Chart of accounts.',
    handler: async () => {
      const rows = await db.rows<any>(db.from('ledger_accounts').select('*').order('code'));
      return { accounts: rows };
    },
  },

  financeReconciliation: {
    permission: 'finance.read',
    description: 'Compare recorded order value against payments and refunds.',
    handler: async (_ctx, input) => {
      const days = Math.min(730, Math.max(1, intField(input, 'days', { min: 1, max: 730, fallback: 30 })));
      const orders = await loadOrders(days);
      const payments = await optionalRows<{ order_id: string; amount_minor: number; status: string }>(
        db.from('payments').select('order_id, amount_minor, status').limit(50000)
      );
      const paidByOrder = new Map<string, number>();
      for (const payment of payments) {
        if (payment.status !== 'paid') continue;
        paidByOrder.set(payment.order_id, (paidByOrder.get(payment.order_id) || 0) + intOrZero(payment.amount_minor));
      }
      const mismatches = orders
        .filter((order) => isRevenueOrder(order))
        .map((order) => ({
          orderId: order.id,
          number: order.number,
          totalMinor: order.totalMinor,
          paidMinor: paidByOrder.get(order.id) || 0,
        }))
        .filter((row) => row.paidMinor !== row.totalMinor)
        .slice(0, 200);
      return {
        windowDays: days,
        ordersChecked: orders.length,
        mismatchCount: mismatches.length,
        mismatches,
        note: 'Only recorded payments are counted. Unpaid orders appear as mismatches by design.',
      };
    },
  },
};
