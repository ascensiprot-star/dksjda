-- ============================================================================
-- BOS 0013 — Foundation: unified access, business events, idempotency, money
--
-- Additive and idempotent. No existing row is deleted or rewritten except
-- backfilled minor-unit columns, which preserve the original double values.
--
-- Rollback (manual, in reverse order):
--   1. drop the policies/functions/tables created here
--   2. drop the *_minor / currency / totals_minor / version columns from
--      products, orders and customers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Unified workforce directory and permissions
-- ---------------------------------------------------------------------------

create table if not exists public.bos_employees (
  id                   text primary key,
  user_id              uuid references auth.users(id) on delete set null,
  email                text not null unique,
  name                 text not null default '',
  role                 text not null default 'viewer'
    check (role in ('owner', 'admin', 'manager', 'editor', 'analyst', 'support', 'viewer')),
  department           text,
  status               text not null default 'active'
    check (status in ('active', 'suspended', 'disabled')),
  approval_limit_minor bigint not null default 0 check (approval_limit_minor >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists bos_employees_user_idx on public.bos_employees (user_id);
create index if not exists bos_employees_role_idx on public.bos_employees (role, status);

-- Mirror the existing administrators into the directory without changing the
-- source of truth. `admins` remains the authentication anchor.
insert into public.bos_employees (id, email, name, role, department, status, updated_at)
select
  coalesce(nullif(a.id, ''), 'emp-' || md5(lower(a.email))),
  lower(a.email),
  coalesce(a.name, ''),
  case lower(coalesce(a.role, 'viewer'))
    when 'owner' then 'owner'
    when 'editor' then 'editor'
    else 'viewer'
  end,
  'Operations',
  'active',
  now()
from public.admins a
where coalesce(a.email, '') <> ''
on conflict (email) do nothing;

create table if not exists public.bos_permissions (
  key         text primary key,
  category    text not null,
  description text not null
);

insert into public.bos_permissions (key, category, description)
values
  ('catalog.read',     'Catalogue',  'View products, categories, collections and media'),
  ('catalog.write',    'Catalogue',  'Create and edit products, categories and collections'),
  ('catalog.publish',  'Catalogue',  'Publish or archive products and collections'),
  ('inventory.read',   'Inventory',  'View stock balances and movements'),
  ('inventory.write',  'Inventory',  'Adjust stock, receive goods and transfer stock'),
  ('order.read',       'Orders',     'View orders, payments and fulfilment'),
  ('order.write',      'Orders',     'Process, fulfil and modify orders'),
  ('order.refund',     'Orders',     'Refund or cancel settled orders'),
  ('customer.read',    'Customers',  'View customer profiles and history'),
  ('customer.write',   'Customers',  'Edit customer profiles, tags and notes'),
  ('finance.read',     'Finance',    'View revenue, costs, profit and ledger'),
  ('finance.write',    'Finance',    'Record expenses, costs and financial adjustments'),
  ('marketing.read',   'Marketing',  'View campaigns, spend and attribution'),
  ('marketing.write',  'Marketing',  'Manage campaigns, spend and promotions'),
  ('loyalty.read',     'Loyalty',    'View loyalty accounts and transactions'),
  ('loyalty.write',    'Loyalty',    'Adjust loyalty points and referrals'),
  ('support.read',     'Support',    'View support tickets and customer conversations'),
  ('support.write',    'Support',    'Respond to, assign and resolve support tickets'),
  ('review.read',      'Reviews',    'View reviews and feedback'),
  ('review.moderate',  'Reviews',    'Moderate reviews without deleting genuine feedback'),
  ('supplier.read',    'Suppliers',  'View suppliers and purchase orders'),
  ('supplier.write',   'Suppliers',  'Manage suppliers, purchase orders and receipts'),
  ('workforce.read',   'Workforce',  'View employees, roles and access history'),
  ('workforce.write',  'Workforce',  'Manage employees, roles and permissions'),
  ('governance.read',  'Governance', 'View audit, automation and system settings'),
  ('governance.write', 'Governance', 'Change automation, integrations and system settings'),
  ('report.export',    'Reporting',  'Export reports within the caller''s permissions')
on conflict (key) do update set
  category = excluded.category,
  description = excluded.description;

create table if not exists public.bos_role_permissions (
  role           text not null,
  permission_key text not null references public.bos_permissions(key) on delete cascade,
  primary key (role, permission_key)
);

insert into public.bos_role_permissions (role, permission_key)
select r.role, p.key
from (values
  ('owner'), ('admin'), ('manager'), ('editor'), ('analyst'), ('support'), ('viewer')
) as r(role)
cross join public.bos_permissions p
where
  r.role in ('owner', 'admin')
  or (r.role = 'manager' and p.key in (
    'catalog.read','catalog.write','catalog.publish','inventory.read','inventory.write',
    'order.read','order.write','order.refund','customer.read','customer.write',
    'finance.read','marketing.read','marketing.write','loyalty.read','loyalty.write',
    'support.read','support.write','review.read','review.moderate','supplier.read',
    'supplier.write','workforce.read','governance.read','report.export'
  ))
  or (r.role = 'editor' and p.key in (
    'catalog.read','catalog.write','catalog.publish','inventory.read','inventory.write',
    'order.read','order.write','customer.read','support.read','review.read',
    'supplier.read','report.export'
  ))
  or (r.role = 'analyst' and p.key like '%.read' or (r.role = 'analyst' and p.key = 'report.export'))
  or (r.role = 'support' and p.key in (
    'order.read','customer.read','customer.write','support.read','support.write',
    'review.read','loyalty.read'
  ))
  or (r.role = 'viewer' and p.key like '%.read')
on conflict do nothing;

-- Role resolution. `admins` is authoritative; `bos_employees` is the
-- directory/extension used by newer surfaces.
create or replace function public.bos_role()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select lower(a.role) from public.admins a
      where lower(a.email) = public.jwt_email() limit 1),
    (select lower(e.role) from public.bos_employees e
      where lower(e.email) = public.jwt_email() and e.status = 'active' limit 1)
  );
