-- ============================================================================
-- BOS 0014 — Inventory ledger, balances and reservations
--
-- Stock becomes an append-only ledger. `products.stock` and
-- `products.variants[].stock` remain as the storefront projection, kept in sync
-- by the RPCs below. Existing rows are backfilled once; re-running is safe.
--
-- Rollback (manual):
--   drop trigger if exists bos_inventory_movements_append_only on public.inventory_movements;
--   drop function if exists bos_commit_order_stock(text,text,text,text);
--   drop function if exists bos_release_order_stock(text,text,text,text);
--   drop function if exists bos_reserve_order_stock(text,jsonb,text,text);
--   drop function if exists bos_adjust_stock(text,text,integer,text,text,text,text,text);
--   drop function if exists bos_sync_product_stock(text);
--   drop table if exists public.stock_reservations, public.inventory_movements,
--     public.inventory_balances, public.inventory_locations;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Locations
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_locations (
  id         text primary key,
  code       text not null unique,
  name       text not null,
  country    text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.inventory_locations (id, code, name, country)
values ('main', 'MAIN', 'Primary warehouse', 'FI')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Balances and immutable movements
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_balances (
  id           text primary key,
  location_id  text not null references public.inventory_locations(id),
  product_id   text not null references public.products(id) on delete cascade,
  variant_id   text,
  sku          text not null,
  on_hand      integer not null default 0 check (on_hand >= 0),
  reserved     integer not null default 0 check (reserved >= 0),
  committed    integer not null default 0 check (committed >= 0),
  damaged      integer not null default 0 check (damaged >= 0),
  returned     integer not null default 0 check (returned >= 0),
  in_transit   integer not null default 0 check (in_transit >= 0),
  updated_at   timestamptz not null default now(),
  unique (location_id, product_id, sku)
);

create index if not exists inventory_balances_product_idx
  on public.inventory_balances (product_id, location_id);
create index if not exists inventory_balances_sku_idx
  on public.inventory_balances (sku);

create table if not exists public.inventory_movements (
  id              text primary key,
  location_id     text not null references public.inventory_locations(id),
  product_id      text not null references public.products(id) on delete cascade,
  variant_id      text,
  sku             text not null,
  movement_type   text not null check (movement_type in (
    'initial', 'receipt', 'sale', 'reservation', 'release', 'adjustment',
    'return_restock', 'damage', 'transfer_in', 'transfer_out', 'correction'
  )),
  on_hand_delta   integer not null default 0,
  reserved_delta  integer not null default 0,
  damaged_delta   integer not null default 0,
  in_transit_delta integer not null default 0,
  on_hand_after   integer not null,
  reserved_after  integer not null,
  reference_type  text,
  reference_id    text,
  reason          text,
  actor_id        text,
  actor_email     text,
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);

create index if not exists inventory_movements_sku_time_idx
  on public.inventory_movements (sku, created_at desc);
create index if not exists inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id);

create or replace function public.bos_inventory_movements_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inventory_movements is append-only; record a correcting movement instead';
end $$;

drop trigger if exists bos_inventory_movements_append_only on public.inventory_movements;
create trigger bos_inventory_movements_append_only
  before update or delete on public.inventory_movements
  for each row execute function public.bos_inventory_movements_are_append_only();

create table if not exists public.stock_reservations (
  id              text primary key,
  order_id        text not null references public.orders(id) on delete cascade,
  location_id     text not null references public.inventory_locations(id),
  product_id      text not null references public.products(id) on delete cascade,
  variant_id      text,
  sku             text not null,
  quantity        integer not null check (quantity > 0),
  status          text not null default 'active'
    check (status in ('active', 'committed', 'released', 'expired')),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (order_id, product_id, sku, location_id)
);

create index if not exists stock_reservations_order_idx
  on public.stock_reservations (order_id, status);
create index if not exists stock_reservations_sku_idx
  on public.stock_reservations (sku, status);

-- ---------------------------------------------------------------------------
-- 3. Projection sync
-- ---------------------------------------------------------------------------

