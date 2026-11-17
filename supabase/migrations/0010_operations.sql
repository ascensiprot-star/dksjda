-- ============================================================================
-- Migration 0010 — Operations layer
--
-- Adds durable feature flags, runbooks, approval requests, and seeds the
-- durable video-generation job. Job runs themselves live in system_job_runs
-- from 0008 and are written by the API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Durable job definitions
-- ---------------------------------------------------------------------------
insert into public.system_jobs
  (id, name, service_id, schedule, timeout_seconds, max_attempts, enabled)
values
  ('video-generation', 'Video generation', 'video', null, 600, 2, true)
on conflict (id) do update set
  name = excluded.name,
  service_id = excluded.service_id,
  timeout_seconds = excluded.timeout_seconds,
  max_attempts = excluded.max_attempts,
  enabled = excluded.enabled,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Feature flags
-- ---------------------------------------------------------------------------
create table if not exists public.system_feature_flags (
  flag_key          text primary key,
  name              text not null,
  description       text not null default '',
  enabled           boolean not null default false,
  rollout_percent   integer not null default 0 check (rollout_percent between 0 and 100),
  environments      jsonb not null default '["production","preview","staging","development"]'::jsonb,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

insert into public.system_feature_flags
  (flag_key, name, description, enabled, rollout_percent)
values
  ('video_generation', 'Video generation', 'Allow the admin video generator to call the provider.', true, 100),
  ('checkout', 'Checkout', 'Allow customers to place orders.', true, 100),
  ('suggestions', 'Client suggestions', 'Allow the community suggestion and voting routes.', true, 100),
  ('announcement_bar', 'Announcement bar', 'Show the storefront announcement bar.', true, 100),
  ('control_plane_experimental', 'Control plane experimental', 'Enable experimental control-plane surfaces.', false, 0)
on conflict (flag_key) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Runbooks and approval requests
-- ---------------------------------------------------------------------------
create table if not exists public.system_runbooks (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  service_id   text references public.system_services(id) on delete set null,
  severity     text not null default 'SEV3',
  steps        jsonb not null default '[]'::jsonb,
  owner        text not null default 'House Operations',
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.system_runbooks
  (id, name, description, service_id, severity, steps)
values
  (
    'storefront-down',
    'Storefront unavailable',
    'Use when the storefront returns errors, blank screens, or missing editorial media.',
    'storefront',
    'SEV1',
    '["Confirm /health/ready and /api/control/overview.", "Check the Vercel deployment status and the latest deployment record.", "Probe /editorial/look-01.jpg directly.", "If a deploy caused it, roll back to the last known good deployment.", "Declare an incident and publish customer impact."]'::jsonb
  ),
  (
    'api-degraded',
    'API degraded',
    'Use when authenticated admin routes fail, time out, or return unexpected 5xx responses.',
    'api',
    'SEV1',
    '["Read /health/deep and identify failing dependency checks.", "Verify SUPABASE_SERVICE_ROLE_KEY is present in the deployment.", "Inspect structured request logs for the affected route.", "Confirm the database and auth probes separately.", "Roll back the last deployment if the error rate started with it."]'::jsonb
  ),
  (
    'postgres-down',
    'Postgres unavailable',
    'Use when the database probe fails or writes time out.',
    'postgres',
    'SEV1',
    '["Check the Supabase project status page.", "Run a minimal select against products.", "Confirm the service-role key and project URL.", "Pause admin mutations to avoid partial writes.", "Record the incident and customer impact."]'::jsonb
  ),
  (
    'storage-down',
    'Media storage unavailable',
    'Use when editorial or product media cannot be listed or served.',
    'storage',
    'SEV1',
    '["Probe the media bucket and a known public asset.", "Check Supabase Storage status and bucket policy.", "Confirm the published build still contains local editorial media.", "If only uploads fail, fail closed for media mutations.", "Record the incident and affected pages."]'::jsonb
  ),
  (
    'checkout-error-spike',
    'Checkout error spike',
    'Use when order placement fails or conversion drops sharply.',
    'api',
    'SEV1',
    '["Check the checkout route rate-limit and error rate.", "Verify place_order RPC availability and recent database errors.", "Confirm discount and inventory state for affected products.", "Pause the checkout flag if failures continue.", "Contact affected customers using the order register."]'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  service_id = excluded.service_id,
  severity = excluded.severity,
  steps = excluded.steps,
  updated_at = now();

create table if not exists public.system_change_requests (
  id             text primary key,
  action         text not null,
  target_type    text not null,
  target_id      text,
  reason         text not null,
  payload        jsonb not null default '{}'::jsonb,
  status         text not null default 'pending',
  requested_by   text not null,
  approved_by    text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  expires_at     timestamptz
);

create index if not exists system_change_requests_status_time_idx
  on public.system_change_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.system_feature_flags enable row level security;
alter table public.system_runbooks enable row level security;
alter table public.system_change_requests enable row level security;

drop policy if exists control_read on public.system_feature_flags;
create policy control_read on public.system_feature_flags for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_feature_flags;
create policy control_write on public.system_feature_flags for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_runbooks;
create policy control_read on public.system_runbooks for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_runbooks;
create policy control_write on public.system_runbooks for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_change_requests;
create policy control_read on public.system_change_requests for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_change_requests;
create policy control_write on public.system_change_requests for all to authenticated using (public.can_write()) with check (public.can_write());

grant select, insert, update, delete on public.system_feature_flags to authenticated;
grant select, insert, update, delete on public.system_runbooks to authenticated;
grant select, insert, update, delete on public.system_change_requests to authenticated;
revoke all on public.system_feature_flags, public.system_runbooks,
  public.system_change_requests from anon;

comment on table public.system_feature_flags is
  'Environment-scoped operational feature flags. Unknown or unavailable flags fail open only for non-destructive routes.';
comment on table public.system_runbooks is
  'Human-readable incident runbooks referenced by the service catalogue.';
comment on table public.system_change_requests is
  'Approval requests for destructive or high-impact operator actions.';