$$;

create or replace function public.bos_has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.bos_role() in ('owner', 'admin') then true
    when public.bos_role() is null then false
    else exists (
      select 1 from public.bos_role_permissions rp
      where rp.role = public.bos_role() and rp.permission_key = p_key
    )
  end;
$$;

grant execute on function public.bos_role() to anon, authenticated, service_role;
grant execute on function public.bos_has_permission(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Business event envelope
-- ---------------------------------------------------------------------------

create table if not exists public.business_events (
  id              text primary key,
  type            text not null,
  schema_version  integer not null default 1 check (schema_version >= 1),
  occurred_at     timestamptz not null default now(),
  recorded_at     timestamptz not null default now(),
  actor_type      text not null default 'system'
    check (actor_type in ('customer', 'admin', 'system', 'integration', 'anonymous')),
  actor_id        text,
  actor_email     text,
  customer_id     text,
  anonymous_id    text,
  session_id      text,
  product_id      text,
  variant_id      text,
  sku             text,
  order_id        text,
  payment_id      text,
  return_id       text,
  channel         text not null default 'website',
  campaign_id     text,
  currency        text,
  amount_minor    bigint,
  idempotency_key text unique,
  correlation_id  text,
  consent_basis   text,
  payload         jsonb not null default '{}'::jsonb
);

create index if not exists business_events_type_time_idx
  on public.business_events (type, occurred_at desc);
create index if not exists business_events_order_idx
  on public.business_events (order_id, occurred_at desc) where order_id is not null;
create index if not exists business_events_customer_idx
  on public.business_events (customer_id, occurred_at desc) where customer_id is not null;
create index if not exists business_events_product_idx
  on public.business_events (product_id, occurred_at desc) where product_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Idempotency ledger
-- ---------------------------------------------------------------------------

create table if not exists public.idempotency_keys (
  key          text not null,
  scope        text not null,
  request_hash text,
  status       text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'failed')),
  response     jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (key, scope)
);

create index if not exists idempotency_keys_created_idx
  on public.idempotency_keys (created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Money: canonical minor units, existing doubles preserved
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists currency text not null default 'EUR';
alter table public.products add column if not exists price_minor bigint;
alter table public.products add column if not exists compare_at_price_minor bigint;

update public.products
set price_minor = round(coalesce(price, 0) * 100)::bigint
where price_minor is null;

update public.products
set compare_at_price_minor = round(compare_at_price * 100)::bigint
where compare_at_price_minor is null and compare_at_price is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_price_minor_nonnegative'
  ) then
    alter table public.products
      add constraint products_price_minor_nonnegative check (price_minor is null or price_minor >= 0);
  end if;
end $$;

alter table public.orders add column if not exists currency text not null default 'EUR';
alter table public.orders add column if not exists totals_minor jsonb;
alter table public.orders add column if not exists version integer not null default 0;
alter table public.orders add column if not exists channel text not null default 'website';
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists fulfillment_status text not null default 'unfulfilled';

