import { action, defineSystem } from '../core/system';
import { db, intOrZero, numeric, asArray, asRecord, windowStartIso } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { evaluateDiscount, type DiscountRule } from '../core/pricingEngine';
import { percentageDiscountMinor } from '../core/money';
import {
  stringField,
  optionalString,
  intField,
  boolField,
  enumField,
  pagination,
  isoDateField,
  moneyMinorField,
} from '../core/validation';

const DISCOUNT_TYPES = ['percent', 'fixed', 'freeShipping'] as const;

interface DiscountRow {
  id: string;
  code: string;
  type: string;
  value: number;
  minSpend: number;
  usageLimit: number;
  used: number;
  startAt?: string | null;
  endAt?: string | null;
  active: boolean;
}

export const pricingSystem = defineSystem({
  id: 'pricing',
  index: 10,
  name: 'Pricing & Promotions',
  screen: 'discounts',
  description: 'Server-evaluated discounts, usage limits and promotion rules.',
  actions: {
    list: action('marketing.read', 'List discount rules.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const [rows, total] = await Promise.all([
        db.rows<DiscountRow>(
          db.from('discounts').select('*').order('code').range(offset, offset + limit - 1)
        ),
        db.count(db.from('discounts').select('*', { count: 'exact', head: true })),
      ]);
      return { discounts: rows, total, limit, offset };
    }),

    save: action('marketing.write', 'Create or update a discount rule.', async (ctx, input) => {
      const id = optionalString(input, 'id', 80) || bosId('dsc');
      const existing = await db.one<DiscountRow>(
        db.from('discounts').select('*').eq('id', id).maybeSingle()
      );
      const code = stringField(input, 'code', { required: !existing, max: 60 })
        .toUpperCase()
        .replace(/\s+/g, '');
      if (code && !/^[A-Z0-9._-]{3,60}$/.test(code)) {
        throw badRequest('Discount code must be 3-60 characters of A-Z, 0-9, dot, dash or underscore.');
      }
      const type =
        input.type === undefined
          ? (existing?.type as string) || 'percent'
          : enumField(input, 'type', DISCOUNT_TYPES);
      const value =
        input.value === undefined ? numeric(existing?.value, 0) : numeric(input.value, -1);
      if (value < 0) throw badRequest('Discount value cannot be negative.');
      if (type === 'percent' && value > 100) throw badRequest('A percentage cannot exceed 100.');
      if (type === 'freeShipping' && value !== 0) throw badRequest('Free-shipping discounts have no value.');
      const minSpendMinor =
        input.minSpendMinor === undefined
          ? Math.round(numeric(existing?.minSpend, 0) * 100)
          : moneyMinorField(input, 'minSpendMinor');
      const usageLimit =
        input.usageLimit === undefined ? intOrZero(existing?.usageLimit) : intField(input, 'usageLimit', { min: 0 });
      const startAt = isoDateField(input, 'startAt');
      const endAt = isoDateField(input, 'endAt');
      if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
        throw badRequest('Discount end must be after its start.');
      }
      if (existing && code && code !== existing.code) {
        const duplicate = await db.one<{ id: string }>(
          db.from('discounts').select('id').eq('code', code).maybeSingle()
        );
        if (duplicate && duplicate.id !== id) throw conflict('This discount code already exists.');
      }

      const patch: Record<string, unknown> = {
        id,
        code: code || existing?.code,
        type,
        value,
        minSpend: minSpendMinor / 100,
        usageLimit,
        active: input.active === undefined ? existing?.active !== false : boolField(input, 'active', true),
      };
      if (input.startAt !== undefined) patch.startAt = startAt || null;
      if (input.endAt !== undefined) patch.endAt = endAt || null;
      if (!existing) patch.used = 0;

      await db.from('discounts').upsert(patch, { onConflict: 'id' });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'pricing.discount.update' : 'pricing.discount.create',
        targetType: 'discount',
        targetId: id,
        before: existing || undefined,
        after: patch,
        requestId: ctx.requestId,
      });
      return { id, code: patch.code, type, value };
    }),

    toggle: action('marketing.write', 'Activate or deactivate a discount.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const active = boolField(input, 'active', true);
      const existing = await db.one<DiscountRow>(
        db.from('discounts').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Discount not found.');
      await db.from('discounts').update({ active }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'pricing.discount.toggle',
        targetType: 'discount',
        targetId: id,
        before: { active: existing.active },
        after: { active },
        requestId: ctx.requestId,
      });
      return { id, active };
    }),

    remove: action('marketing.write', 'Delete an unused discount.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const existing = await db.one<DiscountRow>(
        db.from('discounts').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Discount not found.');
      if (intOrZero(existing.used) > 0) {
        throw conflict('A redeemed discount is part of order history. Deactivate it instead.');
      }
      await db.from('discounts').delete().eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'pricing.discount.delete',
        targetType: 'discount',
        targetId: id,
        before: existing,
        requestId: ctx.requestId,
      });
      return { id, deleted: true };
    }),

    quote: action('marketing.read', 'Server-authoritative discount quote.', async (_ctx, input) => {
      const subtotalMinor = moneyMinorField(input, 'subtotalMinor', { required: true });
      const shippingMinor = moneyMinorField(input, 'shippingMinor');
      const code = stringField(input, 'code', { required: true, max: 60 }).toUpperCase();
      const row = await db.one<DiscountRow>(
        db.from('discounts').select('*').eq('code', code).maybeSingle()
      );
      const rule: DiscountRule | null = row
        ? {
            code: row.code,
            type: row.type,
            value: numeric(row.value),
            minSpendMinor: Math.round(numeric(row.minSpend, 0) * 100),
            usageLimit: intOrZero(row.usageLimit),
            used: intOrZero(row.used),
            startAt: row.startAt || null,
            endAt: row.endAt || null,
            active: row.active !== false,
          }
        : null;
      const evaluation = evaluateDiscount(rule, subtotalMinor, shippingMinor);
      return {
        ...evaluation,
        subtotalMinor,
        shippingMinor: evaluation.freeShipping ? 0 : shippingMinor,
        totalMinor:
          subtotalMinor - evaluation.discountMinor + (evaluation.freeShipping ? 0 : shippingMinor),
        source: row ? 'recorded_rule' : 'unknown_code',
      };
    }),

    usage: action('marketing.read', 'Recorded redemptions from order events.', async (_ctx, input) => {
      const days = Math.min(730, Math.max(1, intOrZero(input.days) || 90));
      const rows = await db.rows<{ payload: Record<string, unknown> | null; amount_minor: number | null }>(
        db
          .from('business_events')
          .select('payload, amount_minor')
          .eq('type', 'order.created')
          .gte('occurred_at', windowStartIso(days))
          .limit(50000)
      );
      const usage = new Map<string, { redemptions: number; revenueMinor: number }>();
      for (const row of rows) {
        const code = String(row.payload?.discountCode || '');
        if (!code) continue;
        const entry = usage.get(code) || { redemptions: 0, revenueMinor: 0 };
        entry.redemptions += 1;
        entry.revenueMinor += intOrZero(row.amount_minor);
        usage.set(code, entry);
      }
      const rules = await db.rows<DiscountRow>(db.from('discounts').select('*').limit(2000));
      return {
        windowDays: days,
        rules: rules.map((rule) => ({
          ...rule,
          recorded: usage.get(rule.code) || { redemptions: 0, revenueMinor: 0 },
          remainingUses:
            intOrZero(rule.usageLimit) > 0
              ? Math.max(0, intOrZero(rule.usageLimit) - intOrZero(rule.used))
              : null,
        })),
      };
    }),

    preview: action('marketing.read', 'Calculate a price without persisting it.', async (_ctx, input) => {
      const value = numeric(input.value, 0);
      const subtotalMinor = moneyMinorField(input, 'subtotalMinor', { required: true });
      const type = enumField(input, 'type', DISCOUNT_TYPES, { fallback: 'percent' });
      return {
        discountMinor:
          type === 'percent' ? percentageDiscountMinor(subtotalMinor, value) : type === 'fixed' ? Math.min(subtotalMinor, Math.round(value * 100)) : 0,
        freeShipping: type === 'freeShipping',
        recorded: false,
      };
    }),

    promotions: action('marketing.read', 'Automatic promotions from the promotions table.', async () => {
      const rows = await db.rows<Record<string, unknown>>(
        db.from('promotions').select('*').order('created_at', { ascending: false }).limit(500)
      );
      return { promotions: rows };
    }),

    promotionSave: action('marketing.write', 'Create or update an automatic promotion.', async (ctx, input) => {
      const id = optionalString(input, 'id', 80) || bosId('prm');
      const name = stringField(input, 'name', { required: true, max: 120 });
      const scope = enumField(input, 'scope', ['cart', 'product', 'collection', 'category'] as const, {
        fallback: 'cart',
      });
      const type = enumField(input, 'type', DISCOUNT_TYPES, { fallback: 'percent' });
      const value = numeric(input.value, -1);
      if (value < 0) throw badRequest('Promotion value cannot be negative.');
      const startsAt = isoDateField(input, 'startsAt', { required: true })!;
      const endsAt = isoDateField(input, 'endsAt');
      if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
        throw badRequest('Promotion end must be after its start.');
      }
      await db.from('promotions').upsert(
        {
          id,
          name,
          scope,
          type,
          value,
          target_ids: asArray(input.targetIds).map(String).slice(0, 200),
          starts_at: startsAt,
          ends_at: endsAt || null,
          active: boolField(input, 'active', true),
          priority: intOrZero(input.priority),
          created_by: ctx.actor.email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'pricing.promotion.save',
        targetType: 'promotion',
        targetId: id,
        after: { name, scope, type, value, startsAt, endsAt },
        requestId: ctx.requestId,
      });
      return { id, name, scope, type, value };
    }),

    evaluateCart: action('marketing.read', 'Evaluate automatic promotions for a cart.', async (_ctx, input) => {
      const items = asArray(input.items).map(asRecord);
      if (!items.length) throw badRequest('items is required.');
      const subtotalMinor = items.reduce(
        (sum, item) => sum + Math.round(numeric(item.unitPriceMinor, 0)) * intOrZero(item.quantity),
        0
      );
      const promotions = await db.rows<Record<string, unknown>>(
        db.from('promotions').select('*').eq('active', true).order('priority', { ascending: false }).limit(100)
      );
      const now = Date.now();
      let best = 0;
      const applied: Array<Record<string, unknown>> = [];
      for (const promotion of promotions) {
        if (promotion.starts_at && Date.parse(String(promotion.starts_at)) > now) continue;
        if (promotion.ends_at && Date.parse(String(promotion.ends_at)) < now) continue;
        if (String(promotion.scope) !== 'cart') continue;
        const type = String(promotion.type);
        const value = numeric(promotion.value);
        const amount =
          type === 'percent'
            ? percentageDiscountMinor(subtotalMinor, value)
            : type === 'fixed'
              ? Math.min(subtotalMinor, Math.round(value * 100))
              : 0;
        if (amount > best) best = amount;
        if (amount > 0) applied.push({ id: promotion.id, name: promotion.name, amountMinor: amount });
      }
      return {
        subtotalMinor,
        automaticDiscountMinor: best,
        applied,
        note: 'Only cart-scoped automatic promotions are evaluated here.',
      };
    }),
  },
});