create or replace function public.bos_sync_product_stock(p_product_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.products p
  set
    stock = coalesce((
      select sum(b.on_hand)::integer
      from public.inventory_balances b
      where b.product_id = p.id
    ), 0),
    variants = coalesce((
      select jsonb_agg(
        case
          when b.id is not null then jsonb_set(v, '{stock}', to_jsonb(b.on_hand))
          else v
        end
        order by t.ord
      )
      from jsonb_array_elements(coalesce(p.variants, '[]'::jsonb)) with ordinality as t(v, ord)
      left join public.inventory_balances b
        on b.product_id = p.id
       and b.location_id = 'main'
       and b.product_id = p.id
       and b.sku = coalesce(v->>'sku', '')
    ), p.variants),
    "updatedAt" = public.iso_now()
  where p.id = p_product_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Backfill from the existing catalogue and inventory log
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_balance_id text;
begin
  for r in
    select
      p.id as product_id,
      coalesce(v->>'sku', p.id || '-' || coalesce(v->>'size', 'default')) as sku,
      coalesce((v->>'stock')::integer, 0) as stock
    from public.products p
    cross join lateral jsonb_array_elements(coalesce(p.variants, '[]'::jsonb)) v
    where coalesce(v->>'sku', '') <> ''
  loop
    v_balance_id := 'bal-main-' || md5(r.product_id || '|' || r.sku);

    insert into public.inventory_balances (id, location_id, product_id, sku, on_hand)
    values (v_balance_id, 'main', r.product_id, r.sku, greatest(0, r.stock))
    on conflict (location_id, product_id, sku) do nothing;

    insert into public.inventory_movements (
      id, location_id, product_id, sku, movement_type, on_hand_delta,
      on_hand_after, reserved_after, reference_type, reason, idempotency_key
    )
    select
      'mov-init-' || md5(r.product_id || '|' || r.sku),
      'main', r.product_id, r.sku, 'initial', b.on_hand,
      b.on_hand, b.reserved, 'backfill', 'initial catalogue stock',
      'backfill:initial:' || r.sku
    from public.inventory_balances b
    where b.location_id = 'main' and b.product_id = r.product_id and b.sku = r.sku
    on conflict (idempotency_key) do nothing;
  end loop;

  -- Products with no variants keep a single default balance.
  for r in
    select p.id, greatest(0, coalesce(p.stock, 0)) as stock
    from public.products p
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p.variants, '[]'::jsonb)) v
      where coalesce(v->>'sku', '') <> ''
    )
  loop
    insert into public.inventory_balances (id, location_id, product_id, sku, on_hand)
    values ('bal-main-' || md5(r.id || '|' || r.id || '-default'), 'main', r.id, r.id || '-default', r.stock)
    on conflict (location_id, product_id, sku) do nothing;

    insert into public.inventory_movements (
      id, location_id, product_id, sku, movement_type, on_hand_delta,
      on_hand_after, reserved_after, reference_type, reason, idempotency_key
    )
    select
      'mov-init-' || md5(r.id || '|' || r.id || '-default'),
      'main', r.id, r.id || '-default', 'initial', b.on_hand,
      b.on_hand, b.reserved, 'backfill', 'initial catalogue stock',
      'backfill:initial:' || r.id || '-default'
    from public.inventory_balances b
    where b.location_id = 'main' and b.product_id = r.id and b.sku = r.id || '-default'
    on conflict (idempotency_key) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. RPC: manual adjustment
-- ---------------------------------------------------------------------------

