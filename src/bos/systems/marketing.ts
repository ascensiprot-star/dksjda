import type { BosAction } from '../core/system';
import { db, intOrZero, optionalRows, windowStartIso } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { stringField, optionalString, enumField, intField, moneyMinorField, isoDateField, pagination } from '../core/validation';

const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'archived'] as const;

interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  status: string;
  budget_minor: number;
  spend_minor: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export const marketingActions: Record<string, BosAction> = {
  campaigns: {
    permission: 'marketing.read',
    description: 'List marketing campaigns.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 30);
      let query = db.from('campaigns').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<CampaignRow>(query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('campaigns').select('*', { count: 'exact', head: true })),
      ]);
      return { campaigns: rows, total, limit, offset };
    },
  },

  campaignSave: {
    permission: 'marketing.write',
    description: 'Create or update a campaign.',
    handler: async (ctx, input) => {
      const id = optionalString(input, 'id', 80) || bosId('cmp');
      const name = stringField(input, 'name', { required: true, max: 160 });
      const channel = stringField(input, 'channel', { required: true, max: 60 });
      const existing = await db.one<CampaignRow>(db.from('campaigns').select('*').eq('id', id).maybeSingle());
      const status =
        input.status === undefined ? existing?.status || 'draft' : enumField(input, 'status', CAMPAIGN_STATUSES);
      const budgetMinor =
        input.budgetMinor === undefined ? intOrZero(existing?.budget_minor) : moneyMinorField(input, 'budgetMinor');
      const spendMinor =
        input.spendMinor === undefined ? intOrZero(existing?.spend_minor) : moneyMinorField(input, 'spendMinor');
      if (spendMinor > budgetMinor && budgetMinor > 0) {
        throw conflict('Recorded spend exceeds the campaign budget.', { budgetMinor, spendMinor });
      }
      const startsAt = isoDateField(input, 'startsAt');
      const endsAt = isoDateField(input, 'endsAt');
      if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
        throw badRequest('Campaign end must be after its start.');
      }
      await db.from('campaigns').upsert(
        {
          id,
          name,
          channel,
          status,
          budget_minor: budgetMinor,
          spend_minor: spendMinor,
          starts_at: startsAt || existing?.starts_at || null,
          ends_at: endsAt || existing?.ends_at || null,
          notes: optionalString(input, 'notes', 2000) || null,
          updated_at: new Date().toISOString(),
          created_by: existing ? undefined : ctx.actor.email,
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'marketing.campaign.update' : 'marketing.campaign.create',
        targetType: 'campaign',
        targetId: id,
        before: existing || undefined,
        after: { name, channel, status, budgetMinor, spendMinor },
        requestId: ctx.requestId,
      });
      return { id, name, channel, status, budgetMinor, spendMinor };
    },
  },

  campaignStats: {
    permission: 'marketing.read',
    description: 'Recorded attribution per campaign.',
    handler: async (_ctx, input) => {
      const days = Math.min(365, Math.max(1, intField(input, 'days', { min: 1, max: 365, fallback: 30 })));
      const [campaigns, touches] = await Promise.all([
        db.rows<CampaignRow>(db.from('campaigns').select('*').limit(2000)),
        optionalRows<{ campaign_id: string; event_type: string; revenue_minor: number }>(
          db
            .from('marketing_touches')
            .select('campaign_id, event_type, revenue_minor')
            .gte('occurred_at', windowStartIso(days))
            .limit(50000)
        ),
      ]);
      return {
        windowDays: days,
        campaigns: campaigns.map((campaign) => {
          const campaignTouches = touches.filter((touch) => touch.campaign_id === campaign.id);
          const revenueMinor = campaignTouches.reduce((sum, touch) => sum + intOrZero(touch.revenue_minor), 0);
          return {
            ...campaign,
            touches: campaignTouches.length,
            conversions: campaignTouches.filter((touch) => touch.event_type === 'purchase').length,
            revenueMinor,
            roas: campaign.spend_minor > 0 ? Math.round((revenueMinor / campaign.spend_minor) * 100) / 100 : null,
          };
        }),
        note: 'ROAS only appears when recorded spend exists for the campaign.',
      };
    },
  },

  recordTouch: {
    permission: 'marketing.write',
    description: 'Record an attributed marketing touch.',
    handler: async (ctx, input) => {
      const campaignId = stringField(input, 'campaignId', { required: true, max: 80 });
      const visitorId = stringField(input, 'visitorId', { required: true, max: 160 });
      const eventType = enumField(input, 'eventType', ['impression', 'click', 'visit', 'add_to_cart', 'purchase'] as const, { required: true });
      const revenueMinor = input.revenueMinor === undefined ? 0 : moneyMinorField(input, 'revenueMinor');
      const campaign = await db.one<CampaignRow>(
        db.from('campaigns').select('id').eq('id', campaignId).maybeSingle()
      );
      if (!campaign) throw badRequest('Campaign not found.');
      const id = bosId('tch');
      await db.from('marketing_touches').insert({
        id,
        campaign_id: campaignId,
        visitor_id: visitorId,
        customer_email: optionalString(input, 'customerEmail', 254)?.toLowerCase() || null,
        event_type: eventType,
        revenue_minor: revenueMinor,
        occurred_at: new Date().toISOString(),
        created_by: ctx.actor.email,
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'marketing.touch.record',
        targetType: 'campaign',
        targetId: campaignId,
        after: { eventType, revenueMinor },
        requestId: ctx.requestId,
      });
      return { id, campaignId, eventType, revenueMinor };
    },
  },

  audience: {
    permission: 'marketing.read',
    description: 'Recorded marketing audience by consent.',
    handler: async () => {
      const rows = await db.rows<{ email: string; marketingConsent: boolean | null; lastSeen?: string | null }>(
        db.from('customers').select('email, marketingConsent, lastSeen').limit(50000)
      );
      const consented = rows.filter((row) => row.marketingConsent === true);
      return {
        totalCustomers: rows.length,
        consented: consented.length,
        consentRatePercent: rows.length ? Math.round((consented.length / rows.length) * 1000) / 10 : null,
        note: 'Only customers with recorded marketing consent are counted.',
      };
    },
  },
};
