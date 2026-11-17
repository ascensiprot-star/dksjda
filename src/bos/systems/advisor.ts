import { action, defineSystem } from '../core/system';
import { db, intOrZero, numeric, asRecord, asArray } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, notFound } from '../core/errors';
import { stringField, optionalString, enumField, pagination } from '../core/validation';

const INSIGHT_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

interface InsightRow {
  id: string;
  title: string;
  priority: string;
  category: string;
  evidence?: string | null;
  recommendation?: string | null;
  "expectedImpact"?: string | null;
  effort?: string | null;
  "suggestedAction"?: unknown;
  "metricImpact"?: unknown;
  status: string;
  "createdAt"?: string | null;
  "resolvedAt"?: string | null;
}

/** Recorded metric impact, never a simulated forecast. */
function impactScore(metricImpact: unknown): number {
  const record = asRecord(metricImpact);
  let score = 0;
  for (const key of ['revenueMinor', 'revenue', 'profitMinor', 'profit', 'orders', 'units']) {
    score += Math.abs(numeric(record[key], 0));
  }
  return score;
}

export const advisorSystem = defineSystem({
  id: 'advisor',
  index: 16,
  name: 'Strategic Advisor',
  screen: 'advisor',
  description: 'Recorded insights, priorities and decision follow-through.',
  actions: {
    list: action('governance.read', 'List insights.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      const priority = optionalString(input, 'priority', 20);
      let query = db.from('insights').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      if (priority) query = query.eq('priority', priority);
      const [rows, total] = await Promise.all([
        db.rows<InsightRow>(query.order('createdAt', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('insights').select('*', { count: 'exact', head: true })),
      ]);
      return { insights: rows, total, limit, offset };
    }),

    get: action('governance.read', 'Insight detail.', async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const insight = await db.required<InsightRow>(
        db.from('insights').select('*').eq('id', id).maybeSingle(),
        'Insight not found.'
      );
      return { insight };
    }),

    create: action('governance.write', 'Record an evidence-backed insight.', async (ctx, input) => {
      const title = stringField(input, 'title', { required: true, max: 200 });
      const category = stringField(input, 'category', { required: true, max: 80 });
      const evidence = stringField(input, 'evidence', { required: true, max: 4000 });
      const recommendation = stringField(input, 'recommendation', { required: true, max: 4000 });
      const priority = enumField(input, 'priority', PRIORITIES, { fallback: 'medium' });
      const metricImpact = asRecord(input.metricImpact);
      if (!Object.keys(metricImpact).length) {
        throw badRequest('metricImpact must record the measured or expected metric.');
      }
      const insight = await db.write<InsightRow>(
        db
          .from('insights')
          .insert({
            id: bosId('ins'),
            title,
            priority,
            category,
            evidence,
            recommendation,
            expectedImpact: optionalString(input, 'expectedImpact', 1000) || '',
            effort: optionalString(input, 'effort', 40) || 'medium',
            suggestedAction: asRecord(input.suggestedAction),
            metricImpact,
            status: 'open',
            createdAt: new Date().toISOString(),
          })
          .select('*')
          .single()
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'advisor.insight.create',
        targetType: 'insight',
        targetId: insight?.id,
        after: { title, priority, category, metricImpact },
        requestId: ctx.requestId,
      });
      return { insight };
    }),

    updateStatus: action('governance.write', 'Update insight follow-through.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const status = enumField(input, 'status', INSIGHT_STATUSES);
      const existing = await db.one<InsightRow>(
        db.from('insights').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Insight not found.');
      const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
      await db.from('insights').update({ status, resolvedAt }).eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'advisor.insight.status',
        targetType: 'insight',
        targetId: id,
        before: { status: existing.status },
        after: { status, resolvedAt },
        requestId: ctx.requestId,
      });
      return { id, status, resolvedAt };
    }),

    queue: action('governance.read', 'Open insights ordered by recorded impact.', async () => {
      const rows = await db.rows<InsightRow>(
        db
          .from('insights')
          .select('*')
          .in('status', ['open', 'in_progress'])
          .order('createdAt', { ascending: false })
          .limit(1000)
      );
      const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return {
        queue: rows
          .map((row) => ({
            ...row,
            impactScore: impactScore(row.metricImpact),
            priorityWeight: priorityWeight[row.priority] || 0,
          }))
          .sort(
            (a, b) =>
              b.priorityWeight - a.priorityWeight || b.impactScore - a.impactScore
          ),
        note: 'Ranking uses recorded priority and metric impact only.',
      };
    }),

    stats: action('governance.read', 'Insight throughput and recorded impact.', async () => {
      const rows = await db.rows<InsightRow>(db.from('insights').select('*').limit(20000));
      const byStatus = new Map<string, number>();
      const byPriority = new Map<string, number>();
      const byCategory = new Map<string, number>();
      let recordedImpact = 0;
      for (const row of rows) {
        byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
        byPriority.set(row.priority, (byPriority.get(row.priority) || 0) + 1);
        byCategory.set(row.category, (byCategory.get(row.category) || 0) + 1);
        if (row.status === 'resolved') recordedImpact += impactScore(row.metricImpact);
      }
      return {
        total: rows.length,
        resolved: byStatus.get('resolved') || 0,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
        byPriority: Array.from(byPriority.entries()).map(([priority, count]) => ({ priority, count })),
        byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({ category, count })),
        recordedImpactScore: recordedImpact,
      };
    }),

    evidence: action('governance.read', 'Recorded evidence summary for an insight.', async (_ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const insight = await db.required<InsightRow>(
        db.from('insights').select('*').eq('id', id).maybeSingle(),
        'Insight not found.'
      );
      return {
        id,
        evidence: insight.evidence || '',
        recommendation: insight.recommendation || '',
        metricImpact: asRecord(insight.metricImpact),
        suggestedAction: asArray(insight.suggestedAction),
        note: 'This is the recorded evidence attached by the author.',
      };
    }),
  },
});
