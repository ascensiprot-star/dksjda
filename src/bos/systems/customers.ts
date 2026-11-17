import { action, defineSystem } from '../core/system';
import { db, intOrZero, asRecord } from '../core/repository';
import {
  cohortRetention,
  customerMetrics,
  isRevenueOrder,
  loadOrders,
  normalizeOrder,
  type LegacyOrder,
} from '../core/metrics';
import { audit } from '../core/audit';
import { stringField, optionalString, pagination, boolField } from '../core/validation';
import { emailField } from '../core/validation';
import { conflict, notFound } from '../core/errors';
import { bosId } from '../core/ids';

interface CustomerRow {
  id: string;
  email: string;
  name?: string | null;
  marketingConsent?: boolean | null;
  totals?: unknown;
  firstSeen?: string | null;
  lastSeen?: string | null;
}

interface NoteRow {
  id: string;
  customer_email: string;
  body: string;
  author_email: string;
  pinned: boolean;
  created_at: string;
}

export const customersSystem = defineSystem({
  id: 'customers',
  index: 11,
  name: 'Customer Intelligence',
  screen: 'customers',
  description: 'RFM segments, cohorts, profiles, notes and consent.',
  actions: {
    segments: action('customer.read', 'RFM segmentation over recorded orders.', async () => {
      const orders = await loadOrders(730);
      const metrics = customerMetrics(orders);
      const groups = new Map<string, { customers: number; revenueMinor: number; orders: number }>();
      for (const customer of metrics) {
        const group = groups.get(customer.segment) || { customers: 0, revenueMinor: 0, orders: 0 };
        group.customers += 1;
        group.revenueMinor += customer.monetaryMinor;
        group.orders += customer.orders;
        groups.set(customer.segment, group);
      }
      return {
        totalCustomers: metrics.length,
        segments: Array.from(groups.entries())
          .map(([segment, value]) => ({ segment, ...value }))
          .sort((a, b) => b.revenueMinor - a.revenueMinor),
        topCustomers: metrics.slice(0, 25),
        basis: 'recorded_orders',
      };
    }),

    cohorts: action('customer.read', 'Monthly acquisition cohorts and repeat purchase.', async () => {
      const orders = await loadOrders(730);
      return { cohorts: cohortRetention(orders) };
    }),

    profile: action('customer.read', 'Customer profile with order history.', async (_ctx, input) => {
      const email = emailField(input);
      const customer = await db.one<CustomerRow>(
        db.from('customers').select('*').eq('email', email).maybeSingle()
      );
      const rows = await db.rows<LegacyOrder>(
        db.from('orders').select('*').eq('customer->>email', email).order('createdAt', {
          ascending: false,
        }).limit(200)
      );
      const metrics = customerMetrics(rows.map(normalizeOrder)).find(
        (entry) => entry.email === email
      );
      const notes = await db.rows<NoteRow>(
        db.from('crm_notes').select('*').eq('customer_email', email).order('created_at', {
          ascending: false,
        }).limit(100)
      );
      return {
        customer: customer || null,
        metrics: metrics || null,
        orders: rows.map(normalizeOrder),
        notes,
        firstSeen: customer?.firstSeen || metrics?.firstOrderAt || null,
      };
    }),

    noteCreate: action('customer.write', 'Append an internal customer note.', async (ctx, input) => {
      const email = emailField(input);
      const body = stringField(input, 'body', { required: true, max: 4000 });
      const pinned = boolField(input, 'pinned', false);
      const note = await db.write<NoteRow>(
        db
          .from('crm_notes')
          .insert({
            id: bosId('note'),
            customer_email: email,
            body,
            author_email: ctx.actor.email,
            pinned,
          })
          .select('*')
          .single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'crm.note.create',
        targetType: 'customer',
        targetId: email,
        after: { noteId: note?.id, pinned },
        requestId: ctx.requestId,
      });
      return { note };
    }),

    noteDelete: action('customer.write', 'Delete an internal customer note.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const existing = await db.one<NoteRow>(
        db.from('crm_notes').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Note not found.');
      await db.from('crm_notes').delete().eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'crm.note.delete',
        targetType: 'customer',
        targetId: existing.customer_email,
        before: existing,
        requestId: ctx.requestId,
      });
      return { deleted: true };
    }),

    tags: action('customer.read', 'List customer tags.', async (_ctx, input) => {
      const email = emailField(input);
      const rows = await db.rows<{ tag: string; created_at: string; created_by: string }>(
        db.from('crm_tags').select('tag, created_at, created_by').eq('customer_email', email)
      );
      return { email, tags: rows };
    }),

    tagAdd: action('customer.write', 'Apply a tag to a customer.', async (ctx, input) => {
      const email = emailField(input);
      const tag = stringField(input, 'tag', { required: true, max: 40 });
      const existing = await db.one(
        db.from('crm_tags').select('tag').eq('customer_email', email).eq('tag', tag).maybeSingle()
      );
      if (existing) throw conflict('This tag is already applied.');
      await db.from('crm_tags').insert({
        id: bosId('tag'),
        customer_email: email,
        tag,
        created_by: ctx.actor.email,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'crm.tag.add',
        targetType: 'customer',
        targetId: email,
        after: { tag },
        requestId: ctx.requestId,
      });
      return { email, tag };
    }),

    tagRemove: action('customer.write', 'Remove a customer tag.', async (ctx, input) => {
      const email = emailField(input);
      const tag = stringField(input, 'tag', { required: true, max: 40 });
      await db.from('crm_tags').delete().eq('customer_email', email).eq('tag', tag);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'crm.tag.remove',
        targetType: 'customer',
        targetId: email,
        before: { tag },
        requestId: ctx.requestId,
      });
      return { email, tag, removed: true };
    }),

    consentUpdate: action('customer.write', 'Record marketing consent.', async (ctx, input) => {
      const email = emailField(input);
      const consent = boolField(input, 'marketingConsent', false);
      const existing = await db.one<CustomerRow>(
        db.from('customers').select('*').eq('email', email).maybeSingle()
      );
      if (!existing) throw notFound('Customer not found.');
      await db
        .from('customers')
        .update({ marketingConsent: consent, lastSeen: new Date().toISOString() })
        .eq('email', email);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'crm.consent.update',
        targetType: 'customer',
        targetId: email,
        before: { marketingConsent: existing.marketingConsent },
        after: { marketingConsent: consent },
        requestId: ctx.requestId,
      });
      return { email, marketingConsent: consent };
    }),

    list: action('customer.read', 'Search customers.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const search = optionalString(input, 'search', 120);
      let query = db.from('customers').select('*', { count: 'exact' });
      if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
      const [rows, total] = await Promise.all([
        db.rows<CustomerRow>(query.order('lastSeen', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('customers').select('*', { count: 'exact', head: true })),
      ]);
      return { customers: rows, total, limit, offset };
    }),

    revenueAtRisk: action('customer.read', 'Customers whose repeat behaviour is declining.', async () => {
      const orders = await loadOrders(730);
      const metrics = customerMetrics(orders).filter((entry) =>
        ['at_risk', 'hibernating', 'lost'].includes(entry.segment)
      );
      return {
        customers: metrics.slice(0, 100),
        total: metrics.length,
        historicalRevenueMinor: metrics.reduce((sum, entry) => sum + entry.monetaryMinor, 0),
        note: 'Historical value is recorded. Future loss is not estimated.',
      };
    }),
  },
});