update public.orders
set totals_minor = jsonb_build_object(
  'subtotal', round(coalesce((totals->>'subtotal')::numeric, 0) * 100)::bigint,
  'shipping', round(coalesce((totals->>'shipping')::numeric, 0) * 100)::bigint,
  'vat',      round(coalesce((totals->>'vat')::numeric, 0) * 100)::bigint,
  'discount', round(coalesce((totals->>'discount')::numeric, 0) * 100)::bigint,
  'total',    round(coalesce((totals->>'total')::numeric, 0) * 100)::bigint
)
where totals_minor is null;

update public.orders
set payment_status = case
  when status in ('paid', 'packed', 'shipped', 'delivered') then 'captured'
  when status = 'refunded' then 'refunded'
  when status = 'cancelled' then 'cancelled'
  else 'pending'
end
where payment_status = 'pending' and status <> 'new';

update public.orders
set fulfillment_status = case
  when status = 'packed' then 'packed'
  when status = 'shipped' then 'shipped'
  when status = 'delivered' then 'delivered'
  when status = 'cancelled' then 'cancelled'
  else 'unfulfilled'
end
where fulfillment_status = 'unfulfilled' and status in ('packed', 'shipped', 'delivered', 'cancelled');

alter table public.customers add column if not exists currency text not null default 'EUR';
alter table public.customers add column if not exists merged_into_id text;
alter table public.customers add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------------------

alter table public.bos_employees enable row level security;
alter table public.bos_permissions enable row level security;
alter table public.bos_role_permissions enable row level security;
alter table public.business_events enable row level security;
alter table public.idempotency_keys enable row level security;

drop policy if exists bos_employees_read on public.bos_employees;
create policy bos_employees_read on public.bos_employees
  for select to authenticated using (public.is_admin());

drop policy if exists bos_employees_owner_write on public.bos_employees;
create policy bos_employees_owner_write on public.bos_employees
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists bos_permissions_read on public.bos_permissions;
create policy bos_permissions_read on public.bos_permissions
  for select to authenticated using (public.is_admin());

drop policy if exists bos_role_permissions_read on public.bos_role_permissions;
create policy bos_role_permissions_read on public.bos_role_permissions
  for select to authenticated using (public.is_admin());

drop policy if exists business_events_read on public.business_events;
create policy business_events_read on public.business_events
  for select to authenticated using (public.is_admin());

drop policy if exists idempotency_keys_read on public.idempotency_keys;
create policy idempotency_keys_read on public.idempotency_keys
  for select to authenticated using (public.is_owner());

-- Writes to business_events and idempotency_keys are performed by the service
-- role through the commerce RPCs. No browser write policy is granted.

-- ---------------------------------------------------------------------------
-- 6. Event helper
-- ---------------------------------------------------------------------------

create or replace function public.bos_emit_event(
  p_type text,
  p_idempotency_key text default null,
  p_actor_type text default 'system',
  p_actor_id text default null,
  p_actor_email text default null,
  p_customer_id text default null,
  p_anonymous_id text default null,
  p_session_id text default null,
  p_product_id text default null,
  p_variant_id text default null,
  p_sku text default null,
  p_order_id text default null,
  p_payment_id text default null,
  p_return_id text default null,
  p_channel text default 'website',
  p_campaign_id text default null,
  p_currency text default null,
  p_amount_minor bigint default null,
  p_correlation_id text default null,
  p_consent_basis text default null,
  p_payload jsonb default '{}'::jsonb
)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_id text;
begin
  if p_idempotency_key is not null then
    select id into v_id from public.business_events where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  v_id := 'evt_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.business_events (
    id, type, actor_type, actor_id, actor_email, customer_id, anonymous_id,
    session_id, product_id, variant_id, sku, order_id, payment_id, return_id,
    channel, campaign_id, currency, amount_minor, idempotency_key,
    correlation_id, consent_basis, payload
  ) values (
    v_id, p_type, coalesce(p_actor_type, 'system'), p_actor_id, p_actor_email,
    p_customer_id, p_anonymous_id, p_session_id, p_product_id, p_variant_id,
    p_sku, p_order_id, p_payment_id, p_return_id, coalesce(p_channel, 'website'),
    p_campaign_id, p_currency, p_amount_minor, p_idempotency_key,
    p_correlation_id, p_consent_basis, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing;

  if v_id is null or not exists (select 1 from public.business_events where id = v_id) then
    select id into v_id from public.business_events where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $$;

grant execute on function public.bos_emit_event(
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, bigint, text, text, text, jsonb
) to service_role;

comment on table public.business_events is
  'Canonical, append-only commerce event envelope. Analytics events remain in public.events until the M6 ingestion slice.';
comment on table public.idempotency_keys is
  'Replay protection for checkout, fulfilment and financial mutations.';
