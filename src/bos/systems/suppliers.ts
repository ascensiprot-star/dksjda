import type { BosAction } from '../core/system';
import { db, intOrZero, asArray, asRecord, optionalRows } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { stringField, optionalString, intField, enumField, pagination, moneyMinorField } from '../core/validation';

interface SupplierRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  lead_time_days?: number | null;
  status?: string | null;
}

const PO_STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'] as const;

export const supplierActions: Record<string, BosAction> = {
  suppliers: {
    permission: 'supplier.read',
    description: 'List suppliers and their lead times.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const [rows, total] = await Promise.all([
        db.rows<SupplierRow>(db.from('suppliers').select('*').order('name').range(offset, offset + limit - 1)),
        db.count(db.from('suppliers').select('*', { count: 'exact', head: true })),
      ]);
      return { suppliers: rows, total, limit, offset };
    },
  },

  supplierSave: {
    permission: 'supplier.write',
    description: 'Create or update a supplier.',
    handler: async (ctx, input) => {
      const id = optionalString(input, 'id', 120) || bosId('sup');
      const name = stringField(input, 'name', { required: true, max: 160 });
      const email = optionalString(input, 'email', 254)?.toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest('Supplier email is invalid.');
      const existing = await db.one<SupplierRow>(db.from('suppliers').select('*').eq('id', id).maybeSingle());
      await db.from('suppliers').upsert(
        {
          id,
          name,
          email: email || null,
          phone: optionalString(input, 'phone', 40) || null,
          country: optionalString(input, 'country', 2) || null,
          lead_time_days: intField(input, 'leadTimeDays', { min: 0, max: 365, fallback: intOrZero(existing?.lead_time_days) }),
          status: input.status === undefined ? existing?.status || 'active' : enumField(input, 'status', ['active', 'paused', 'archived'] as const),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'supplier.update' : 'supplier.create',
        targetType: 'supplier',
        targetId: id,
        after: { name, email },
        requestId: ctx.requestId,
      });
      return { id, name };
    },
  },

  purchaseOrders: {
    permission: 'supplier.read',
    description: 'List purchase orders.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      let query = db.from('purchase_orders').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<any>(query.order('ordered_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('purchase_orders').select('*', { count: 'exact', head: true })),
      ]);
      return { purchaseOrders: rows, total, limit, offset };
    },
  },

  purchaseOrderCreate: {
    permission: 'supplier.write',
    description: 'Create a purchase order with lines.',
    handler: async (ctx, input) => {
      const supplierId = stringField(input, 'supplierId', { required: true, max: 120 });
      const number = stringField(input, 'number', { required: true, max: 80 });
      const expectedAt = optionalString(input, 'expectedAt', 60);
      const lines = asArray(input.lines).map(asRecord);
      if (!lines.length) throw badRequest('A purchase order needs at least one line.');
      const supplier = await db.one<SupplierRow>(db.from('suppliers').select('*').eq('id', supplierId).maybeSingle());
      if (!supplier) throw badRequest('Supplier not found.');
      const duplicate = await db.one(db.from('purchase_orders').select('id').eq('number', number).maybeSingle());
      if (duplicate) throw conflict('This purchase order number already exists.');

      let totalMinor = 0;
      const prepared = lines.map((line) => {
        const productId = String(line.productId || '').trim();
        const sku = String(line.sku || '').trim();
        const quantity = intField(line, 'quantity', { required: true, min: 1, max: 100000 });
        const unitCostMinor = Math.max(0, intOrZero(line.unitCostMinor));
        if (!productId || !sku) throw badRequest('Every line needs a product and SKU.');
        totalMinor += quantity * unitCostMinor;
        return { productId, sku, quantity, unitCostMinor };
      });

      const id = bosId('po');
      await db.from('purchase_orders').insert({
        id,
        supplier_id: supplierId,
        number,
        status: optionalString(input, 'status', 20) || 'ordered',
        ordered_at: new Date().toISOString(),
        expected_at: expectedAt || null,
        currency: 'EUR',
        total_minor: totalMinor,
        notes: optionalString(input, 'notes', 2000) || null,
        created_by: ctx.actor.email,
      });
      for (const line of prepared) {
        await db.from('purchase_order_lines').insert({
          id: bosId('pol'),
          purchase_order_id: id,
          product_id: line.productId,
          sku: line.sku,
          quantity: line.quantity,
          unit_cost_minor: line.unitCostMinor,
          received_quantity: 0,
        });
      }
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'supplier.purchase_order.create',
        targetType: 'purchase_order',
        targetId: id,
        after: { supplierId, number, lines: prepared.length, totalMinor },
        requestId: ctx.requestId,
      });
      return { id, number, totalMinor, lines: prepared.length };
    },
  },

  purchaseOrderReceive: {
    permission: 'inventory.write',
    description: 'Receive goods into stock through the inventory ledger.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const po = await db.one<any>(db.from('purchase_orders').select('*').eq('id', id).maybeSingle());
      if (!po) throw badRequest('Purchase order not found.');
      if (['cancelled', 'received'].includes(String(po.status))) {
        throw conflict('This purchase order cannot receive more goods.', { currentStatus: po.status });
      }
      const lines = await db.rows<any>(
        db.from('purchase_order_lines').select('*').eq('purchase_order_id', id)
      );
      if (!lines.length) throw badRequest('Purchase order has no lines.');
      const received = new Map<string, number>();
      for (const raw of asArray(input.lines).map(asRecord)) {
        received.set(String(raw.lineId || ''), intField(raw, 'quantity', { min: 0, max: 100000 }));
      }
      const receiptId = bosId('grc');
      let receivedUnits = 0;
      for (const line of lines) {
        const quantity = received.get(String(line.id)) || 0;
        if (quantity <= 0) continue;
        const already = intOrZero(line.received_quantity);
        if (already + quantity > intOrZero(line.quantity)) {
          throw badRequest('Received quantity exceeds the ordered quantity.', { lineId: line.id });
        }
        await db.rpc('bos_adjust_stock', {
          p_sku: line.sku,
          p_product_id: line.product_id,
          p_delta: quantity,
          p_reason: `Purchase order ${po.number} receipt`,
          p_actor_id: ctx.actor.id,
          p_actor_email: ctx.actor.email,
          p_idempotency_key: `po-receipt:${receiptId}:${line.id}`,
          p_location_id: optionalString(input, 'locationId', 80) || 'main',
        });
        await db
          .from('purchase_order_lines')
          .update({ received_quantity: already + quantity })
          .eq('id', line.id);
        receivedUnits += quantity;
      }
      if (!receivedUnits) throw badRequest('No quantities were supplied to receive.');
      await db.from('goods_receipts').insert({
        id: receiptId,
        purchase_order_id: id,
        received_at: new Date().toISOString(),
        received_by: ctx.actor.email,
        notes: optionalString(input, 'notes', 1000) || null,
      });
      const updated = await db.rows<any>(
        db.from('purchase_order_lines').select('quantity, received_quantity').eq('purchase_order_id', id)
      );
      const allReceived = updated.every((line) => intOrZero(line.received_quantity) >= intOrZero(line.quantity));
      await db
        .from('purchase_orders')
        .update({
          status: allReceived ? 'received' : 'partially_received',
          received_at: allReceived ? new Date().toISOString() : null,
        })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'supplier.purchase_order.receive',
        targetType: 'purchase_order',
        targetId: id,
        after: { receiptId, receivedUnits, allReceived },
        requestId: ctx.requestId,
      });
      return { id, receiptId, receivedUnits, allReceived };
    },
  },

  supplierPerformance: {
    permission: 'supplier.read',
    description: 'Recorded supplier lead-time and receipt performance.',
    handler: async () => {
      const [suppliers, orders] = await Promise.all([
        db.rows<SupplierRow>(db.from('suppliers').select('*').limit(2000)),
        optionalRows<any>(db.from('purchase_orders').select('*').limit(20000)),
      ]);
      return {
        suppliers: suppliers.map((supplier) => {
          const supplierOrders = orders.filter((order) => order.supplier_id === supplier.id);
          const receivedOrders = supplierOrders.filter((order) => order.status === 'received');
          const onTime = receivedOrders.filter(
            (order) =>
              order.expected_at &&
              order.received_at &&
              Date.parse(order.received_at) <= Date.parse(order.expected_at)
          ).length;
          const measured = receivedOrders.filter((order) => order.expected_at && order.received_at).length;
          return {
            id: supplier.id,
            name: supplier.name,
            leadTimeDays: intOrZero(supplier.lead_time_days),
            orders: supplierOrders.length,
            received: receivedOrders.length,
            onTime,
            onTimePercent: measured ? Math.round((onTime / measured) * 1000) / 10 : null,
          };
        }),
        note: 'On-time percentage only uses purchase orders with both expected and received dates.',
      };
    },
  },
};
