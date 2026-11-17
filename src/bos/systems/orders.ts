import { action, defineSystem, type BosActor } from '../core/system';
import { db, intOrZero, numeric, asArray, asRecord, optionalRows, windowStartIso } from '../core/repository';
import { audit } from '../core/audit';
import { emitBusinessEvent } from '../core/events';
import { claimIdempotency, completeIdempotency, failIdempotency } from '../core/idempotency';
import { bosId, orderNumber } from '../core/ids';
import { computeOrderTotals } from '../core/money';
import { evaluateDiscount, type DiscountRule } from '../core/pricingEngine';
import { assertTransition, reservationEffect, nextStatuses, ORDER_STATUSES } from '../core/orderState';
import {
  badRequest,
  conflict,
  notFound,
  unavailable,
} from '../core/errors';
import {
  stringField,
  optionalString,
  intField,
  arrayField,
  enumField,
  pagination,
  emailField,
  isoDateField,
  moneyMinorField,
} from '../core/validation';

interface ProductRow {
  id: string;
  nr?: string | null;
  name?: unknown;
  price?: number | null;
  stock?: number | null;
  status?: string | null;
  sizes?: unknown;
  variants?: unknown;
  images?: unknown;
  vatRate?: number | null;
}

interface OrderRow {
  id: string;
  number?: string | null;
  customer?: unknown;
  items?: unknown;
  totals?: unknown;
  status?: string | null;
  shippingMethod?: string | null;
  tracking?: string | null;
  notes?: string | null;
  timeline?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface SettingsRow {
  shippingRates?: unknown;
  freeShippingThreshold?: number | null;
  vatRate?: number | null;
}

export interface CheckoutItem {
  productId: string;
  size: string;
  quantity: number;
}

export interface CheckoutInput {
  customer: {
    email: string;
    name: string;
    phone?: string;
    address?: { street: string; postalCode: string; city: string; country: string };
  };
  items: CheckoutItem[];
  shippingMethod: string;
  discountCode?: string;
  channel?: string;
  notes?: string;
  paymentMethod?: string;
  idempotencyKey: string;
  /** Analytics consent basis. Checkout itself is a contractual action. */
  consentBasis?: string;
  /** First-touch context recorded with the order event. */
  attribution?: Record<string, unknown>;
}

function namesOf(value: unknown): { fi: string; en: string } {
  if (typeof value === 'string') return { fi: value, en: value };
  const record = asRecord(value);
  return { fi: String(record.fi || record.en || ''), en: String(record.en || record.fi || '') };
}

function imageUrl(product: ProductRow): string | undefined {
  const first = asArray(product.images)[0];
  if (typeof first === 'string') return first;
  const record = asRecord(first);
  return typeof record.url === 'string' ? record.url : undefined;
}

function sizeAllowed(product: ProductRow, size: string): boolean {
  const variants = asArray(product.variants);
  if (variants.length) {
    return variants.some((variant) => String(asRecord(variant).size || '') === size);
  }
  const sizes = asArray(product.sizes);
  if (sizes.length) {
    return sizes.some((entry) =>
      typeof entry === 'string' ? entry === size : String(asRecord(entry).size || '') === size
    );
  }
  return true;
}

/**
 * Validates and prices a checkout entirely on the server.
 * Exported so the public route and the admin order screen share one rulebook.
 */
export async function prepareCheckout(input: CheckoutInput): Promise<Record<string, unknown>> {
  const email = String(input.customer?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest('A valid email is required.');
  const name = String(input.customer?.name || '').trim();
  if (!name) throw badRequest('Customer name is required.');
  const address = input.customer?.address;
  if (address) {
    for (const field of ['street', 'postalCode', 'city', 'country'] as const) {
      if (!String(address[field] || '').trim()) throw badRequest(`Address ${field} is required.`);
    }
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw badRequest('The cart is empty.');
  }
  if (input.items.length > 50) throw badRequest('Too many distinct cart lines.');
  if (!input.idempotencyKey || !/^[A-Za-z0-9._:-]{8,160}$/.test(input.idempotencyKey)) {
    throw badRequest('A stable idempotency key is required.');
  }

  const wanted = new Map<string, { productId: string; size: string; quantity: number }>();
  for (const item of input.items) {
    const productId = String(item.productId || '').trim();
    const size = String(item.size || '').trim();
    if (!productId) throw badRequest('A cart item has no product.');
    if (!size) throw badRequest('Select a size for every item.');
    const quantity = intField(
      { quantity: item.quantity },
      'quantity',
      { required: true, min: 1, max: 20 }
    );
    const key = `${productId}::${size}`;
    const existing = wanted.get(key);
    if (existing) existing.quantity += quantity;
    else wanted.set(key, { productId, size, quantity });
  }

  const productIds = Array.from(new Set(Array.from(wanted.values()).map((item) => item.productId)));
  const products = await db.rows<ProductRow>(
    db.from('products').select('*').in('id', productIds)
  );
  const byId = new Map(products.map((product) => [product.id, product]));
  if (products.length !== productIds.length) {
    throw badRequest('One or more products are no longer available.');
  }

  const settings = await db.one<SettingsRow>(
    db.from('settings').select('shippingRates, freeShippingThreshold, vatRate').eq('id', 'store').maybeSingle()
  );
  const shippingRates = asArray(settings?.shippingRates).map(asRecord);
  const method = String(input.shippingMethod || '').trim();
  if (!method) throw badRequest('A shipping method is required.');
  const normalized = method.toLowerCase();
  const matchesMethod = (entry: Record<string, unknown>) => {
    const name = asRecord(entry.name);
    return [entry.method, entry.id, name.en, name.fi]
      .filter(Boolean)
      .some((value) => String(value).trim().toLowerCase() === normalized);
  };
  let rate = shippingRates.find(matchesMethod);
  if (shippingRates.length > 0 && !rate) {
    throw badRequest('The selected shipping method is not available.', {
      available: shippingRates.map((entry) => entry.method || entry.id).filter(Boolean),
    });
  }
  if (!rate) {
    // The storefront's published delivery tiers, used only until the operator
    // records explicit rates in settings. These are real prices, not estimates.
    const defaults: Record<string, { price: number; freeOver: number }> = {
      'white glove delivery': { price: 12, freeOver: 0 },
      'express courier tracked': { price: 4.9, freeOver: 100 },
      'standard delivery': { price: 4.9, freeOver: 100 },
    };
    const fallback = defaults[normalized];
    if (!fallback) throw badRequest('The selected shipping method is not available.');
    rate = { method, price: fallback.price, freeOver: fallback.freeOver };
  }

  const lines: Array<Record<string, unknown>> = [];
  let subtotalMinor = 0;
  for (const item of wanted.values()) {
    const product = byId.get(item.productId)!;
    if (String(product.status || '') !== 'published') {
      throw conflict('A product in the cart is not published.', { productId: product.id });
    }
    if (!sizeAllowed(product, item.size)) {
      throw badRequest('The selected size is not available for this product.', {
        productId: product.id,
      });
    }
    const available = intOrZero(product.stock);
    if (available < item.quantity) {
      throw conflict('There is not enough stock for this item.', {
        productId: product.id,
        size: item.size,
        available,
        requested: item.quantity,
      });
    }
    const unitPriceMinor = Math.round(numeric(product.price, 0) * 100);
    if (unitPriceMinor <= 0) throw conflict('A product has no valid price.', { productId: product.id });
    subtotalMinor += unitPriceMinor * item.quantity;
    const variant = asArray(product.variants)
      .map(asRecord)
      .find((entry) => String(entry.size || '') === item.size);
    lines.push({
      productId: product.id,
      productNr: product.nr || '',
      productName: namesOf(product.name).en,
      size: item.size,
      quantity: item.quantity,
      unitPriceMinor,
      lineTotalMinor: unitPriceMinor * item.quantity,
      sku: variant?.sku ? String(variant.sku) : `${product.id}:${item.size}`,
      image: imageUrl(product) || null,
    });
  }

  const freeOver = numeric(rate?.freeOver ?? settings?.freeShippingThreshold, 0) * 100;
  let shippingMinor =
    rate && (freeOver <= 0 || subtotalMinor >= freeOver)
      ? 0
      : Math.round(numeric(rate?.price, 0) * 100);

  let discountMinor = 0;
  let discount: Record<string, unknown> | null = null;
  const code = String(input.discountCode || '').trim().toUpperCase();
  if (code) {
    const row = await db.one<Record<string, unknown>>(
      db.from('discounts').select('*').eq('code', code).maybeSingle()
    );
    if (!row) throw badRequest('This discount code does not exist.');
    const rule: DiscountRule = {
      code: String(row.code),
      type: String(row.type),
      value: numeric(row.value),
      minSpendMinor: Math.round(numeric(row.minSpend, 0) * 100),
      usageLimit: intOrZero(row.usageLimit),
      used: intOrZero(row.used),
      startAt: (row.startAt as string) || null,
      endAt: (row.endAt as string) || null,
      active: row.active !== false,
    };
    const evaluation = evaluateDiscount(rule, subtotalMinor, shippingMinor);
    if (!evaluation.valid) {
      throw badRequest(`Discount code rejected: ${evaluation.reason}.`, {
        reason: evaluation.reason,
      });
    }
    discountMinor = evaluation.discountMinor;
    if (evaluation.freeShipping) shippingMinor = 0;
    discount = {
      id: String(row.id),
      code,
      discountMinor,
      freeShipping: evaluation.freeShipping,
    };
  }

  const vatRate = numeric(settings?.vatRate, numeric(products[0]?.vatRate, 24)) || 24;
  const totals = computeOrderTotals({
    lines: lines.map((line) => ({
      quantity: Number(line.quantity),
      unitPriceMinor: Number(line.unitPriceMinor),
    })),
    shippingMinor,
    orderDiscountMinor: discountMinor,
    vatRatePercent: vatRate,
  });

  if (totals.totalMinor < 0) throw badRequest('Order total cannot be negative.');

  return {
    customer: {
      email,
      name,
      phone: String(input.customer.phone || ''),
      address: address || null,
    },
    items: lines,
    totals: {
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      shippingMinor: totals.shippingMinor,
      vatMinor: totals.vatMinor,
      totalMinor: totals.totalMinor,
      currency: totals.currency,
    },
    vatRate,
    shippingMethod: method,
    discount,
    channel: String(input.channel || 'website').slice(0, 60),
    notes: String(input.notes || '').slice(0, 2000),
    paymentMethod: String(input.paymentMethod || 'invoice').slice(0, 40),
    consentBasis: String(input.consentBasis || 'contract').slice(0, 60),
    attribution: asRecord(input.attribution),
  };
}

export interface CreatedOrder {
  orderId: string;
  number: string;
  status: string;
  totals: Record<string, unknown>;
  reservationExpiresAt?: string;
}

/** Atomic checkout: creates order, lines, payment intent, reservation and events. */
export async function createCheckoutOrder(
  input: CheckoutInput,
  actor?: BosActor
): Promise<CreatedOrder> {
  const scope = 'checkout';
  const claim = await claimIdempotency(input.idempotencyKey, scope, input);
  if (claim.replay && claim.response) return claim.response as CreatedOrder;

  try {
    const payload = await prepareCheckout(input);
    const result = await db.rpc<CreatedOrder>('bos_create_order', {
      p_payload: payload,
      p_idempotency_key: input.idempotencyKey,
      p_actor_email: actor?.email || null,
      p_channel: payload.channel,
    });
    if (!result?.orderId) throw unavailable('Checkout did not return an order.');

    await emitBusinessEvent({
      type: 'order.created',
      idempotencyKey: `order.created:${result.orderId}`,
      actorType: actor ? 'admin' : 'customer',
      actorId: actor?.id,
      actorEmail: actor?.email,
      customerId: String(asRecord(payload.customer).email),
      orderId: result.orderId,
      channel: String(payload.channel),
      currency: String(asRecord(payload.totals).currency || 'EUR'),
      amountMinor: Number(asRecord(payload.totals).totalMinor || 0),
      consentBasis: String(payload.consentBasis),
      anonymousId: String(asRecord(payload.attribution).visitorId || '') || undefined,
      sessionId: String(asRecord(payload.attribution).sessionId || '') || undefined,
      campaignId: String(asRecord(asRecord(payload.attribution).utm).campaign || '') || undefined,
      payload: {
        itemCount: asArray(payload.items).length,
        shippingMethod: payload.shippingMethod,
        discountCode: asRecord(payload.discount).code || null,
        attribution: asRecord(payload.attribution),
      },
    });

    if (actor) {
      await audit({
        actorId: actor.id,
        actorEmail: actor.email,
        role: actor.role,
        action: 'commerce.order.create',
        targetType: 'order',
        targetId: result.orderId,
        after: { number: result.number, totalMinor: asRecord(payload.totals).totalMinor },
      });
    }

    await completeIdempotency(input.idempotencyKey, scope, result);
    return result;
  } catch (error) {
    await failIdempotency(input.idempotencyKey, scope, (error as Error).message);
    throw error;
  }
}

function parseCheckoutBody(input: Record<string, unknown>): CheckoutInput {
  const customerRecord = asRecord(input.customer);
  const addressRecord = asRecord(customerRecord.address);
  const items = arrayField(input, 'items', { required: true, max: 50 }).map((raw) => {
    const item = asRecord(raw);
    return {
      productId: String(item.productId || ''),
      size: String(item.size || ''),
      quantity: Number(item.quantity || 0),
    };
  });
  const idempotencyKey =
    optionalString(input, 'idempotencyKey', 160) ||
    optionalString(input, 'idempotency_key', 160) ||
    '';
  return {
    customer: {
      email: String(customerRecord.email || ''),
      name: String(customerRecord.name || ''),
      phone: optionalString(customerRecord, 'phone', 40),
      address: Object.keys(addressRecord).length
        ? {
            street: String(addressRecord.street || ''),
            postalCode: String(addressRecord.postalCode || ''),
            city: String(addressRecord.city || ''),
            country: String(addressRecord.country || ''),
          }
        : undefined,
    },
    items,
    shippingMethod: String(input.shippingMethod || ''),
    discountCode: optionalString(input, 'discountCode', 60),
    channel: optionalString(input, 'channel', 60),
    notes: optionalString(input, 'notes', 2000),
    paymentMethod: optionalString(input, 'paymentMethod', 40),
    idempotencyKey,
    consentBasis: optionalString(input, 'consentBasis', 60),
    attribution: asRecord(input.attribution),
  };
}

export const ordersSystem = defineSystem({
  id: 'orders',
  index: 8,
  name: 'Order Operations',
  screen: 'orders',
  description: 'Order lifecycle, payments, cancellation and audit trail.',
  actions: {
    list: action('order.read', 'List orders with status and search filters.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      const search = optionalString(input, 'search', 120);
      let query = db.from('orders').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      if (search) {
        query = query.or(
          `number.ilike.%${search}%,id.ilike.%${search}%,customer->>email.ilike.%${search}%,customer->>name.ilike.%${search}%`
        );
      }
      const [rows, total] = await Promise.all([
        db.rows<OrderRow>(query.order('createdAt', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(
          status
            ? db.from('orders').select('*', { count: 'exact', head: true }).eq('status', status)
            : db.from('orders').select('*', { count: 'exact', head: true })
        ),
      ]);
      return { orders: rows, total, limit, offset };
    }),

    get: action('order.read', 'Order detail with lines, payments, shipments and events.', async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const order = await db.required<OrderRow>(
        db.from('orders').select('*').eq('id', id).maybeSingle(),
        'Order not found.'
      );
      const [lines, payments, shipments, events, reservations] = await Promise.all([
        optionalRows<any>(db.from('order_lines').select('*').eq('order_id', id).order('created_at')),
        optionalRows<any>(db.from('payments').select('*').eq('order_id', id).order('created_at')),
        optionalRows<any>(db.from('shipments').select('*').eq('order_id', id).order('created_at')),
        optionalRows<any>(db.from('order_events').select('*').eq('order_id', id).order('occurred_at')),
        optionalRows<any>(db.from('stock_reservations').select('*').eq('order_id', id)),
      ]);
      const paidMinor = payments
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + intOrZero(payment.amount_minor), 0);
      const totalMinor = Math.round(numeric(asRecord(order.totals).total, 0) * 100);
      return {
        order,
        lines,
        payments,
        shipments,
        events,
        reservations,
        paymentState: {
          paidMinor,
          totalMinor,
          outstandingMinor: Math.max(0, totalMinor - paidMinor),
          fullyPaid: totalMinor > 0 && paidMinor >= totalMinor,
        },
        nextStatuses: nextStatuses(String(order.status || 'new')),
      };
    }),

    create: action('order.write', 'Create an order from the admin surface.', async (ctx, input) => {
      const parsed = parseCheckoutBody(input);
      const result = await createCheckoutOrder(parsed, ctx.actor);
      return result;
    }),

    transition: action('order.write', 'Move an order through its state machine.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const to = enumField(input, 'status', ORDER_STATUSES);
      const expected = optionalString(input, 'expectedStatus', 40);
      const note = optionalString(input, 'note', 1000) || '';
      const tracking = optionalString(input, 'tracking', 200) || '';
      const key = optionalString(input, 'idempotencyKey', 160) || `transition:${id}:${to}:${Date.now()}`;

      const order = await db.required<OrderRow>(
        db.from('orders').select('*').eq('id', id).maybeSingle(),
        'Order not found.'
      );
      const from = String(order.status || 'new');
      if (expected && expected !== from) {
        throw conflict('The order changed since you loaded it. Reload and try again.', {
          currentStatus: from,
        });
      }
      assertTransition(from, to);
      if (to === 'shipped' && !tracking) throw badRequest('A tracking reference is required to ship.');

      if (to === 'packed' || to === 'shipped') {
        const payments = await optionalRows<{ status: string; amount_minor: number }>(
          db.from('payments').select('status, amount_minor').eq('order_id', id)
        );
        const paidMinor = payments
          .filter((payment) => payment.status === 'paid')
          .reduce((sum, payment) => sum + intOrZero(payment.amount_minor), 0);
        const totalMinor = Math.round(numeric(asRecord(order.totals).total, 0) * 100);
        if (paidMinor < totalMinor) {
          throw conflict('The order is not fully paid.', {
            paidMinor,
            totalMinor,
            outstandingMinor: totalMinor - paidMinor,
          });
        }
      }

      const result = await db.rpc<Record<string, unknown>>('bos_transition_order', {
        p_order_id: id,
        p_from_status: from,
        p_to_status: to,
        p_actor_email: ctx.actor.email,
        p_note: note,
        p_tracking: tracking || null,
        p_idempotency_key: key,
      });

      await emitBusinessEvent({
        type: to === 'cancelled' ? 'order.cancelled' : 'order.status_changed',
        idempotencyKey: `order.status:${id}:${to}:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: id,
        channel: 'admin',
        payload: { from, to, note, reservationEffect: reservationEffect(from, to) },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'commerce.order.transition',
        targetType: 'order',
        targetId: id,
        before: { status: from },
        after: { status: to, tracking: tracking || null },
        requestId: ctx.requestId,
      });
      return { orderId: id, from, to, result };
    }),

    recordPayment: action('finance.write', 'Record a reconciled manual payment with evidence.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const amountMinor = moneyMinorField(input, 'amountMinor', { required: true, min: 1 });
      const method = stringField(input, 'method', { required: true, max: 40 });
      const reference = stringField(input, 'reference', { required: true, max: 200 });
      const receivedAt = isoDateField(input, 'receivedAt', { required: true })!;
      const key = optionalString(input, 'idempotencyKey', 160) || `payment:${id}:${reference}`;

      const order = await db.required<OrderRow>(
        db.from('orders').select('*').eq('id', id).maybeSingle(),
        'Order not found.'
      );
      if (['cancelled', 'refunded'].includes(String(order.status))) {
        throw conflict('A cancelled or refunded order cannot receive a payment.');
      }

      const result = await db.rpc<Record<string, unknown>>('bos_record_payment', {
        p_order_id: id,
        p_amount_minor: amountMinor,
        p_method: method,
        p_reference: reference,
        p_received_at: receivedAt,
        p_actor_email: ctx.actor.email,
        p_idempotency_key: key,
      });

      await emitBusinessEvent({
        type: 'payment.completed',
        idempotencyKey: `payment.completed:${id}:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: id,
        amountMinor,
        channel: 'admin',
        payload: { method, reference, receivedAt },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'commerce.payment.record',
        targetType: 'order',
        targetId: id,
        after: { amountMinor, method, reference, receivedAt },
        requestId: ctx.requestId,
      });
      return { orderId: id, amountMinor, method, reference, result };
    }),

    note: action('order.write', 'Append an internal order note.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const note = stringField(input, 'note', { required: true, max: 2000 });
      await db.rpc('bos_order_note', {
        p_order_id: id,
        p_note: note,
        p_actor_email: ctx.actor.email,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'commerce.order.note',
        targetType: 'order',
        targetId: id,
        after: { note },
        requestId: ctx.requestId,
      });
      return { orderId: id, recorded: true };
    }),

    tracking: action('order.write', 'Record a tracking reference on an order.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const tracking = stringField(input, 'tracking', { required: true, max: 200 });
      const order = await db.required<OrderRow>(
        db.from('orders').select('*').eq('id', id).maybeSingle(),
        'Order not found.'
      );
      await db
        .from('orders')
        .update({ tracking, updatedAt: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'commerce.order.tracking',
        targetType: 'order',
        targetId: id,
        before: { tracking: order.tracking },
        after: { tracking },
        requestId: ctx.requestId,
      });
      return { id, tracking };
    }),

