import { action, defineSystem } from '../core/system';
import { db, optionalRows, intOrZero, numeric, asRecord } from '../core/repository';
import { loadAuditEvents, verifyAuditChain } from '../../controlPlane/operations';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { stringField, optionalString, intField, boolField, pagination, enumField } from '../core/validation';

interface AutomationRule {
  id: string;
  name: string;
  trigger_event: string;
  conditions: unknown;
  actions: unknown;
  active: boolean;
}

export const governanceSystem = defineSystem({
  id: 'governance',
  index: 18,
  name: 'Security & Governance',
  screen: 'security',
  description: 'Immutable audit, automation rules and data quality.',
  actions: {
    audit: action('governance.read', 'Read the hash-chained audit tail.', async (_ctx, input) => {
      const limit = Math.min(500, Math.max(1, intField(input, 'limit', { min: 1, max: 500, fallback: 100 })));
      return loadAuditEvents(limit);
    }),

    verifyAudit: action('governance.read', 'Verify the audit hash chain.', async (_ctx, input) => {
      const limit = Math.min(20000, Math.max(1, intField(input, 'limit', { min: 1, max: 20000, fallback: 5000 })));
      return verifyAuditChain(limit);
    }),

    rules: action('governance.read', 'List automation rules.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const [rows, total] = await Promise.all([
        db.rows<AutomationRule>(
          db.from('automation_rules').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        ),
        db.count(db.from('automation_rules').select('*', { count: 'exact', head: true })),
      ]);
      return { rules: rows, total, limit, offset };
    }),

    ruleSave: action('governance.write', 'Create or update an automation rule.', async (ctx, input) => {
      const id = optionalString(input, 'id', 80) || bosId('rul');
      const name = stringField(input, 'name', { required: true, max: 120 });
      const trigger = stringField(input, 'triggerEvent', { required: true, max: 80 });
      const conditions = asRecord(input.conditions);
      const actions = Array.isArray(input.actions) ? input.actions : [];
      if (!actions.length) throw badRequest('At least one action is required.');
      for (const raw of actions) {
        const entry = asRecord(raw);
        if (!entry.type) throw badRequest('Every action needs a type.');
      }
      const existing = await db.one<AutomationRule>(
        db.from('automation_rules').select('*').eq('id', id).maybeSingle()
      );
      await db.from('automation_rules').upsert(
        {
          id,
          name,
          trigger_event: trigger,
          conditions,
          actions,
          active: input.active === undefined ? existing?.active !== false : boolField(input, 'active', true),
          updated_at: new Date().toISOString(),
          created_by: existing ? undefined : ctx.actor.email,
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'governance.rule.update' : 'governance.rule.create',
        targetType: 'automation',
        targetId: id,
        before: existing || undefined,
        after: { name, trigger, active: input.active },
        requestId: ctx.requestId,
      });
      return { id, name, trigger };
    }),

    ruleToggle: action('governance.write', 'Enable or disable an automation rule.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const active = boolField(input, 'active', true);
      const existing = await db.one<AutomationRule>(
        db.from('automation_rules').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw badRequest('Rule not found.');
      await db.from('automation_rules').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'governance.rule.toggle',
        targetType: 'automation',
        targetId: id,
        before: { active: existing.active },
        after: { active },
        requestId: ctx.requestId,
      });
      return { id, active };
    }),

    executions: action('governance.read', 'Automation execution history.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 30);
      let query = db.from('workflow_executions').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<any>(query.order('started_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('workflow_executions').select('*', { count: 'exact', head: true })),
      ]);
      return { executions: rows, total, limit, offset };
    }),

    dataQualityRun: action('governance.write', 'Run data-quality checks and persist results.', async (ctx) => {
      const checks: Array<{
        id: string;
        name: string;
        severity: string;
        run: () => Promise<{ failing: number; total: number; samples: unknown[]; message: string }>;
      }> = [
        {
          id: 'products-negative-stock',
          name: 'Products with negative stock',
          severity: 'critical',
          run: async () => {
            const rows = await db.rows<{ id: string; stock: number }>(
              db.from('products').select('id, stock').lt('stock', 0).limit(50)
            );
            const total = await db.count(db.from('products').select('*', { count: 'exact', head: true }));
            return {
              failing: rows.length,
              total,
              samples: rows,
              message: rows.length ? 'Negative stock projections must be corrected.' : 'No negative stock.',
            };
          },
        },
        {
          id: 'orders-missing-totals',
          name: 'Orders without a positive total',
          severity: 'critical',
          run: async () => {
            const rows = await db.rows<any>(
              db
                .from('orders')
                .select('id, number, status, totals')
                .not('status', 'in', '("cancelled","refunded")')
                .or('totals.is.null,totals->>total.is.null')
                .limit(50)
            );
            const total = await db.count(db.from('orders').select('*', { count: 'exact', head: true }));
            return {
              failing: rows.length,
              total,
              samples: rows,
              message: rows.length ? 'Orders are missing totals.' : 'All active orders have totals.',
            };
          },
        },
        {
          id: 'paid-orders-without-payment',
          name: 'Paid orders without a recorded payment',
          severity: 'critical',
          run: async () => {
            const orders = await db.rows<{ id: string; number: string }>(
              db.from('orders').select('id, number').in('status', ['paid', 'packed', 'shipped', 'delivered']).limit(20000)
            );
            const payments = await optionalRows<{ order_id: string; status: string }>(
              db.from('payments').select('order_id, status').limit(50000)
            );
            const paid = new Set(payments.filter((row) => row.status === 'paid').map((row) => row.order_id));
            const failing = orders.filter((order) => !paid.has(order.id)).slice(0, 50);
            return {
              failing: failing.length,
              total: orders.length,
              samples: failing,
              message: failing.length
                ? 'Some fulfilled orders have no recorded payment.'
                : 'Every fulfilled order has a recorded payment.',
            };
          },
        },
        {
          id: 'inventory-projection-mismatch',
          name: 'Product stock vs inventory ledger',
          severity: 'warning',
          run: async () => {
            const balances = await optionalRows<{ product_id: string; on_hand: number }>(
              db.from('inventory_balances').select('product_id, on_hand').limit(50000)
            );
            if (!balances.length) {
              return {
                failing: 0,
                total: 0,
                samples: [],
                message: 'The inventory ledger has no balances to compare.',
              };
            }
            const ledger = new Map<string, number>();
            for (const balance of balances) {
              ledger.set(balance.product_id, (ledger.get(balance.product_id) || 0) + intOrZero(balance.on_hand));
            }
            const products = await db.rows<{ id: string; stock: number; name: unknown }>(
              db.from('products').select('id, stock, name').limit(50000)
            );
            const failing = products
              .filter((product) => intOrZero(product.stock) !== (ledger.get(product.id) || 0))
              .slice(0, 50)
              .map((product) => ({
                id: product.id,
                name: product.name,
                projection: intOrZero(product.stock),
                ledger: ledger.get(product.id) || 0,
              }));
            return {
              failing: failing.length,
              total: products.length,
              samples: failing,
              message: failing.length ? 'Stock projections differ from the ledger.' : 'Stock projections match the ledger.',
            };
          },
        },
        {
          id: 'zero-value-orders',
          name: 'Non-cancelled zero-value orders',
          severity: 'warning',
          run: async () => {
            const rows = await db.rows<any>(
              db
                .from('orders')
                .select('id, number, status, totals')
                .not('status', 'in', '("cancelled","refunded")')
                .limit(20000)
            );
            const failing = rows
              .filter((order) => Math.round(numeric(asRecord(order.totals).total, 0) * 100) <= 0)
              .slice(0, 50);
            return {
              failing: failing.length,
              total: rows.length,
              samples: failing,
              message: failing.length ? 'Zero-value orders need review.' : 'No zero-value orders.',
            };
          },
        },
      ];

      const results: Array<Record<string, unknown>> = [];
      for (const check of checks) {
        await db.from('system_data_quality_checks').upsert(
          {
            id: check.id,
            name: check.name,
            description: check.name,
            severity: check.severity,
            enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        const outcome = await check.run();
        const status = outcome.failing > 0 ? (check.severity === 'critical' ? 'failing' : 'warning') : 'passing';
        await db.from('system_data_quality_results').insert({
          check_id: check.id,
          status,
          failing_count: outcome.failing,
          total_count: outcome.total,
          samples: outcome.samples,
          message: outcome.message,
        });
        results.push({ checkId: check.id, status, ...outcome });
      }

      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'governance.data_quality.run',
        targetType: 'system',
        targetId: 'data-quality',
        after: { results: results.map((result) => ({ checkId: result.checkId, status: result.status })) },
        requestId: ctx.requestId,
      });
      return { results, checkedAt: new Date().toISOString() };
    }),

    changeRequests: action('governance.read', 'List approval requests.', async () => {
      const { loadChangeRequests } = await import('../../controlPlane/operations');
      return loadChangeRequests();
    }),

    changeRequestCreate: action('governance.write', 'Request approval for a sensitive action.', async (ctx, input) => {
      const actionName = stringField(input, 'action', { required: true, max: 160 });
      const targetType = stringField(input, 'targetType', { required: true, max: 80 });
      const reason = stringField(input, 'reason', { required: true, max: 2000 });
      const { createChangeRequest } = await import('../../controlPlane/operations');
      const request = await createChangeRequest(
        {
          action: actionName,
          targetType,
          targetId: optionalString(input, 'targetId', 120),
          reason,
          payload: asRecord(input.payload),
        },
        ctx.actor.email
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'governance.change_request.create',
        targetType: 'change_request',
        targetId: (request as any)?.id,
        after: { actionName, targetType, reason },
        requestId: ctx.requestId,
      });
      return { request };
    }),

    changeRequestDecide: action('governance.write', 'Approve or reject a change request.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const decision = enumField(input, 'decision', ['approved', 'rejected'] as const, { required: true });
      const { decideChangeRequest } = await import('../../controlPlane/operations');
      const request = await decideChangeRequest(id, decision, ctx.actor.email);
      if (!request) throw badRequest('Change request not found or already decided.');
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'governance.change_request.decide',
        targetType: 'change_request',
        targetId: id,
        after: { decision },
        requestId: ctx.requestId,
      });
      return { request };
    }),

    retention: action('governance.read', 'Data retention inventory by table.', async () => {
      const tables = [
        'business_events',
        'events',
        'system_audit_events',
        'inventory_movements',
        'order_events',
        'payments',
        'crm_notes',
        'support_tickets',
      ];
      const counts = await Promise.all(
        tables.map(async (table) => {
          try {
            const count = await db.count(db.from(table).select('*', { count: 'exact', head: true }));
            return { table, rows: count, available: true };
          } catch {
            return { table, rows: 0, available: false };
          }
        })
      );
      return {
        tables: counts,
        policy: 'Retention is enforced by scheduled jobs; this endpoint reports recorded volume only.',
      };
    }),
  },
});
