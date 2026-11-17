import { ControlProbeDefinition, ControlServiceDefinition } from './types';

/**
 * The service catalogue is intentionally explicit. A control plane that cannot
 * name its services cannot observe them, page an owner, or explain an incident.
 */
export const CONTROL_SERVICES: ControlServiceDefinition[] = [
  {
    id: 'storefront',
    name: 'Storefront',
    description: 'Customer-facing Vite/React application and editorial routes.',
    tier: 1,
    owner: 'House Operations',
    dependencies: ['api', 'postgres', 'auth', 'storage'],
    runbook: 'storefront-down',
  },
  {
    id: 'api',
    name: 'API / BFF',
    description: 'Express API, admin verification, video generation, targets and coach routes.',
    tier: 1,
    owner: 'House Operations',
    dependencies: ['postgres', 'auth'],
    runbook: 'api-degraded',
  },
  {
    id: 'postgres',
    name: 'Postgres',
    description: 'Supabase Postgres: catalogue, orders, customers, audit and control metadata.',
    tier: 1,
    owner: 'House Operations',
    dependencies: [],
    runbook: 'postgres-down',
  },
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Supabase Auth: operator sign-in, sessions and JWT verification.',
    tier: 1,
    owner: 'House Operations',
    dependencies: [],
    runbook: 'auth-down',
  },
  {
    id: 'storage',
    name: 'Media Storage',
    description: 'Supabase Storage: editorial media, campaign films and uploaded assets.',
    tier: 1,
    owner: 'House Operations',
    dependencies: [],
    runbook: 'storage-down',
  },
  {
    id: 'realtime',
    name: 'Realtime',
    description: 'Supabase Realtime: live admin and storefront subscriptions.',
    tier: 2,
    owner: 'House Operations',
    dependencies: ['postgres'],
    runbook: 'realtime-degraded',
  },
  {
    id: 'telemetry',
    name: 'Telemetry',
    description: 'Consent-based event ingestion and daily aggregation.',
    tier: 2,
    owner: 'House Operations',
    dependencies: ['postgres'],
    runbook: 'telemetry-stalled',
  },
  {
    id: 'video',
    name: 'Video Generation',
    description: 'Gemini/Veo video generation and download proxy.',
    tier: 2,
    owner: 'House Operations',
    dependencies: ['api'],
    runbook: 'video-generation-failed',
  },
  {
    id: 'admin',
    name: 'Admin Control Plane',
    description: 'Dark console, privileged API access and operator audit trail.',
    tier: 1,
    owner: 'House Operations',
    dependencies: ['api', 'auth', 'postgres'],
    runbook: 'admin-access-lost',
  },
];

export const CONTROL_PROBES: ControlProbeDefinition[] = [
  {
    id: 'api.self',
    serviceId: 'api',
    name: 'API process responding',
    kind: 'http',
    required: true,
  },
  {
    id: 'postgres.reachability',
    serviceId: 'postgres',
    name: 'Postgres reachability',
    kind: 'sql',
    required: true,
  },
  {
    id: 'auth.health',
    serviceId: 'auth',
    name: 'Auth health endpoint',
    kind: 'auth',
    required: true,
  },
  {
    id: 'storage.list',
    serviceId: 'storage',
    name: 'Storage bucket access',
    kind: 'storage',
    required: true,
  },
  {
    id: 'realtime.endpoint',
    serviceId: 'realtime',
    name: 'Realtime endpoint',
    kind: 'http',
    required: false,
  },
  {
    id: 'storefront.manifest',
    serviceId: 'storefront',
    name: 'Published editorial manifest',
    kind: 'manifest',
    required: true,
  },
  {
    id: 'telemetry.freshness',
    serviceId: 'telemetry',
    name: 'Event ingestion freshness',
    kind: 'sql',
    required: false,
  },
  {
    id: 'video.config',
    serviceId: 'video',
    name: 'Video provider configuration',
    kind: 'config',
    required: false,
  },
  {
    id: 'admin.privilege',
    serviceId: 'admin',
    name: 'Privileged API configuration',
    kind: 'config',
    required: true,
  },
];

export const CONTROL_SERVICE_BY_ID = new Map(
  CONTROL_SERVICES.map((service) => [service.id, service])
);

export const CONTROL_PROBES_BY_SERVICE = new Map<string, ControlProbeDefinition[]>();
for (const probe of CONTROL_PROBES) {
  const current = CONTROL_PROBES_BY_SERVICE.get(probe.serviceId) || [];
  current.push(probe);
  CONTROL_PROBES_BY_SERVICE.set(probe.serviceId, current);
}
