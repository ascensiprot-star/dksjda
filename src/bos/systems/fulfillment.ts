import type { BosAction } from '../core/system';
import { db, optionalRows, intOrZero, asRecord } from '../core/repository';
import { audit } from '../core/audit';
import { emitBusinessEvent } from '../core/events';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { stringField, optionalString, isoDateField, pagination } from '../core/validation';

interface ShipmentRow {
  id: string;
  order_id: string;
  carrier: string;
  tracking: string;
  status: string;
  estimated_delivery?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  created_at?: string;
}

async function orderStatus(orderId: string): Promise<string> {
  const order = await db.one<{ status?: string | null }>(
    db.from('orders').select('status').eq('id', orderId).maybeSingle()
  );
  if (!order) throw notFound('Order not found.');
  return String(order.status || 'new');
}

export const fulfillmentActions: Record<string, BosAction> = {
  shipments: {
    permission: 'order.read',
    description: 'List shipments and their events.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      let query = db.from('shipments').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<ShipmentRow>(query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('shipments').select('*', { count: 'exact', head: true })),
      ]);
      return { shipments: rows, total, limit, offset };
    },
  },

  shipmentGet: {
    permission: 'order.read',
    description: 'Shipment detail with tracking events.',
    handler: async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const shipment = await db.required<ShipmentRow>(
        db.from('shipments').select('*').eq('id', id).maybeSingle(),
        'Shipment not found.'
      );
      const events = await optionalRows<any>(
        db.from('shipment_events').select('*').eq('shipment_id', id).order('occurred_at')
      );
      return { shipment, events };
    },
  },

  shipmentCreate: {
    permission: 'order.write',
    description: 'Create a shipment for a paid or packed order.',
    handler: async (ctx, input) => {
      const orderId = stringField(input, 'orderId', { required: true, max: 120 });
      const carrier = stringField(input, 'carrier', { required: true, max: 80 });
      const tracking = stringField(input, 'tracking', { required: true, max: 200 });
      const estimatedDelivery = isoDateField(input, 'estimatedDelivery');
      const status = await orderStatus(orderId);
      if (!['paid', 'packed'].includes(status)) {
        throw conflict(`An order in ${status} cannot be shipped.`, { currentStatus: status });
      }
      const existing = await db.one<ShipmentRow>(
        db
          .from('shipments')
          .select('*')
          .eq('order_id', orderId)
          .eq('tracking', tracking)
          .maybeSingle()
      );
      if (existing) return { shipment: existing, replayed: true };
      const shipment = await db.write<ShipmentRow>(
        db
          .from('shipments')
          .insert({
            id: bosId('shp'),
            order_id: orderId,
            carrier,
            tracking,
            status: 'created',
            estimated_delivery: estimatedDelivery || null,
            created_by: ctx.actor.email,
          })
          .select('*')
          .single()
      );
      await db.from('shipment_events').insert({
        id: bosId('she'),
        shipment_id: shipment?.id,
        status: 'created',
        note: 'Shipment registered.',
        actor_email: ctx.actor.email,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'fulfillment.shipment.create',
        targetType: 'shipment',
        targetId: shipment?.id,
        after: { orderId, carrier, tracking },
        requestId: ctx.requestId,
      });
      return { shipment };
    },
  },

  shipmentDispatch: {
    permission: 'order.write',
    description: 'Mark a shipment dispatched and the order shipped.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const shipment = await db.required<ShipmentRow>(
        db.from('shipments').select('*').eq('id', id).maybeSingle(),
        'Shipment not found.'
      );
      if (shipment.status === 'dispatched' || shipment.status === 'delivered') {
        return { shipment, replayed: true };
      }
      const current = await orderStatus(shipment.order_id);
      if (current === 'packed') {
        await db.rpc('bos_transition_order', {
          p_order_id: shipment.order_id,
          p_from_status: 'packed',
          p_to_status: 'shipped',
          p_actor_email: ctx.actor.email,
          p_note: `Shipment ${shipment.tracking} dispatched.`,
          p_tracking: shipment.tracking,
          p_idempotency_key: `shipment.dispatch:${shipment.id}`,
        });
      } else if (current !== 'shipped') {
        throw conflict('Pack and pay the order before dispatch.', { currentStatus: current });
      }
      const now = new Date().toISOString();
      await db
        .from('shipments')
        .update({ status: 'dispatched', shipped_at: now })
        .eq('id', id);
      await db.from('shipment_events').insert({
        id: bosId('she'),
        shipment_id: id,
        status: 'dispatched',
        note: `Tracking ${shipment.tracking}.`,
        actor_email: ctx.actor.email,
      });
      await emitBusinessEvent({
        type: 'shipment.dispatched',
        idempotencyKey: `shipment.dispatched:${id}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: shipment.order_id,
        payload: { carrier: shipment.carrier, tracking: shipment.tracking },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'fulfillment.shipment.dispatch',
        targetType: 'shipment',
        targetId: id,
        before: { status: shipment.status },
        after: { status: 'dispatched' },
        requestId: ctx.requestId,
      });
      return { id, status: 'dispatched', shippedAt: now };
    },
  },

  shipmentDeliver: {
    permission: 'order.write',
    description: 'Mark a shipment delivered.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const shipment = await db.required<ShipmentRow>(
        db.from('shipments').select('*').eq('id', id).maybeSingle(),
        'Shipment not found.'
      );
      if (shipment.status === 'delivered') return { shipment, replayed: true };
      if (shipment.status !== 'dispatched') {
        throw conflict('A shipment must be dispatched before delivery.', {
          currentStatus: shipment.status,
        });
      }
      const now = new Date().toISOString();
      await db.from('shipments').update({ status: 'delivered', delivered_at: now }).eq('id', id);
      await db.from('shipment_events').insert({
        id: bosId('she'),
        shipment_id: id,
        status: 'delivered',
        note: 'Delivered.',
        actor_email: ctx.actor.email,
      });
      const current = await orderStatus(shipment.order_id);
      if (current === 'shipped') {
        await db.rpc('bos_transition_order', {
          p_order_id: shipment.order_id,
          p_from_status: 'shipped',
          p_to_status: 'delivered',
          p_actor_email: ctx.actor.email,
          p_note: 'Delivery recorded.',
          p_tracking: shipment.tracking,
          p_idempotency_key: `shipment.deliver:${shipment.id}`,
        });
      }
      await emitBusinessEvent({
        type: 'shipment.delivered',
        idempotencyKey: `shipment.delivered:${id}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: shipment.order_id,
        payload: { carrier: shipment.carrier, tracking: shipment.tracking },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'fulfillment.shipment.deliver',
        targetType: 'shipment',
        targetId: id,
        before: { status: shipment.status },
        after: { status: 'delivered' },
        requestId: ctx.requestId,
      });
      return { id, status: 'delivered', deliveredAt: now };
    },
  },

  shipmentUpdate: {
    permission: 'order.write',
    description: 'Update carrier, tracking or estimated delivery.',
    handler: async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const shipment = await db.required<ShipmentRow>(
        db.from('shipments').select('*').eq('id', id).maybeSingle(),
        'Shipment not found.'
      );
      const patch: Record<string, unknown> = {};
      if (input.carrier !== undefined) patch.carrier = stringField(input, 'carrier', { required: true, max: 80 });
      if (input.tracking !== undefined) patch.tracking = stringField(input, 'tracking', { required: true, max: 200 });
      if (input.estimatedDelivery !== undefined) patch.estimated_delivery = isoDateField(input, 'estimatedDelivery') || null;
      if (input.note !== undefined) patch.note = optionalString(input, 'note', 500) || null;
      if (!Object.keys(patch).length) throw badRequest('Nothing to update.');
      await db.from('shipments').update(patch).eq('id', id);
      await db.from('shipment_events').insert({
        id: bosId('she'),
        shipment_id: id,
        status: 'updated',
        note: `Shipment updated: ${Object.keys(patch).join(', ')}.`,
        actor_email: ctx.actor.email,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'fulfillment.shipment.update',
        targetType: 'shipment',
        targetId: id,
        before: shipment,
        after: patch,
        requestId: ctx.requestId,
      });
      return { id, updated: patch };
    },
  },

  shipmentDelays: {
    permission: 'order.read',
    description: 'Shipments past their estimated delivery date.',
    handler: async () => {
      const now = new Date().toISOString();
      const rows = await db.rows<ShipmentRow>(
        db
          .from('shipments')
          .select('*')
          .neq('status', 'delivered')
          .lt('estimated_delivery', now)
          .order('estimated_delivery')
          .limit(500)
      );
      return { delayed: rows, count: rows.length, checkedAt: now };
    },
  },
};
