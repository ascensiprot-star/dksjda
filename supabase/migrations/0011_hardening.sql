-- ============================================================================
-- Migration 0011 — Operations hardening
--
-- Adds cross-instance audit-chain safety, cost budgets, admin session and
-- security analytics, runbook execution records, and backup/restore drills.
--
-- Nothing in this migration invents spend, sessions, drills, or successful
-- restores. Rows are written only by measured or explicitly recorded actions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Audit chain: make the tail single-writer
-- ---------------------------------------------------------------------------
-- Every audit row points at the previous row's hash. Without a uniqueness
-- constraint two API instances can both read the same tail and append forks.
-- The application retries on conflict, so the losing appender simply extends
-- the winning chain instead.
create unique index if not exists system_audit_events_previous_hash_key
  on public.system_audit_events (previous_hash)
  where previous_hash is not null;

comment on index public.system_audit_events_previous_hash_key is
  'Enforces one successor per audit hash. Appends retry on conflict to prevent cross-instance chain forks.';

-- ---------------------------------------------------------------------------
-- Cost snapshots and budgets
-- ---------------------------------------------------------------------------
create table if not exists public.system_cost_budgets (
  id                       text primary key,
  name                     text not null,
  provider                 text not null,
  service_id               text references public.system_services(id) on delete set null,
  monthly_limit            numeric(14, 2) not null check (monthly_limit >= 0),
  currency                 text not null default 'USD',
  alert_threshold_percent  integer not null default 80
    check (alert_threshold_percent between 1 and 100),
  enabled                  boolean not null default true,
  owner                    text not null default 'House Operations',
  updated_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.system_cost_snapshots (
  id            text primary key,
  captured_at   timestamptz not null default now(),
  provider      text not null,
  service_id    text references public.system_services(id) on delete set null,
  period_start  date not null,
  period_end    date not null,
  amount        numeric(14, 2) not null check (amount >= 0),
  currency      text not null default 'USD',
  source        text not null default 'manual',
  details       jsonb not null default '{}'::jsonb,
  created_by    text,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists system_cost_snapshots_period_idx
  on public.system_cost_snapshots (provider, period_start desc);
create index if not exists system_cost_snapshots_capture_idx
  on public.system_cost_snapshots (captured_at desc);

-- ---------------------------------------------------------------------------
-- Admin sessions and security events
-- ---------------------------------------------------------------------------
create table if not exists public.system_admin_sessions (
  session_id     text primary key,
  admin_id       text,
  email          text not null,
  role           text not null,
  issued_at      timestamptz,
  expires_at     timestamptz,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  ip_hash        text,
  user_agent     text,
  revoked_at     timestamptz,
  details        jsonb not null default '{}'::jsonb
);

create index if not exists system_admin_sessions_seen_idx
  on public.system_admin_sessions (last_seen_at desc);
create index if not exists system_admin_sessions_email_idx
  on public.system_admin_sessions (email, last_seen_at desc);

create table if not exists public.system_security_events (
  id            text primary key,
  occurred_at   timestamptz not null default now(),
  event_type    text not null,
  actor_email   text,
  actor_id      text,
  role          text,
  outcome       text not null default 'denied',
  severity      text not null default 'low',
  ip_hash       text,
  user_agent    text,
  request_id    text,
  details       jsonb not null default '{}'::jsonb
);

create index if not exists system_security_events_time_idx
  on public.system_security_events (occurred_at desc);
create index if not exists system_security_events_type_time_idx
  on public.system_security_events (event_type, occurred_at desc);
create index if not exists system_security_events_actor_time_idx
  on public.system_security_events (actor_email, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Runbook executions (approval-gated checklists)
-- ---------------------------------------------------------------------------
create table if not exists public.system_runbook_executions (
  id                 text primary key,
  runbook_id         text not null references public.system_runbooks(id) on delete cascade,
  change_request_id  text not null references public.system_change_requests(id) on delete restrict,
  status             text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'failed', 'abandoned')),
  current_step       integer not null default 0 check (current_step >= 0),
  step_results       jsonb not null default '[]'::jsonb,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  executed_by        text not null,
  approved_by        text,
  error              text,
  details            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists system_runbook_executions_time_idx
  on public.system_runbook_executions (started_at desc);
create index if not exists system_runbook_executions_runbook_idx
  on public.system_runbook_executions (runbook_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Backup and restore drills
-- ---------------------------------------------------------------------------
create table if not exists public.system_backup_drills (
  id               text primary key,
  environment      text not null,
  backup_source    text not null,
  restore_target   text not null,
  status           text not null default 'planned'
    check (status in ('planned', 'running', 'passed', 'failed')),
  started_at       timestamptz,
  completed_at     timestamptz,
  rpo_minutes      integer check (rpo_minutes is null or rpo_minutes >= 0),
  rto_minutes      integer check (rto_minutes is null or rto_minutes >= 0),
  verified_tables  integer check (verified_tables is null or verified_tables >= 0),
  verified_rows    bigint check (verified_rows is null or verified_rows >= 0),
  checksum         text,
  performed_by     text,
  notes            text not null default '',
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists system_backup_drills_time_idx
  on public.system_backup_drills (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.system_cost_budgets enable row level security;
alter table public.system_cost_snapshots enable row level security;
alter table public.system_admin_sessions enable row level security;
alter table public.system_security_events enable row level security;
alter table public.system_runbook_executions enable row level security;
alter table public.system_backup_drills enable row level security;

drop policy if exists control_read on public.system_cost_budgets;
create policy control_read on public.system_cost_budgets for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_cost_budgets;
create policy control_write on public.system_cost_budgets for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_cost_snapshots;
create policy control_read on public.system_cost_snapshots for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_cost_snapshots;
create policy control_write on public.system_cost_snapshots for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_admin_sessions;
create policy control_read on public.system_admin_sessions for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_admin_sessions;
create policy control_write on public.system_admin_sessions for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_security_events;
create policy control_read on public.system_security_events for select to authenticated using (public.is_admin());
drop policy if exists control_insert on public.system_security_events;
create policy control_insert on public.system_security_events for insert to authenticated with check (public.can_write());

drop policy if exists control_read on public.system_runbook_executions;
create policy control_read on public.system_runbook_executions for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_runbook_executions;
create policy control_write on public.system_runbook_executions for all to authenticated using (public.can_write()) with check (public.can_write());

drop policy if exists control_read on public.system_backup_drills;
create policy control_read on public.system_backup_drills for select to authenticated using (public.is_admin());
drop policy if exists control_write on public.system_backup_drills;
create policy control_write on public.system_backup_drills for all to authenticated using (public.can_write()) with check (public.can_write());

-- Security events and backup drills are historical records. Operators can
-- read them but cannot rewrite history from the client.
revoke update, delete on public.system_security_events from authenticated;

grant select, insert, update, delete on public.system_cost_budgets to authenticated;
grant select, insert, update, delete on public.system_cost_snapshots to authenticated;
grant select, insert, update, delete on public.system_admin_sessions to authenticated;
grant select, insert on public.system_security_events to authenticated;
grant select, insert, update, delete on public.system_runbook_executions to authenticated;
grant select, insert, update, delete on public.system_backup_drills to authenticated;
revoke all on public.system_cost_budgets, public.system_cost_snapshots,
  public.system_admin_sessions, public.system_security_events,
  public.system_runbook_executions, public.system_backup_drills from anon;

comment on table public.system_cost_budgets is
  'Operator-defined monthly spend ceilings. No provider cost is inferred when no snapshot exists.';
comment on table public.system_cost_snapshots is
  'Provider or invoice spend snapshots. Estimates are labelled by source, never presented as invoices.';
comment on table public.system_admin_sessions is
  'Authenticated operator sessions observed by the API. Session tokens are never stored.';
comment on table public.system_security_events is
  'Append-only denied access and privileged security events.';
comment on table public.system_runbook_executions is
  'Approval-gated runbook checklist executions. Steps are completed by an operator, not fabricated.';
comment on table public.system_backup_drills is
  'Recorded backup and restore drills with measured RPO, RTO, and verification results.';
