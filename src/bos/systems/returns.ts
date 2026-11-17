import type { BosAction } from '../core/system';
import { db, optionalRows, intOrZero, asArray, asRecord, numeric } from '../core/repository';
import { audit } from '../core/audit';
import { emitBusinessEvent } from '../core/events';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { stringField, optionalString, intField, enumField, pagination, boolField } from '../core/validation';

const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded', 'cancelled'] as const;
const RETURN_WINDOW_DAYS = 30;

interface ReturnRow {
  id: string;
  order_id: string;
  customer_email: string;
  status: string;
  reason: string;
  requested_at?: string;
  approved_at?: string | null;
  received_at?: string | null;
  refunded_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

interface ReturnLineRow {
  id: string;
  return_id: string;
  product_id: string;
  sku: string;
  quantity: number;
  unit_price_minor: number;
  restock: boolean;
  condition?: string | null;
}

async function loadReturn(id: string): Promise<ReturnRow> {
  return db.required<ReturnRow>(
    db.from('returns').select('*').eq('id', id).maybeSingle(),
    'Return not found.'
  );
}

export const returnsActions: Record<string, BosAction> = {
  returns: {
    permission: 'order.read',
    description: 'List return requests.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 30);
      let query = db.from('returns').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<ReturnRow>(query.order('requested_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('returns').select('*', { count: 'exact', head: true })),
      ]);
      return { returns: rows, total, limit, offset };
    },
  },

