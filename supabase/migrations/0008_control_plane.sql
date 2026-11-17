-- ============================================================================
-- Migration 0008 — Control Plane (Phase 0)
--
-- Adds the minimum durable metadata required to observe and operate Zejesh:
-- services, health checks/results, incidents, alerts, deployments, jobs and an
-- append-only administrative audit trail.
--
-- High-cardinality logs and traces belong in the telemetry backend, not here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Service catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.system_services (
  id            text primary key,
  name          text not null,
  description   text not null default '',
  tier          integer not null default 2 check (tier between 1 and 3),
  owner         text not null default 'House Operations',
  repository    text,
  runbook_url   text,
  dependencies  jsonb not null default '[]'::jsonb,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.system_health_checks (
  id                text primary key,
  service_id        text not null references public.system_services(id) on delete cascade,
  name              text not null,
  kind              text not null default 'http',
  config            jsonb not null default '{}'::jsonb,
  interval_seconds  integer not null default 60,
  timeout_ms        integer not null default 3000,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.system_health_results (
  id          bigserial primary key,
  check_id    text not null,
  service_id  text not null,
  status      text not null,
  latency_ms  integer,
  status_code integer,
  message     text not null default '',
  details     jsonb not null default '{}'::jsonb,
  checked_at  timestamptz not null default now()
);

create index if not exists system_health_results_check_time_idx
  on public.system_health_results (check_id, checked_at desc);
create index if not exists system_health_results_service_time_idx
  on public.system_health_results (service_id, checked_at desc);

-- ---------------------------------------------------------------------------
-- Incidents and alerts
-- ---------------------------------------------------------------------------
create table if not exists public.system_incidents (
  id               text primary key,
  title            text not null,
  summary          text not null default '',
  severity         text not null default 'SEV3',
  status           text not null default 'investigating',
  service_ids      jsonb not null default '[]'::jsonb,
  commander        text,
  impact           text not null default '',
  started_at       timestamptz not null default now(),
  acknowledged_at  timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists system_incidents_status_time_idx
  on public.system_incidents (status, started_at desc);

create table if not exists public.system_incident_events (
  id           bigserial primary key,
  incident_id  text not null references public.system_incidents(id) on delete cascade,
  event_type   text not null,
  actor        text,
  message      text not null default '',
  details      jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);

create index if not exists system_incident_events_incident_time_idx
  on public.system_incident_events (incident_id, occurred_at desc);

create table if not exists public.system_alerts (
  id               text primary key,
  rule_id          text,
  service_id       text,
  severity         text not null default 'warning',
  status           text not null default 'firing',
  title            text not null,
  message          text not null default '',
  dedupe_key       text,
  fired_at         timestamptz not null default now(),
  acknowledged_at  timestamptz,
  resolved_at      timestamptz,
  details          jsonb not null default '{}'::jsonb
);

create index if not exists system_alerts_status_time_idx
  on public.system_alerts (status, fired_at desc);
create unique index if not exists system_alerts_dedupe_open_idx
  on public.system_alerts (dedupe_key)
  where status <> 'resolved' and dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Releases and jobs
-- ---------------------------------------------------------------------------
create table if not exists public.system_deployments (
  id            text primary key,
  environment   text not null default 'production',
  version       text not null,
  commit_sha    text,
  actor         text,
  status        text not null default 'started',
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  rollback_of   text,
  details       jsonb not null default '{}'::jsonb
);

create index if not exists system_deployments_env_time_idx
  on public.system_deployments (environment, started_at desc);

create table if not exists public.system_jobs (
  id               text primary key,
  name             text not null,
  service_id       text references public.system_services(id) on delete set null,
  schedule         text,
  timeout_seconds  integer not null default 300,
  max_attempts     integer not null default 3,
  enabled          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.system_job_runs (
  id            text primary key,
  job_id        text not null references public.system_jobs(id) on delete cascade,
  status        text not null default 'started',
  attempt       integer not null default 1,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  duration_ms   integer,
  error         text,
  trace_id      text,
  details       jsonb not null default '{}'::jsonb
);

create index if not exists system_job_runs_status_time_idx
  on public.system_job_runs (status, started_at desc);
create index if not exists system_job_runs_job_time_idx
  on public.system_job_runs (job_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Append-only administrative audit chain
-- ---------------------------------------------------------------------------
create table if not exists public.system_audit_events (
  id             text primary key,
  occurred_at    timestamptz not null default now(),
  actor_id       text,
  actor_email    text,
  role           text,
  action         text not null,
  target_type    text,
  target_id      text,
  before         jsonb,
  after          jsonb,
  request_id     text,
  trace_id       text,
  approval_id    text,
  previous_hash  text,
  hash           text not null
);

create index if not exists system_audit_events_time_idx
  on public.system_audit_events (occurred_at desc);
create index if not exists system_audit_events_actor_time_idx
  on public.system_audit_events (actor_email, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Seed the service catalogue. This is configuration, not commerce data.
-- ---------------------------------------------------------------------------
insert into public.system_services (id, name, description, tier, owner, dependencies, runbook_url)
values
  ('storefront', 'Storefront', 'Customer-facing application and editorial routes.', 1, 'House Operations', '["api","postgres","auth","storage"]'::jsonb, null),
  ('api', 'API / BFF', 'Express API, admin verification, video generation and operations routes.', 1, 'House Operations', '["postgres","auth"]'::jsonb, null),
  ('postgres', 'Postgres', 'Supabase Postgres system of record.', 1, 'House Operations', '[]'::jsonb, null),
  ('auth', 'Authentication', 'Supabase Auth sessions and JWT verification.', 1, 'House Operations', '[]'::jsonb, null),
  ('storage', 'Media Storage', 'Supabase Storage media and campaign films.', 1, 'House Operations', '[]'::jsonb, null),
  ('realtime', 'Realtime', 'Supabase Realtime subscriptions.', 2, 'House Operations', '["postgres"]'::jsonb, null),
  ('telemetry', 'Telemetry', 'Consent-based event ingestion and aggregation.', 2, 'House Operations', '["postgres"]'::jsonb, null),
  ('video', 'Video Generation', 'Gemini/Veo generation and download proxy.', 2, 'House Operations', '["api"]'::jsonb, null),
  ('admin', 'Admin Control Plane', 'Dark console, privileged access and audit trail.', 1, 'House Operations', '["api","auth","postgres"]'::jsonb, null)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  tier = excluded.tier,
  owner = excluded.owner,
  dependencies = excluded.dependencies,
  updated_at = now();

insert into public.system_health_checks (id, service_id, name, kind, interval_seconds, timeout_ms)
values
  ('api.self', 'api', 'API process responding', 'http', 30, 3000),
  ('postgres.reachability', 'postgres', 'Postgres reachability', 'sql', 60, 3000),
  ('auth.health', 'auth', 'Auth health endpoint', 'auth', 300, 3000),
  ('storage.list', 'storage', 'Storage bucket access', 'storage', 300, 3000),
  ('realtime.endpoint', 'realtime', 'Realtime endpoint', 'http', 300, 3000),
  ('storefront.manifest', 'storefront', 'Published editorial manifest', 'manifest', 300, 3000),
  ('telemetry.freshness', 'telemetry', 'Event ingestion freshness', 'sql', 900, 3000),
  ('video.config', 'video', 'Video provider configuration', 'config', 900, 3000),
  ('admin.privilege', 'admin', 'Privileged API configuration', 'config', 300, 3000)
on conflict (id) do update set
  service_id = excluded.service_id,
  name = excluded.name,
  kind = excluded.kind,
  interval_seconds = excluded.interval_seconds,
  timeout_ms = excluded.timeout_ms,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Row level security. Control metadata is operator-only.
-- ---------------------------------------------------------------------------
alter table public.system_services enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.system_health_results enable row level security;
alter table public.system_incidents enable row level security;
alter table public.system_incident_events enable row level security;
alter table public.system_alerts enable row level security;
alter table public.system_deployments enable row level security;
alter table public.system_jobs enable row level security;
alter table public.system_job_runs enable row level security;
alter table public.system_audit_events enable row level security;

drop policy if exists control_read on public.system_services;
create policy control_read on public.system_services for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_services;
create policy control_write on public.system_services for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_health_checks;
create policy control_read on public.system_health_checks for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_health_checks;
create policy control_write on public.system_health_checks for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_health_results;
create policy control_read on public.system_health_results for select to authenticated using (public.is_admin());
drop policy if exists control_insert on public.system_health_results;
create policy control_insert on public.system_health_results for insert to authenticated with check (public.can_write());

drop policy if exists control_read on public.system_incidents;
create policy control_read on public.system_incidents for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_incidents;
create policy control_write on public.system_incidents for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_incident_events;
create policy control_read on public.system_incident_events for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_incident_events;
create policy control_write on public.system_incident_events for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_alerts;
create policy control_read on public.system_alerts for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_alerts;
create policy control_write on public.system_alerts for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_deployments;
create policy control_read on public.system_deployments for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_deployments;
create policy control_write on public.system_deployments for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_jobs;
create policy control_read on public.system_jobs for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_jobs;
create policy control_write on public.system_jobs for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_job_runs;
create policy control_read on public.system_job_runs for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_job_runs;
create policy control_write on public.system_job_runs for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_audit_events;
create policy control_read on public.system_audit_events for select to authenticated using (public.is_admin());
drop policy if exists control_insert on public.system_audit_events;
create policy control_insert on public.system_audit_events for insert to authenticated with check (public.can_write());

-- Audit rows are append-only for authenticated operators.
revoke update, delete on public.system_audit_events from authenticated;
revoke update, delete on public.system_health_results from authenticated;

grant select, insert, update, delete on public.system_services to authenticated;
grant select, insert, update, delete on public.system_health_checks to authenticated;
grant select, insert on public.system_health_results to authenticated;
grant select, insert, update, delete on public.system_incidents to authenticated;
grant select, insert, update, delete on public.system_incident_events to authenticated;
grant select, insert, update, delete on public.system_alerts to authenticated;
grant select, insert, update, delete on public.system_deployments to authenticated;
grant select, insert, update, delete on public.system_jobs to authenticated;
grant select, insert, update, delete on public.system_job_runs to authenticated;
grant select, insert on public.system_audit_events to authenticated;
grant usage, select on sequence public.system_health_results_id_seq to authenticated;
grant usage, select on sequence public.system_incident_events_id_seq to authenticated;
revoke all on public.system_services, public.system_health_checks, public.system_health_results,
  public.system_incidents, public.system_incident_events, public.system_alerts,
  public.system_deployments, public.system_jobs, public.system_job_runs,
  public.system_audit_events from anon;

comment on table public.system_health_results is
  'Time-series health probe results. High-cardinality logs and traces belong in the telemetry backend.';
comment on table public.system_audit_events is
  'Append-only hash-chained administrative audit events.';
