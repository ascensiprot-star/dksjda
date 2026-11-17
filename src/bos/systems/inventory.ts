import { action, defineSystem } from '../core/system';
import { db, intOrZero, numeric, optionalRows, windowStartIso } from '../core/repository';
import { audit } from '../core/audit';
import { emitBusinessEvent } from '../core/events';
import { bosId } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { stringField, optionalString, intField, pagination, boolField } from '../core/validation';
import { releaseExpiredReservations } from '../jobs';

interface BalanceRow {
  id: string;
  location_id: string;
  product_id: string;
  sku: string;
  on_hand: number;
  reserved: number;
  committed: number;
  damaged: number;
  returned: number;
  in_transit: number;
  updated_at: string;
}

export const inventorySystem = defineSystem({
  id: 'inventory',
  index: 9,
  name: 'Inventory Ledger',
  screen: 'inventory',
  description: 'Immutable stock ledger, reservations and reconciliation.',
  actions: {
    locations: action('inventory.read', 'List stock locations.', async () => {
      const rows = await db.rows<any>(
        db.from('inventory_locations').select('*').order('code')
      );
      return { locations: rows };
    }),

    balances: action('inventory.read', 'Stock balances by location and SKU.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const productId = optionalString(input, 'productId', 120);
      const lowOnly = boolField(input, 'lowOnly', false);
      let query = db.from('inventory_balances').select('*', { count: 'exact' });
      if (productId) query = query.eq('product_id', productId);
      if (lowOnly) query = query.lte('on_hand', 5);
      const [rows, total] = await Promise.all([
        db.rows<BalanceRow>(query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('inventory_balances').select('*', { count: 'exact', head: true })),
      ]);
      return {
        balances: rows.map((row) => ({
          ...row,
          available: row.on_hand - row.reserved,
        })),
        total,
        limit,
        offset,
      };
    }),

    movements: action('inventory.read', 'Immutable movement history.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const sku = optionalString(input, 'sku', 160);
      const productId = optionalString(input, 'productId', 120);
      const type = optionalString(input, 'type', 40);
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      let query = db.from('inventory_movements').select('*', { count: 'exact' });
      if (sku) query = query.eq('sku', sku);
      if (productId) query = query.eq('product_id', productId);
      if (type) query = query.eq('movement_type', type);
      query = query.gte('created_at', windowStartIso(days));
      const [rows, total] = await Promise.all([
        db.rows<any>(query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('inventory_movements').select('*', { count: 'exact', head: true })),
      ]);
      return { movements: rows, total, limit, offset };
    }),

    adjust: action('inventory.write', 'Adjust stock through the atomic ledger RPC.', async (ctx, input) => {
      const productId = stringField(input, 'productId', { required: true, max: 120 });
      const delta = intField(input, 'delta', { required: true, min: -100000, max: 100000 });
      if (delta === 0) throw badRequest('delta must not be zero.');
      const reason = stringField(input, 'reason', { required: true, max: 200 });
      const locationId = optionalString(input, 'locationId', 80) || 'main';
      const key =
        optionalString(input, 'idempotencyKey', 160) ||
        `adjust:${productId}:${locationId}:${delta}:${Date.now()}`;

      const product = await db.one<{ id: string; nr?: string | null; variants?: unknown }>(
        db.from('products').select('id, nr, variants').eq('id', productId).maybeSingle()
      );
      if (!product) throw badRequest('Product not found.');
      const sku =
        optionalString(input, 'sku', 160) ||
        `${product.id}:${optionalString(input, 'size', 20) || 'default'}`;

      const result = await db.rpc<Record<string, unknown>>('bos_adjust_stock', {
        p_sku: sku,
        p_product_id: productId,
        p_delta: delta,
        p_reason: reason,
        p_actor_id: ctx.actor.id,
        p_actor_email: ctx.actor.email,
        p_idempotency_key: key,
        p_location_id: locationId,
      });

      await emitBusinessEvent({
        type: 'inventory.stock_changed',
        idempotencyKey: `inventory.adjust:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        productId,
        sku,
        payload: { delta, reason, locationId, result },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.adjust',
        targetType: 'product',
        targetId: productId,
        after: { sku, delta, reason, locationId },
        requestId: ctx.requestId,
      });
      return { productId, sku, delta, ...result };
    }),

    reservations: action('inventory.read', 'Active and historical reservations.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 20);
      let query = db.from('stock_reservations').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<any>(query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('stock_reservations').select('*', { count: 'exact', head: true })),
      ]);
      return { reservations: rows, total, limit, offset };
    }),

    reserve: action('inventory.write', 'Reserve stock for an order.', async (ctx, input) => {
      const orderId = stringField(input, 'orderId', { required: true, max: 120 });
      const items = Array.isArray(input.items) ? input.items : [];
      if (!items.length) throw badRequest('items is required.');
      const key = optionalString(input, 'idempotencyKey', 160) || `reserve:${orderId}`;
      const result = await db.rpc('bos_reserve_order_stock', {
        p_order_id: orderId,
        p_items: items,
        p_location_id: optionalString(input, 'locationId', 80) || 'main',
        p_idempotency_key: key,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.reserve',
        targetType: 'order',
        targetId: orderId,
        after: { result },
        requestId: ctx.requestId,
      });
      return { orderId, result };
    }),

    commit: action('inventory.write', 'Commit a reservation after payment.', async (ctx, input) => {
      const orderId = stringField(input, 'orderId', { required: true, max: 120 });
      const key = optionalString(input, 'idempotencyKey', 160) || `commit:${orderId}`;
      const result = await db.rpc('bos_commit_order_stock', {
        p_order_id: orderId,
        p_idempotency_key: key,
      });
      await emitBusinessEvent({
        type: 'payment.completed',
        idempotencyKey: `inventory.commit:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId,
        payload: { result },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.commit',
        targetType: 'order',
        targetId: orderId,
        after: { result },
        requestId: ctx.requestId,
      });
      return { orderId, result };
    }),

    release: action('inventory.write', 'Release a reservation without selling stock.', async (ctx, input) => {
      const orderId = stringField(input, 'orderId', { required: true, max: 120 });
      const reason = optionalString(input, 'reason', 200) || 'released';
      const key = optionalString(input, 'idempotencyKey', 160) || `release:${orderId}:${reason}`;
      const result = await db.rpc('bos_release_order_stock', {
        p_order_id: orderId,
        p_reason: reason,
        p_idempotency_key: key,
      });
      await emitBusinessEvent({
        type: 'inventory.released',
        idempotencyKey: `inventory.release:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId,
        payload: { reason, result },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.release',
        targetType: 'order',
        targetId: orderId,
        after: { reason, result },
        requestId: ctx.requestId,
      });
      return { orderId, result };
    }),

    expireReservations: action('inventory.write', 'Release stock reservations whose checkout window expired.', async (ctx) => {
      const result = await releaseExpiredReservations(500);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.reservation.sweep',
        targetType: 'system',
        targetId: 'stock_reservations',
        after: result,
        requestId: ctx.requestId,
      });
      return result;
    }),

    reconcile: action('inventory.read', 'Compare ledger totals with the product stock projection.', async () => {      const [balances, products] = await Promise.all([
        db.rows<BalanceRow>(db.from('inventory_balances').select('*').limit(50000)),
        db.rows<{ id: string; stock?: number | null; name?: unknown }>(
          db.from('products').select('id, stock, name').limit(50000)
        ),
      ]);
      const ledger = new Map<string, number>();
      for (const balance of balances) {
        ledger.set(balance.product_id, (ledger.get(balance.product_id) || 0) + balance.on_hand);
      }
      const mismatches = products
        .map((product) => ({
          productId: product.id,
          projection: intOrZero(product.stock),
          ledger: ledger.get(product.id) || 0,
        }))
        .filter((row) => row.projection !== row.ledger);
      return {
        checkedProducts: products.length,
        mismatches: mismatches.slice(0, 500),
        mismatchCount: mismatches.length,
      };
    }),

    syncProjection: action('inventory.write', 'Rebuild a product stock projection from the ledger.', async (ctx, input) => {
      const productId = stringField(input, 'productId', { required: true, max: 120 });
      const result = await db.rpc('bos_sync_product_stock', { p_product_id: productId });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.sync_projection',
        targetType: 'product',
        targetId: productId,
        after: { result },
        requestId: ctx.requestId,
      });
      return { productId, result };
    }),

    locationSave: action('inventory.write', 'Create or rename a stock location.', async (ctx, input) => {
      const id = optionalString(input, 'id', 80) || bosId('loc');
      const code = stringField(input, 'code', { required: true, max: 20 }).toUpperCase();
      const name = stringField(input, 'name', { required: true, max: 120 });
      const existing = await db.one<{ id: string }>(
        db.from('inventory_locations').select('id').eq('id', id).maybeSingle()
      );
      if (!existing) {
        const codeOwner = await db.one<{ id: string }>(
          db.from('inventory_locations').select('id').eq('code', code).maybeSingle()
        );
        if (codeOwner) throw conflict('This location code is already used.');
      }
      await db.from('inventory_locations').upsert(
        {
          id,
          code,
          name,
          country: optionalString(input, 'country', 2) || null,
          active: boolField(input, 'active', true),
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'inventory.location.save',
        targetType: 'location',
        targetId: id,
        after: { code, name },
        requestId: ctx.requestId,
      });
      return { id, code, name };
    }),
  },
});