create or replace function public.bos_adjust_stock(
  p_sku text,
  p_product_id text,
  p_delta integer,
  p_reason text,
  p_actor_id text default null,
  p_actor_email text default null,
  p_idempotency_key text default null,
  p_location_id text default 'main'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_balance public.inventory_balances%rowtype;
  v_new_on_hand integer;
  v_movement_id text;
  v_existing public.inventory_movements%rowtype;
begin
  if coalesce(p_sku, '') = '' then raise exception 'sku is required'; end if;
  if coalesce(p_product_id, '') = '' then raise exception 'productId is required'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'delta must be a non-zero integer'; end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.inventory_movements where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'sku', v_existing.sku,
        'onHand', v_existing.on_hand_after,
        'reserved', v_existing.reserved_after,
        'movementId', v_existing.id,
        'replayed', true
      );
    end if;
  end if;

  insert into public.inventory_balances (id, location_id, product_id, sku, on_hand)
  values ('bal-' || p_location_id || '-' || md5(p_product_id || '|' || p_sku), p_location_id, p_product_id, p_sku, 0)
  on conflict (location_id, product_id, sku) do nothing;

  select * into v_balance
  from public.inventory_balances
  where location_id = p_location_id and product_id = p_product_id and sku = p_sku
  for update;

  v_new_on_hand := v_balance.on_hand + p_delta;
  if v_new_on_hand < 0 then
    raise exception 'adjustment would make on-hand negative for %', p_sku;
  end if;
  if v_new_on_hand < v_balance.reserved then
    raise exception 'adjustment would drop % below its reserved quantity (%)', p_sku, v_balance.reserved;
  end if;

  update public.inventory_balances
  set on_hand = v_new_on_hand,
      updated_at = now()
  where id = v_balance.id;

  v_movement_id := 'mov-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.inventory_movements (
    id, location_id, product_id, variant_id, sku, movement_type,
    on_hand_delta, on_hand_after, reserved_after, reference_type,
    reason, actor_id, actor_email, idempotency_key
  ) values (
    v_movement_id, p_location_id, v_balance.product_id, v_balance.variant_id, p_sku,
    case when p_delta > 0 then 'receipt' else 'adjustment' end,
    p_delta, v_new_on_hand, v_balance.reserved, 'manual',
    coalesce(p_reason, 'manual adjustment'), p_actor_id, p_actor_email, p_idempotency_key
  );

  perform public.bos_sync_product_stock(v_balance.product_id);

  return jsonb_build_object(
    'sku', p_sku,
    'onHand', v_new_on_hand,
    'reserved', v_balance.reserved,
    'movementId', v_movement_id,
    'replayed', false
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. RPC: reserve order stock (concurrency-safe)
-- ---------------------------------------------------------------------------

create or replace function public.bos_reserve_order_stock(
  p_order_id text,
  p_items jsonb,
  p_location_id text default 'main',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_item jsonb;
  v_sku text;
  v_product_id text;
  v_qty integer;
  v_balance public.inventory_balances%rowtype;
  v_available integer;
  v_reservation_id text;
  v_reserved_count integer := 0;
begin
  if coalesce(p_order_id, '') = '' then raise exception 'orderId is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order must contain at least one item';
  end if;

  -- An order is reserved once. A retry returns the existing state.
  if exists (
    select 1 from public.stock_reservations
    where order_id = p_order_id and status = 'active'
  ) then
    return jsonb_build_object('orderId', p_order_id, 'reserved', true, 'replayed', true);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := v_item->>'sku';
    v_product_id := v_item->>'productId';
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    if coalesce(v_sku, '') = '' then raise exception 'each item requires a sku'; end if;
    if coalesce(v_product_id, '') = '' then raise exception 'each item requires a productId'; end if;
    if v_qty <= 0 then raise exception 'quantity must be positive for %', v_sku; end if;

    insert into public.inventory_balances (id, location_id, product_id, sku, on_hand)
    values ('bal-' || p_location_id || '-' || md5(v_product_id || '|' || v_sku), p_location_id, v_product_id, v_sku, 0)
    on conflict (location_id, product_id, sku) do nothing;

    select * into v_balance
    from public.inventory_balances
    where location_id = p_location_id and product_id = v_product_id and sku = v_sku
    for update;

    v_available := v_balance.on_hand - v_balance.reserved - v_balance.committed;
    if v_qty > v_available then
      raise exception 'insufficient_stock:%:requested=%:available=%', v_sku, v_qty, v_available;
    end if;

    update public.inventory_balances
    set reserved = reserved + v_qty,
        updated_at = now()
    where id = v_balance.id;

    v_reservation_id := 'res-' || md5(p_order_id || '|' || v_product_id || '|' || v_sku || '|' || p_location_id);

    insert into public.stock_reservations (
      id, order_id, location_id, product_id, variant_id, sku, quantity, status
    ) values (
      v_reservation_id, p_order_id, p_location_id, v_balance.product_id,
      v_balance.variant_id, v_sku, v_qty, 'active'
    )
    on conflict (order_id, product_id, sku, location_id) do update
      set quantity = excluded.quantity,
          status = 'active',
          updated_at = now();

    insert into public.inventory_movements (
      id, location_id, product_id, variant_id, sku, movement_type,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, reason, idempotency_key
    ) values (
      'mov-' || replace(gen_random_uuid()::text, '-', ''), p_location_id,
      v_balance.product_id, v_balance.variant_id, v_sku, 'reservation',
      0, v_qty, v_balance.on_hand, v_balance.reserved + v_qty,
      'order', p_order_id, 'order stock reservation',
      'reserve:' || p_order_id || ':' || v_product_id || ':' || v_sku
    )
    on conflict (idempotency_key) do nothing;

    v_reserved_count := v_reserved_count + 1;
  end loop;

  return jsonb_build_object(
    'orderId', p_order_id,
    'reserved', true,
    'items', v_reserved_count,
    'replayed', false
  );
end $$;

-- ---------------------------------------------------------------------------
-- 7. RPC: commit a paid order (decrement on-hand)
-- ---------------------------------------------------------------------------

create or replace function public.bos_commit_order_stock(
  p_order_id text,
  p_actor_id text default null,
  p_actor_email text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res public.stock_reservations%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_committed integer := 0;
begin
  if coalesce(p_order_id, '') = '' then raise exception 'orderId is required'; end if;

  for v_res in
    select * from public.stock_reservations
    where order_id = p_order_id and status = 'active'
    for update
  loop
    select * into v_balance
    from public.inventory_balances
    where location_id = v_res.location_id and product_id = v_res.product_id and sku = v_res.sku
    for update;

    if v_balance.on_hand < v_res.quantity then
      raise exception 'inventory integrity failure: on_hand below reservation for %', v_res.sku;
    end if;
    if v_balance.reserved < v_res.quantity then
      raise exception 'inventory integrity failure: reserved below reservation for %', v_res.sku;
    end if;

    update public.inventory_balances
    set on_hand = on_hand - v_res.quantity,
        reserved = reserved - v_res.quantity,
        updated_at = now()
    where id = v_balance.id;

    update public.stock_reservations
    set status = 'committed', updated_at = now()
    where id = v_res.id;

    insert into public.inventory_movements (
      id, location_id, product_id, variant_id, sku, movement_type,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, reason, actor_id, actor_email, idempotency_key
    ) values (
      'mov-' || replace(gen_random_uuid()::text, '-', ''), v_res.location_id,
      v_res.product_id, v_res.variant_id, v_res.sku, 'sale',
      -v_res.quantity, -v_res.quantity,
      v_balance.on_hand - v_res.quantity, v_balance.reserved - v_res.quantity,
      'order', p_order_id, 'paid order fulfilled stock',
      p_actor_id, p_actor_email,
      'sale:' || p_order_id || ':' || v_res.product_id || ':' || v_res.sku
    )
    on conflict (idempotency_key) do nothing;

    perform public.bos_sync_product_stock(v_res.product_id);
    v_committed := v_committed + v_res.quantity;
  end loop;

  return jsonb_build_object('orderId', p_order_id, 'committedUnits', v_committed);
end $$;

-- ---------------------------------------------------------------------------
-- 8. RPC: release reservations (cancel / expire)
-- ---------------------------------------------------------------------------

create or replace function public.bos_release_order_stock(
  p_order_id text,
  p_reason text default 'order cancelled',
  p_actor_id text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_res public.stock_reservations%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_released integer := 0;
begin
  for v_res in
    select * from public.stock_reservations
    where order_id = p_order_id and status = 'active'
    for update
  loop
    select * into v_balance
    from public.inventory_balances
    where location_id = v_res.location_id and product_id = v_res.product_id and sku = v_res.sku
    for update;

    update public.inventory_balances
    set reserved = greatest(0, reserved - v_res.quantity),
        updated_at = now()
    where id = v_balance.id;

    update public.stock_reservations
    set status = 'released', updated_at = now()
    where id = v_res.id;

    insert into public.inventory_movements (
      id, location_id, product_id, variant_id, sku, movement_type,
      on_hand_delta, reserved_delta, on_hand_after, reserved_after,
      reference_type, reference_id, reason, actor_id, actor_email, idempotency_key
    ) values (
      'mov-' || replace(gen_random_uuid()::text, '-', ''), v_res.location_id,
      v_res.product_id, v_res.variant_id, v_res.sku, 'release',
      0, -v_res.quantity, v_balance.on_hand,
      greatest(0, v_balance.reserved - v_res.quantity),
      'order', p_order_id, coalesce(p_reason, 'reservation released'),
      p_actor_id, p_actor_email,
      'release:' || p_order_id || ':' || v_res.product_id || ':' || v_res.sku || ':' || v_res.id
    )
    on conflict (idempotency_key) do nothing;

    v_released := v_released + v_res.quantity;
  end loop;

  return jsonb_build_object('orderId', p_order_id, 'releasedUnits', v_released);
end $$;

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------

alter table public.inventory_locations enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_reservations enable row level security;

drop policy if exists inventory_locations_read on public.inventory_locations;
create policy inventory_locations_read on public.inventory_locations
  for select to authenticated using (public.is_admin());

drop policy if exists inventory_balances_read on public.inventory_balances;
create policy inventory_balances_read on public.inventory_balances
  for select to authenticated using (public.is_admin());

drop policy if exists inventory_movements_read on public.inventory_movements;
create policy inventory_movements_read on public.inventory_movements
  for select to authenticated using (public.is_admin());

drop policy if exists stock_reservations_read on public.stock_reservations;
create policy stock_reservations_read on public.stock_reservations
  for select to authenticated using (public.is_admin());

-- No browser write policies: all stock changes go through the RPCs above,
-- called by the service role after server-side authorization.

grant execute on function public.bos_sync_product_stock(text) to service_role;
grant execute on function public.bos_adjust_stock(text, text, integer, text, text, text, text, text) to service_role;
grant execute on function public.bos_reserve_order_stock(text, jsonb, text, text) to service_role;
grant execute on function public.bos_commit_order_stock(text, text, text, text) to service_role;
grant execute on function public.bos_release_order_stock(text, text, text, text) to service_role;

comment on table public.inventory_movements is
  'Append-only stock ledger. Every quantity change carries a source, actor and idempotency key.';
comment on table public.stock_reservations is
  'Order-level reservations that protect against overselling between order placement and payment verification.';
