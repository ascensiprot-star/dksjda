import { action, defineSystem } from '../core/system';
import { db, windowStartIso } from '../core/repository';
import { badRequest, notFound } from '../core/errors';
import { stringField, optionalString, enumField, intField, pagination } from '../core/validation';
import {
  acknowledgeAlert,
  createIncident,
  addIncidentEvent,
  createDeployment,
  loadAlerts,
} from '../../controlPlane/visibility';
import { audit } from '../core/audit';

const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
const ENVIRONMENTS = ['production', 'preview', 'development'] as const;

export const controlSystem = defineSystem({
  id: 'control',
  index: 2,
  name: 'Control Plane',
  screen: 'control',
  description: 'Alerts, incidents, deployments and operational state.',
  actions: {
    overview: action('governance.read', 'Operational overview from persisted control data.', async () => {
      const [alerts, incidents, deployments, jobs] = await Promise.all([
        loadAlerts().catch(() => ({ alerts: [] as unknown[] })),
        db.rows<any>(
          db.from('system_incidents').select('*').order('started_at', { ascending: false }).limit(50)
        ),
        db.rows<any>(
          db.from('system_deployments').select('*').order('started_at', { ascending: false }).limit(20)
        ),
        db.rows<any>(
          db.from('system_jobs').select('*').order('updated_at', { ascending: false }).limit(20)
        ),
      ]);
      const alertRows = (alerts as { alerts?: any[] }).alerts || [];
      return {
        alerts: {
          total: alertRows.length,
          firing: alertRows.filter((alert) => alert.status === 'firing').length,
          items: alertRows.slice(0, 50),
        },
        openIncidents: incidents.filter((incident) => incident.status !== 'resolved').length,
        incidents: incidents.slice(0, 20),
        deployments,
        jobs,
      };
    }),

    alerts: action('governance.read', 'Load alerts.', async () => {
      return loadAlerts();
    }),

    acknowledgeAlert: action('governance.write', 'Acknowledge a firing alert.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const alert = await acknowledgeAlert(id);
      if (!alert) throw notFound('Alert not found.');
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'control.alert.acknowledge',
        targetType: 'alert',
        targetId: id,
        requestId: ctx.requestId,
      });
      return { alert };
    }),

    incidents: action('governance.read', 'List incidents.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const status = optionalString(input, 'status', 40);
      let query = db.from('system_incidents').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const [rows, total] = await Promise.all([
        db.rows<any>(query.order('started_at', { ascending: false }).range(offset, offset + limit - 1)),
        db.count(db.from('system_incidents').select('*', { count: 'exact', head: true })),
      ]);
      return { incidents: rows, total, limit, offset };
    }),

    declareIncident: action('governance.write', 'Declare an incident.', async (ctx, input) => {
      const title = stringField(input, 'title', { required: true, max: 200 });
      const summary = optionalString(input, 'summary', 2000) || '';
      const severity = enumField(input, 'severity', SEVERITIES, { fallback: 'SEV3' });
      const serviceIds = Array.isArray(input.serviceIds) ? input.serviceIds.map(String).slice(0, 20) : [];
      const incident = await createIncident({ title, summary, severity, serviceIds, impact: optionalString(input, 'impact', 2000) }, ctx.actor.email);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'control.incident.declare',
        targetType: 'incident',
        targetId: (incident as any)?.id,
        after: { title, severity },
        requestId: ctx.requestId,
      });
      return { incident };
    }),

    incidentNote: action('governance.write', 'Append an incident timeline note.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 120 });
      const message = stringField(input, 'message', { required: true, max: 2000 });
      const event = await addIncidentEvent(id, message, ctx.actor.email);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'control.incident.note',
        targetType: 'incident',
        targetId: id,
        after: { message },
        requestId: ctx.requestId,
      });
      return { event };
    }),

    deployments: action('governance.read', 'Recent deployments.', async (_ctx, input) => {
      const limit = Math.min(100, Math.max(1, intField(input, 'limit', { min: 1, max: 100, fallback: 20 })));
      const rows = await db.rows<any>(
        db.from('system_deployments').select('*').order('started_at', { ascending: false }).limit(limit)
      );
      return { deployments: rows };
    }),

    recordDeployment: action('governance.write', 'Record a deployment.', async (ctx, input) => {
      const version = stringField(input, 'version', { required: true, max: 120 });
      const environment = enumField(input, 'environment', ENVIRONMENTS, { fallback: 'production' });
      const status = enumField(input, 'status', ['started', 'succeeded', 'failed'] as const, {
        fallback: 'succeeded',
      });
      const deployment = await createDeployment(
        {
          version,
          commitSha: optionalString(input, 'commitSha', 80),
          environment,
          status,
        },
        ctx.actor.email
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'control.deployment.record',
        targetType: 'deployment',
        targetId: (deployment as any)?.id,
        after: { version, environment, status },
        requestId: ctx.requestId,
      });
      return { deployment };
    }),

    auditTail: action('governance.read', 'Recent hash-chained audit events.', async (_ctx, input) => {
      const limit = Math.min(200, Math.max(1, intField(input, 'limit', { min: 1, max: 200, fallback: 50 })));
      const rows = await db.rows<any>(
        db
          .from('system_audit_events')
          .select('*')
          .order('occurred_at', { ascending: false })
          .limit(limit)
      );
      return { events: rows };
    }),

    activity: action('governance.read', 'Business events in the last window.', async (_ctx, input) => {
      const days = Math.min(90, Math.max(1, intField(input, 'days', { min: 1, max: 90, fallback: 7 })));
      const rows = await db.rows<any>(
        db
          .from('business_events')
          .select('*')
          .gte('occurred_at', windowStartIso(days))
          .order('occurred_at', { ascending: false })
          .limit(200)
      );
      return { events: rows };
    }),

    jobs: action('governance.read', 'Scheduled jobs and recent runs.', async () => {
      const [jobs, runs] = await Promise.all([
        db.rows<any>(db.from('system_jobs').select('*').order('updated_at', { ascending: false }).limit(50)),
        db.rows<any>(db.from('system_job_runs').select('*').order('started_at', { ascending: false }).limit(50)),
      ]);
      return { jobs, runs };
    }),
  },
});
