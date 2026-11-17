import { action, defineSystem } from '../core/system';
import { db, intOrZero, optionalRows } from '../core/repository';
import { audit } from '../core/audit';
import { emitBusinessEvent } from '../core/events';
import { bosId } from '../core/ids';
import { conflict, badRequest } from '../core/errors';
import { stringField, optionalString, pagination, emailField } from '../core/validation';

interface WaitlistRow {
  id: string;
  email: string;
  source?: string | null;
  dropId?: string | null;
  createdAt?: string | null;
  invited?: boolean | null;
}

export const waitlistSystem = defineSystem({
  id: 'waitlist',
  index: 12,
  name: 'Waitlist',
  screen: 'waitlist',
  description: 'Drop demand capture, invitations and conversion.',
  actions: {
    list: action('customer.read', 'List waitlist entries.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const search = optionalString(input, 'search', 120);
      const dropId = optionalString(input, 'dropId', 120);
      let query = db.from('waitlist').select('*', { count: 'exact' });
      if (search) query = query.ilike('email', `%${search}%`);
      if (dropId) query = query.eq('dropId', dropId);
      const [rows, total] = await Promise.all([
        db.rows<WaitlistRow>(query.order('createdAt', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('waitlist').select('*', { count: 'exact', head: true })),
      ]);
      return { entries: rows, total, limit, offset };
    }),

    stats: action('customer.read', 'Recorded waitlist demand and invitation state.', async () => {
      const [rows, orders] = await Promise.all([
        db.rows<WaitlistRow>(db.from('waitlist').select('*').limit(50000)),
        optionalRows<{ customer: unknown }>(db.from('orders').select('customer').limit(50000)),
      ]);
      const orderEmails = new Set(
        orders
          .map((order) =>
            String((order.customer as Record<string, unknown>)?.email || '').toLowerCase()
          )
          .filter(Boolean)
      );
      const bySource = new Map<string, number>();
      const byDrop = new Map<string, number>();
      for (const entry of rows) {
        bySource.set(entry.source || 'unknown', (bySource.get(entry.source || 'unknown') || 0) + 1);
        if (entry.dropId) byDrop.set(entry.dropId, (byDrop.get(entry.dropId) || 0) + 1);
      }
      const converted = rows.filter((entry) =>
        orderEmails.has(String(entry.email || '').toLowerCase())
      ).length;
      return {
        total: rows.length,
        invited: rows.filter((entry) => entry.invited).length,
        converted,
        conversionPercent: rows.length ? Math.round((converted / rows.length) * 1000) / 10 : null,
        bySource: Array.from(bySource.entries()).map(([source, count]) => ({ source, count })),
        byDrop: Array.from(byDrop.entries()).map(([dropId, count]) => ({ dropId, count })),
        basis: 'recorded_waitlist_and_orders',
      };
    }),

    add: action('customer.write', 'Add an entry from the admin surface.', async (ctx, input) => {
      const email = emailField(input);
      const source = optionalString(input, 'source', 60) || 'admin';
      const dropId = optionalString(input, 'dropId', 120) || null;
      const existing = await db.one<WaitlistRow>(
        db.from('waitlist').select('*').eq('email', email).eq('dropId', dropId || '').maybeSingle()
      );
      if (existing) throw conflict('This email is already on the waitlist for this drop.');
      const entry = await db.write<WaitlistRow>(
        db
          .from('waitlist')
          .insert({
            id: bosId('wai'),
            email,
            source,
            dropId,
            createdAt: new Date().toISOString(),
            invited: false,
          })
          .select('*')
          .single()
      );
      await emitBusinessEvent({
        type: 'customer.registered',
        idempotencyKey: `waitlist.add:${entry?.id}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        customerId: email,
        payload: { source, dropId, kind: 'waitlist' },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'waitlist.add',
        targetType: 'waitlist',
        targetId: entry?.id,
        after: { email, source, dropId },
        requestId: ctx.requestId,
      });
      return { entry };
    }),

    invite: action('customer.write', 'Mark an entry invited.', async (ctx, input) => {
      const ids = Array.isArray(input.ids) ? input.ids.map(String).slice(0, 200) : [];
      if (!ids.length) throw badRequest('ids is required.');
      const rows = await db.rows<WaitlistRow>(
        db.from('waitlist').select('*').in('id', ids)
      );
      if (!rows.length) throw badRequest('No matching waitlist entries.');
      const { error } = await db.from('waitlist').update({ invited: true }).in('id', ids);
      if (error) throw badRequest('Invitation update failed.');
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'waitlist.invite',
        targetType: 'waitlist',
        targetId: ids.join(',').slice(0, 200),
        after: { invited: ids.length },
        requestId: ctx.requestId,
      });
      return { invited: ids.length };
    }),

    remove: action('customer.write', 'Remove a waitlist entry.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const existing = await db.one<WaitlistRow>(
        db.from('waitlist').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw badRequest('Waitlist entry not found.');
      await db.from('waitlist').delete().eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'waitlist.remove',
        targetType: 'waitlist',
        targetId: id,
        before: existing,
        requestId: ctx.requestId,
      });
      return { id, removed: true };
    }),

    drops: action('customer.read', 'Demand grouped by drop and collection.', async () => {
      const [entries, collections] = await Promise.all([
        db.rows<WaitlistRow>(db.from('waitlist').select('*').limit(50000)),
        db.rows<{ id: string; name: unknown; status: string | null }>(
          db.from('collections').select('id, name, status').limit(1000)
        ),
      ]);
      const counts = new Map<string, number>();
      for (const entry of entries) {
        if (entry.dropId) counts.set(entry.dropId, (counts.get(entry.dropId) || 0) + 1);
      }
      return {
        drops: collections
          .map((collection) => ({
            id: collection.id,
            name: collection.name,
            status: collection.status,
            waitlist: counts.get(collection.id) || 0,
          }))
          .sort((a, b) => b.waitlist - a.waitlist),
        unassigned: entries.filter((entry) => !entry.dropId).length,
      };
    }),
  },
});