    cancel: action('order.write', 'Cancel an order and release or restock inventory.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const note = optionalString(input, 'note', 1000) || 'Cancelled from the admin.';
      const order = await db.required<OrderRow>(
        db.from('orders').select('*').eq('id', id).maybeSingle(),
        'Order not found.'
      );
      const from = String(order.status || 'new');
      assertTransition(from, 'cancelled');
      const key = optionalString(input, 'idempotencyKey', 160) || `cancel:${id}`;
      await db.rpc('bos_transition_order', {
        p_order_id: id,
        p_from_status: from,
        p_to_status: 'cancelled',
        p_actor_email: ctx.actor.email,
        p_note: note,
        p_tracking: null,
        p_idempotency_key: key,
      });
      await emitBusinessEvent({
        type: 'order.cancelled',
        idempotencyKey: `order.cancelled:${id}:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        orderId: id,
        payload: { from, note },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'commerce.order.cancel',
        targetType: 'order',
        targetId: id,
        before: { status: from },
        after: { status: 'cancelled', note },
        requestId: ctx.requestId,
      });
      return { orderId: id, status: 'cancelled' };
    }),

    metrics: action('order.read', 'Recorded order operations summary.', async () => {
      const rows = await db.rows<OrderRow>(
        db.from('orders').select('id, status, totals, createdAt').gte('createdAt', windowStartIso(30)).limit(20000)
      );
      const byStatus = new Map<string, number>();
      let valueMinor = 0;
      for (const row of rows) {
        byStatus.set(String(row.status || 'new'), (byStatus.get(String(row.status || 'new')) || 0) + 1);
        valueMinor += Math.round(numeric(asRecord(row.totals).total, 0) * 100);
      }
      return {
        windowDays: 30,
        total: rows.length,
        valueMinor,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      };
    }),
  },
});
