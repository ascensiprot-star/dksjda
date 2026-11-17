import { action, defineSystem } from '../core/system';
import { db, windowStartIso } from '../core/repository';
import { buildControlOverview, persistHealthResults, runControlProbes } from '../../controlPlane/probes';
import { audit } from '../core/audit';
import { intField } from '../core/validation';

const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || null;

export const healthSystem = defineSystem({
  id: 'health',
  index: 3,
  name: 'System Health',
  screen: 'health',
  description: 'Live probes, persisted history and SLOs.',
  actions: {
    overview: action('governance.read', 'Run live probes and build the service state.', async (ctx) => {
      const overview = await buildControlOverview({
        baseUrl,
        requestId: ctx.requestId,
      });
      return overview;
    }),

    probes: action('governance.read', 'Run probes and persist results.', async (ctx) => {
      const checks = await runControlProbes({ baseUrl, requestId: ctx.requestId });
      const persisted = await persistHealthResults(checks);
      return { checks, persisted };
    }),

    history: action('governance.read', 'Persisted health results.', async (_ctx, input) => {
      const hours = Math.min(168, Math.max(1, intField(input, 'hours', { min: 1, max: 168, fallback: 24 })));
      const rows = await db.rows<any>(
        db
          .from('system_health_results')
          .select('*')
          .gte('checked_at', new Date(Date.now() - hours * 3_600_000).toISOString())
          .order('checked_at', { ascending: false })
          .limit(1000)
      );
      return { hours, results: rows };
    }),

    slos: action('governance.read', 'SLO definitions and recorded performance.', async () => {
      const defs = await db.rows<any>(db.from('system_slo_definitions').select('*'));
      return { slos: defs, note: 'Targets are configuration; actuals come from persisted health results.' };
    }),

    dataQuality: action('governance.read', 'Recent data-quality results.', async () => {
      const [checks, results] = await Promise.all([
        db.rows<any>(db.from('system_data_quality_checks').select('*')),
        db.rows<any>(
          db
            .from('system_data_quality_results')
            .select('*')
            .gte('checked_at', windowStartIso(7))
            .order('checked_at', { ascending: false })
            .limit(200)
        ),
      ]);
      return { checks, results };
    }),

    runProbe: action('governance.write', 'Re-run probes and persist the result set.', async (ctx) => {
      const checks = await runControlProbes({ baseUrl, requestId: ctx.requestId });
      const persisted = await persistHealthResults(checks);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'health.probes.run',
        targetType: 'system',
        targetId: 'health',
        after: { checks: checks.length, persisted },
        requestId: ctx.requestId,
      });
      return { checks, persisted };
    }),
  },
});