  returnGet: {
    permission: 'order.read',
    description: 'Return detail with lines and refund state.',
    handler: async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const record = await loadReturn(id);
      const lines = await optionalRows<ReturnLineRow>(
        db.from('return_lines').select('*').eq('return_id', id)
      );
      const order = await db.one(
        db.from('orders').select('id, number, customer, totals, status').eq('id', record.order_id).maybeSingle()
      );
      return {
        return: record,
        lines,
        order,
        refundableMinor: lines
          .filter((line) => line.restock || line.condition !== 'damaged')
          .reduce((sum, line) => sum + line.unit_price_minor * line.quantity, 0),
      };
    },
  },

  returnCreate: {
    permission: 'order.write',
    description: 'Open a return request inside the return window.',
    handler: async (ctx, input) => {
      const orderId = stringField(input, 'orderId', { required: true, max: 120 });
      const reason = stringField(input, 'reason', { required: true, max: 1000 });
      const items = asArray(input.items).map(asRecord);
      if (!items.length) throw badRequest('Select at least one item to return.');

      const order = await db.one<{
        id: string;
        customer?: unknown;
        status?: string | null;
        items?: unknown;
      }>(db.from('orders').select('id, customer, status, items').eq('id', orderId).maybeSingle());
      if (!order) throw notFound('Order not found.');
      if (String(order.status) !== 'delivered') {
        throw conflict('Only delivered orders can be returned.', { currentStatus: order.status });
      }
      const delivery = await db.one<{ delivered_at?: string | null }>(
        db
          .from('shipments')
          .select('delivered_at')
          .eq('order_id', orderId)
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false })
          .maybeSingle()
      );
      if (delivery?.delivered_at) {
        const days = (Date.now() - Date.parse(delivery.delivered_at)) / 86_400_000;
        if (days > RETURN_WINDOW_DAYS) {
          throw conflict(`The ${RETURN_WINDOW_DAYS}-day return window has closed.`, {
            deliveredAt: delivery.delivered_at,
            days: Math.floor(days),
          });
        }
      }

      const orderItems = asArray(order.items).map(asRecord);
      const email = String(asRecord(order.customer).email || '').toLowerCase();
      const lines = items.map((item) => {
        const productId = String(item.productId || '');
        const size = String(item.size || '');
        const quantity = intField(item, 'quantity', { required: true, min: 1, max: 50 });
        const match = orderItems.find(
          (line) => String(line.productId) === productId && String(line.size) === size
        );
        if (!match) throw badRequest('A return item is not part of this order.');
        const ordered = intOrZero(match.quantity);
        if (quantity > ordered) throw badRequest('Return quantity exceeds the ordered quantity.');
        return {
          productId,
          sku: `${productId}:${size || 'default'}`,
          quantity,
          unitPriceMinor: Math.round(numeric(match.price, 0) * 100),
          restock: true,
          condition: 'unopened',
        };
      });

      const existing = await db.one<ReturnRow>(
        db
          .from('returns')
          .select('*')
          .eq('order_id', orderId)
          .in('status', ['requested', 'approved', 'received'])
          .maybeSingle()
      );
      if (existing) throw conflict('This order already has an open return.', { returnId: existing.id });

      const id = bosId('ret');
      const created = await db.write<ReturnRow>(
        db
          .from('returns')
          .insert({
            id,
            order_id: orderId,
            customer_email: email,
            status: 'requested',
            reason,
            notes: optionalString(input, 'notes', 2000) || null,
            created_by: ctx.actor.email,
          })
          .select('*')
          .single()
      );
      for (const line of lines) {
        await db.from('return_lines').insert({
          id: bosId('rtl'),
          return_id: id,
          ...line,
        });
      }
      await emitBusinessEvent({
        type: 'return.requested',
        idempotencyKey: `return.requested:${id}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId,
        returnId: id,
        customerId: email,
        payload: { reason, lines: lines.length },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'returns.create',
        targetType: 'return',
        targetId: id,
        after: { orderId, reason, lines },
        requestId: ctx.requestId,
      });
      return { return: created, lines };
    },
  },

  returnApprove: {
    permission: 'order.write',
    description: 'Approve or reject a return request.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const decision = enumField(input, 'decision', ['approve', 'reject'] as const, { required: true });
      const record = await loadReturn(id);
      if (record.status !== 'requested') {
        throw conflict('Only a requested return can be decided.', { currentStatus: record.status });
      }
      const now = new Date().toISOString();
      if (decision === 'approve') {
        await db.from('returns').update({ status: 'approved', approved_at: now }).eq('id', id);
        await emitBusinessEvent({
          type: 'return.approved',
          idempotencyKey: `return.approved:${id}`,
          actorType: 'admin',
          actorId: ctx.actor.id,
          actorEmail: ctx.actor.email,
          orderId: record.order_id,
          returnId: id,
          payload: { decision },
        });
      } else {
        await db
          .from('returns')
          .update({
            status: 'rejected',
            notes: [record.notes, optionalString(input, 'note', 1000)].filter(Boolean).join('\n'),
          })
          .eq('id', id);
      }
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'returns.decide',
        targetType: 'return',
        targetId: id,
        before: { status: record.status },
        after: { status: decision === 'approve' ? 'approved' : 'rejected' },
        requestId: ctx.requestId,
      });
      return { id, status: decision === 'approve' ? 'approved' : 'rejected' };
    },
  },

  returnReceive: {
    permission: 'order.write',
    description: 'Record received items and their condition.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const record = await loadReturn(id);
      if (record.status !== 'approved') {
        throw conflict('Approve the return before receiving it.', { currentStatus: record.status });
      }
      const lines = asArray(input.lines).map(asRecord);
      if (!lines.length) throw badRequest('lines is required.');
      const stored = await db.rows<ReturnLineRow>(
        db.from('return_lines').select('*').eq('return_id', id)
      );
      for (const line of lines) {
        const lineId = String(line.id || '');
        const match = stored.find((entry) => entry.id === lineId);
        if (!match) throw badRequest('A return line does not belong to this return.');
        const condition = enumField(line, 'condition', ['unopened', 'worn', 'damaged'] as const, {
          fallback: 'unopened',
        });
        const restock = condition === 'unopened' ? boolField(line, 'restock', true) : false;
        await db.from('return_lines').update({ condition, restock }).eq('id', lineId);
      }
      const now = new Date().toISOString();
      await db.from('returns').update({ status: 'received', received_at: now }).eq('id', id);
      await emitBusinessEvent({
        type: 'return.received',
        idempotencyKey: `return.received:${id}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: record.order_id,
        returnId: id,
        payload: { lines: lines.length },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'returns.receive',
        targetType: 'return',
        targetId: id,
        before: { status: record.status },
        after: { status: 'received' },
        requestId: ctx.requestId,
      });
      return { id, status: 'received' };
    },
  },

  returnRefund: {
    permission: 'order.refund',
    description: 'Issue the refund, restock eligible lines and close the return.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const record = await loadReturn(id);
      if (record.status !== 'received') {
        throw conflict('Only a received return can be refunded.', { currentStatus: record.status });
      }
      const key = optionalString(input, 'idempotencyKey', 160) || `refund:${id}`;
      const result = await db.rpc<Record<string, unknown>>('bos_refund_order', {
        p_return_id: id,
        p_actor_email: ctx.actor.email,
        p_idempotency_key: key,
      });
      await emitBusinessEvent({
        type: 'refund.issued',
        idempotencyKey: `refund.issued:${id}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: record.order_id,
        returnId: id,
        amountMinor: intOrZero(asRecord(result).amountMinor),
        payload: { result },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'returns.refund',
        targetType: 'return',
        targetId: id,
        before: { status: record.status },
        after: { status: 'refunded', result },
        requestId: ctx.requestId,
      });
      return { id, result };
    },
  },

  returnStats: {
    permission: 'order.read',
    description: 'Recorded return rate and reasons.',
    handler: async () => {
      const [returns, orders] = await Promise.all([
        db.rows<ReturnRow>(db.from('returns').select('*').limit(20000)),
        db.rows<{ id: string }>(db.from('orders').select('id').limit(50000)),
      ]);
      const byStatus = new Map<string, number>();
      const byReason = new Map<string, number>();
      for (const record of returns) {
        byStatus.set(record.status, (byStatus.get(record.status) || 0) + 1);
        byReason.set(record.reason, (byReason.get(record.reason) || 0) + 1);
      }
      return {
        orders: orders.length,
        returns: returns.length,
        returnRatePercent: orders.length
          ? Math.round((returns.length / orders.length) * 1000) / 10
          : null,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
        topReasons: Array.from(byReason.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      };
    },
  },
};
