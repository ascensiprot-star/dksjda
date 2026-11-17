import { action, defineSystem } from '../core/system';
import { db, intOrZero, windowStartIso } from '../core/repository';
import { stringField, moneyMinorField, pagination } from '../core/validation';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest } from '../core/errors';

interface EventRow {
  type: string;
  sessionId: string;
  utm?: Record<string, string> | null;
}

interface ChannelCostRow {
  id: string;
  channel: string;
  month: string;
  spend_minor: number;
  impressions: number;
  clicks: number;
  note?: string | null;
  updated_at?: string;
}

function sourceOf(utm: Record<string, string> | null | undefined): string {
  return utm?.utm_source || utm?.source || 'direct';
}

/**
 * Channels (Atlas) system.
 * Spend is never estimated: a channel only shows ROAS when a recorded cost row
 * exists for the same month as recorded revenue.
 */
export const channelsSystem = defineSystem({
  id: 'channels',
  index: 17,
  name: 'Channel Atlas',
  screen: 'atlas',
  description: 'Recorded acquisition sessions, purchases, spend and ROAS.',
  actions: {
    summary: action('marketing.read', 'Sessions and purchases by recorded source.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      const events = await db.rows<EventRow>(
        db
          .from('events')
          .select('type, sessionId, utm')
          .gte('timestamp', Date.now() - days * 86_400_000)
          .limit(100000)
      );
      const sessions = new Map<string, Set<string>>();
      const purchases = new Map<string, Set<string>>();
      for (const event of events) {
        const source = sourceOf(event.utm);
        if (event.type === 'page_view') {
          const set = sessions.get(source) || new Set<string>();
          set.add(event.sessionId);
          sessions.set(source, set);
        }
        if (event.type === 'purchase') {
          const set = purchases.get(source) || new Set<string>();
          set.add(event.sessionId);
          purchases.set(source, set);
        }
      }
      return {
        windowDays: days,
        channels: Array.from(new Set([...sessions.keys(), ...purchases.keys()]))
          .map((channel) => {
            const sessionCount = sessions.get(channel)?.size || 0;
            const purchaseCount = purchases.get(channel)?.size || 0;
            return {
              channel,
              sessions: sessionCount,
              purchases: purchaseCount,
              conversionPercent: sessionCount
                ? Math.round((purchaseCount / sessionCount) * 1000) / 10
                : null,
            };
          })
          .sort((a, b) => b.sessions - a.sessions),
        basis: 'recorded_events',
      };
    }),

    revenueByChannel: action('marketing.read', 'Recorded revenue grouped by order channel.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 30));
      const rows = await db.rows<{ channel: string | null; amount_minor: number | null; order_id: string }>(
        db
          .from('business_events')
          .select('channel, amount_minor, order_id')
          .eq('type', 'order.created')
          .gte('occurred_at', windowStartIso(days))
          .limit(50000)
      );
      const groups = new Map<string, { orders: number; revenueMinor: number }>();
      for (const row of rows) {
        const channel = row.channel || 'website';
        const group = groups.get(channel) || { orders: 0, revenueMinor: 0 };
        group.orders += 1;
        group.revenueMinor += intOrZero(row.amount_minor);
        groups.set(channel, group);
      }
      return {
        windowDays: days,
        channels: Array.from(groups.entries())
          .map(([channel, value]) => ({ channel, ...value }))
          .sort((a, b) => b.revenueMinor - a.revenueMinor),
      };
    }),

    costs: action('marketing.read', 'Recorded channel spend rows.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const month = stringField(input, 'month', { max: 7 });
      let query = db.from('channel_costs').select('*', { count: 'exact' });
      if (month) query = query.eq('month', month);
      const [rows, total] = await Promise.all([
        db.rows<ChannelCostRow>(
          query.order('month', { ascending: false }).order('channel').range(offset, offset + limit - 1)
        ),
        db.count(
          month
            ? db.from('channel_costs').select('*', { count: 'exact', head: true }).eq('month', month)
            : db.from('channel_costs').select('*', { count: 'exact', head: true })
        ),
      ]);
      return { costs: rows, total, limit, offset };
    }),

    costUpsert: action('marketing.write', 'Record actual channel spend for a month.', async (ctx, input) => {
      const channel = stringField(input, 'channel', { required: true, max: 80 });
      const month = stringField(input, 'month', { required: true, max: 7 });
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw badRequest('month must use YYYY-MM.');
      }
      const spendMinor = moneyMinorField(input, 'spendMinor', { required: true });
      const impressions = intOrZero(input.impressions);
      const clicks = intOrZero(input.clicks);
      const note = stringField(input, 'note', { max: 500 });

      const existing = await db.one<ChannelCostRow>(
        db.from('channel_costs').select('*').eq('channel', channel).eq('month', month).maybeSingle()
      );
      if (existing) {
        await db
          .from('channel_costs')
          .update({
            spend_minor: spendMinor,
            impressions,
            clicks,
            note: note || null,
            updated_at: new Date().toISOString(),
            updated_by: ctx.actor.email,
          })
          .eq('id', existing.id);
      } else {
        await db.from('channel_costs').insert({
          id: bosId('cst'),
          channel,
          month,
          spend_minor: spendMinor,
          impressions,
          clicks,
          note: note || null,
          created_by: ctx.actor.email,
        });
      }
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'marketing.channel_cost.upsert',
        targetType: 'channel',
        targetId: `${channel}:${month}`,
        before: existing,
        after: { spendMinor, impressions, clicks },
        requestId: ctx.requestId,
      });
      return { channel, month, spendMinor, impressions, clicks, recorded: true };
    }),

    performance: action('marketing.read', 'Recorded spend joined to recorded revenue by month.', async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intOrZero(input.days) || 90));
      const rows = await db.rows<{ channel: string | null; amount_minor: number | null; occurred_at: string }>(
        db
          .from('business_events')
          .select('channel, amount_minor, occurred_at')
          .eq('type', 'order.created')
          .gte('occurred_at', windowStartIso(days))
          .limit(50000)
      );
      const revenue = new Map<string, number>();
      for (const row of rows) {
        const channel = row.channel || 'website';
        const month = row.occurred_at.slice(0, 7);
        const key = `${channel}:${month}`;
        revenue.set(key, (revenue.get(key) || 0) + intOrZero(row.amount_minor));
      }
      const costs = await db.rows<ChannelCostRow>(
        db.from('channel_costs').select('*').limit(2000)
      );
      return {
        rows: costs.map((cost) => {
          const key = `${cost.channel}:${cost.month}`;
          const revenueMinor = revenue.get(key) || 0;
          return {
            channel: cost.channel,
            month: cost.month,
            spendMinor: cost.spend_minor,
            impressions: cost.impressions,
            clicks: cost.clicks,
            revenueMinor,
            roas: cost.spend_minor > 0 ? Math.round((revenueMinor / cost.spend_minor) * 100) / 100 : null,
            cpcMinor: cost.clicks > 0 ? Math.round(cost.spend_minor / cost.clicks) : null,
          };
        }),
        note: 'Revenue is only attributed where the order recorded a channel.',
      };
    }),

    recentOrders: action('marketing.read', 'Recent recorded orders with their channel.', async (_ctx, input) => {
      const limit = Math.min(200, Math.max(1, intOrZero(input.limit) || 50));
      const rows = await db.rows(
        db
          .from('business_events')
          .select('order_id, channel, amount_minor, occurred_at, payload')
          .eq('type', 'order.created')
          .order('occurred_at', { ascending: false })
          .limit(limit)
      );
      return { orders: rows };
    }),
  },
});
