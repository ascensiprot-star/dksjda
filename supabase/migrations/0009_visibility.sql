-- ============================================================================
-- Migration 0009 — Visibility layer
--
-- Adds durable SLO definitions, alert rules, and data-quality check definitions
-- and results. The control plane computes current state from live probes and
-- stores only the metadata needed for history and review.
-- ============================================================================

create table if not exists public.system_slo_definitions (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  service_id   text not null references public.system_services(id) on delete cascade,
  check_id     text not null,
  target       numeric(6,5) not null check (target > 0 and target <= 1),
  window_days  integer not null default 30 check (window_days between 1 and 365),
  owner        text not null default 'House Operations',
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.system_alert_rules (
  id              text primary key,
  name            text not null,
  service_id      text references public.system_services(id) on delete set null,
  check_id        text,
  severity        text not null default 'warning',
  condition       text not null default 'probe.down',
  threshold       numeric,
  window_seconds  integer not null default 300,
  dedupe_prefix   text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.system_data_quality_checks (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  severity     text not null default 'warning',
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.system_data_quality_results (
  id            bigserial primary key,
  check_id      text not null,
  status        text not null,
  failing_count integer not null default 0,
  total_count   integer not null default 0,
  samples       jsonb not null default '[]'::jsonb,
  message       text not null default '',
  checked_at    timestamptz not null default now()
);

create index if not exists system_data_quality_results_check_time_idx
  on public.system_data_quality_results (check_id, checked_at desc);

-- ---------------------------------------------------------------------------
-- Default SLOs. Targets are availability ratios over a rolling window.
-- ---------------------------------------------------------------------------
insert into public.system_slo_definitions
  (id, name, description, service_id, check_id, target, window_days, owner)
values
  ('storefront-availability', 'Storefront media availability', 'Published editorial media must remain reachable for customers.', 'storefront', 'storefront.manifest', 0.999, 30, 'House Operations'),
  ('api-availability', 'API availability', 'The API process must answer operator and customer requests.', 'api', 'api.self', 0.999, 30, 'House Operations'),
  ('postgres-availability', 'Postgres availability', 'The system of record must remain reachable.', 'postgres', 'postgres.reachability', 0.999, 30, 'House Operations'),
  ('auth-availability', 'Authentication availability', 'Operators must be able to sign in and verify sessions.', 'auth', 'auth.health', 0.999, 30, 'House Operations'),
  ('storage-availability', 'Media storage availability', 'Media bucket operations must remain available.', 'storage', 'storage.list', 0.999, 30, 'House Operations'),
  ('telemetry-freshness', 'Telemetry freshness', 'Consent-based events should arrive within five minutes.', 'telemetry', 'telemetry.freshness', 0.990, 30, 'House Operations')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  service_id = excluded.service_id,
  check_id = excluded.check_id,
  target = excluded.target,
  window_days = excluded.window_days,
  owner = excluded.owner,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Default alert rules. Evaluation is performed by the control-plane server.
-- ---------------------------------------------------------------------------
insert into public.system_alert_rules
  (id, name, severity, condition, window_seconds, dedupe_prefix)
values
  ('probe-down', 'Required probe is down', 'critical', 'probe.down', 300, 'probe.down'),
  ('probe-degraded', 'Probe is degraded', 'warning', 'probe.degraded', 300, 'probe.degraded'),
  ('slo-burn', 'SLO error budget is burning', 'critical', 'slo.burn', 3600, 'slo.burn')
on conflict (id) do update set
  name = excluded.name,
  severity = excluded.severity,
  condition = excluded.condition,
  window_seconds = excluded.window_seconds,
  dedupe_prefix = excluded.dedupe_prefix,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Default data-quality checks. The server knows how to execute each id.
-- ---------------------------------------------------------------------------
insert into public.system_data_quality_checks
  (id, name, description, severity)
values
  ('products.completeness', 'Product completeness', 'Products need a name, price and at least one image.', 'warning'),
  ('orders.integrity', 'Order integrity', 'Orders need a customer email, items and a positive total.', 'critical'),
  ('media.alt_text', 'Media alt text', 'Archived media should carry descriptive alt text.', 'warning'),
  ('content.hero', 'Hero content', 'The storefront needs at least one hero slide or hero media source.', 'critical')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  severity = excluded.severity,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.system_slo_definitions enable row level security;
alter table public.system_alert_rules enable row level security;
alter table public.system_data_quality_checks enable row level security;
alter table public.system_data_quality_results enable row level security;

drop policy if exists control_read on public.system_slo_definitions;
create policy control_read on public.system_slo_definitions for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_slo_definitions;
create policy control_write on public.system_slo_definitions for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_alert_rules;
create policy control_read on public.system_alert_rules for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_alert_rules;
create policy control_write on public.system_alert_rules for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_data_quality_checks;
create policy control_read on public.system_data_quality_checks for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_data_quality_checks;
create policy control_write on public.system_data_quality_checks for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_data_quality_results;
create policy control_read on public.system_data_quality_results for select to authenticated using (public.is_admin());
drop policy if exists control_insert on public.system_data_quality_results;
create policy control_insert on public.system_data_quality_results for insert to authenticated with check (public.can_write());

grant select, insert, update, delete on public.system_slo_definitions to authenticated;
grant select, insert, update, delete on public.system_alert_rules to authenticated;
grant select, insert, update, delete on public.system_data_quality_checks to authenticated;
grant select, insert on public.system_data_quality_results to authenticated;
grant usage, select on sequence public.system_data_quality_results_id_seq to authenticated;
revoke all on public.system_slo_definitions, public.system_alert_rules,
  public.system_data_quality_checks, public.system_data_quality_results from anon;

comment on table public.system_slo_definitions is
  'Availability SLOs computed from persisted system_health_results.';
comment on table public.system_data_quality_results is
  'Results of read-only data-quality checks. Failing samples are redacted before storage.';
