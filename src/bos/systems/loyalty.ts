import type { BosAction } from '../core/system';
import { db, intOrZero, optionalRows } from '../core/repository';
import { audit } from '../core/audit';
import { emitBusinessEvent } from '../core/events';
import { badRequest, conflict } from '../core/errors';
import { emailField, intField, stringField, pagination } from '../core/validation';

interface AccountRow {
  customer_email: string;
  points: number;
  lifetime_points: number;
  tier: string;
  updated_at?: string;
}

export const loyaltyActions: Record<string, BosAction> = {
  loyaltyAccounts: {
    permission: 'loyalty.read',
    description: 'List loyalty balances.',
    handler: async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const [rows, total] = await Promise.all([
        db.rows<AccountRow>(db.from('loyalty_accounts').select('*').order('points', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('loyalty_accounts').select('*', { count: 'exact', head: true })),
      ]);
      return { accounts: rows, total, limit, offset };
    },
  },

  loyaltyHistory: {
    permission: 'loyalty.read',
    description: 'Recorded points ledger for a customer.',
    handler: async (_ctx, input) => {
      const email = emailField(input);
      const rows = await optionalRows<any>(
        db.from('loyalty_transactions').select('*').eq('customer_email', email).order('created_at', { ascending: false }).limit(200)
      );
      const account = await db.one<AccountRow>(
        db.from('loyalty_accounts').select('*').eq('customer_email', email).maybeSingle()
      );
      return { email, account: account || null, transactions: rows };
    },
  },

  loyaltyAdjust: {
    permission: 'loyalty.write',
    description: 'Atomically earn or redeem points.',
    handler: async (ctx, input) => {
      const email = emailField(input);
      const points = intField(input, 'points', { required: true, min: -100000, max: 100000 });
      if (points === 0) throw badRequest('points must not be zero.');
      const reason = stringField(input, 'reason', { required: true, max: 200 });
      const key = stringField(input, 'idempotencyKey', { required: true, max: 160 });
      const result = await db.rpc<Record<string, unknown>>('bos_loyalty_adjust', {
        p_customer_email: email,
        p_points: points,
        p_reason: reason,
        p_actor_email: ctx.actor.email,
        p_idempotency_key: key,
      });
      await emitBusinessEvent({
        type: points > 0 ? 'loyalty.points_earned' : 'loyalty.points_redeemed',
        idempotencyKey: `loyalty.adjust:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        customerId: email,
        payload: { points, reason, result },
      });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'loyalty.adjust',
        targetType: 'customer',
        targetId: email,
        after: { points, reason },
        requestId: ctx.requestId,
      });
      return { email, points, result };
    },
  },

  loyaltyRedeem: {
    permission: 'loyalty.write',
    description: 'Redeem points against an order.',
    handler: async (ctx, input) => {
      const email = emailField(input);
      const points = intField(input, 'points', { required: true, min: 1, max: 100000 });
      const orderId = stringField(input, 'orderId', { required: true, max: 120 });
      const order = await db.one(db.from('orders').select('id, status').eq('id', orderId).maybeSingle());
      if (!order) throw badRequest('Order not found.');
      const account = await db.one<AccountRow>(
        db.from('loyalty_accounts').select('*').eq('customer_email', email).maybeSingle()
      );
      if (!account || intOrZero(account.points) < points) {
        throw conflict('Not enough loyalty points.', {
          available: intOrZero(account?.points),
          requested: points,
        });
      }
      const key = `redeem:${orderId}:${points}`;
      const result = await db.rpc('bos_loyalty_adjust', {
        p_customer_email: email,
        p_points: -points,
        p_reason: `Redeemed on order ${orderId}`,
        p_actor_email: ctx.actor.email,
        p_idempotency_key: key,
      });
      await emitBusinessEvent({
        type: 'loyalty.points_redeemed',
        idempotencyKey: `loyalty.redeem:${key}`,
        actorType: 'admin',
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        customerId: email,
        orderId,
        payload: { points, result },
      });
      return { email, orderId, points, result };
    },
  },

  loyaltyReferrals: {
    permission: 'loyalty.read',
    description: 'Recorded referral performance.',
    handler: async () => {
      const rows = await optionalRows<any>(
        db.from('loyalty_referrals').select('*').limit(20000)
      );
      const byStatus = new Map<string, number>();
      for (const row of rows) byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
      return {
        total: rows.length,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
        note: 'Referral revenue is counted only where the referred order is recorded.',
      };
    },
  },
};
