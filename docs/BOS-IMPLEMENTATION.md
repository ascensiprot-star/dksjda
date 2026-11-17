# BOS implementation contract

This document is the hand-off between the application layer and the pending
database migrations. It records what the code now expects, so the SQL can be
written against a precise contract instead of guessed column names.

## Scope

The application layer for the following domains is implemented:

| Screen | System | Main actions |
| --- | --- | --- |
| dashboard | `executive` | overview, activity, readiness |
| control | `control` | overview, alerts, incidents, deployments, audit tail, jobs |
| health | `health` | live probes, persisted history, SLOs, data quality |
| products | `catalog` | list, get, save, publish, archive, bulk status, relationships |
| collections | `collections` | list, get, save, publish, assign products, archive |
| categories | `categories` | tree, save, visibility, reorder, remove |
| media | `media` | list, register, update, usage, remove, stats |
| orders | `orders` | checkout, list, detail, transition, payment, tracking, note, cancel, shipments, returns, refunds |
| inventory | `inventory` | balances, movements, adjust, reserve, commit, release, reconcile, suppliers, purchase orders, receipts |
| discounts | `pricing` | list, save, toggle, remove, quote, usage, promotions |
| customers | `customers` | RFM, cohorts, profile, notes, tags, consent, loyalty, support tickets |
| waitlist | `waitlist` | list, stats, add, invite, remove, drops |
| suggestions | `suggestions` | list, detail, create, status, notes, stats |
| content | `content` | get, save, journal, announcement, translations, reviews |
| analytics | `analytics` | overview, funnel, product performance, events, revenue series, report, finance |
| advisor | `advisor` | list, detail, create, status, queue, stats, evidence |
| atlas | `channels` | source summary, channel revenue, costs, performance, campaigns |
| security | `governance` | audit, chain verification, automation, executions, data quality, approval requests, retention |
| settings | `settings` | store settings, team, permissions, feature flags |

Every action is declared in `src/bos/registry.ts` with an explicit permission.
The HTTP dispatcher never reflects over object keys, so an undeclared action is
not callable.

## API

Authenticated dispatcher:

```
GET  /api/bos/manifest
GET  /api/bos/:system/:action
POST /api/bos/:system/:action
```

Responses:

```json
{ "ok": true, "system": "orders", "action": "transition", "data": {} }
```

Errors always carry a stable code:

```json
{ "error": "An order cannot move from packed to paid.", "code": "conflict", "details": {}, "requestId": "..." }
```

Public, narrow commerce surface:

```
GET  /api/commerce/config
POST /api/commerce/checkout     (Idempotency-Key required)
POST /api/commerce/events       (analytics consent required)
```

Admin requests carry the existing Supabase bearer token. `requireAdmin` still
verifies the user against `public.admins` before the BOS dispatcher runs.

## Sensitive actions

`order.refund`, `finance.write`, `workforce.write` and `governance.write` require
an approved `system_change_requests` row for non-owner roles. The request action
must be exactly `bos.<system>.<action>`. Owners can execute them directly so a
single-operator store is not locked out. Users can create and decide requests
with `governance.changeRequestCreate` / `governance.changeRequestDecide`.

## Money and idempotency

- New code stores and computes money in integer minor units.
- `computeOrderTotals` is VAT-inclusive and server-authoritative.
- Checkout requires a stable idempotency key; `idempotency_keys` is claimed
  before the mutation and completed with the response.
- Stock, order transitions and refunds are executed by database RPCs so
  multi-row changes are atomic. The application never performs a browser-side
  read-modify-write for stock, status, points or ledger balances.

## Database contract

### Existing tables used as-is

`products`, `collections`, `categories`, `discounts`, `orders`, `customers`,
`waitlist`, `suggestions`, `content`, `settings`, `admins`, `events`,
`media_assets`, `insights`, `inventoryLog`, control-plane tables.

### New tables referenced by the code

| Table | Key columns used |
| --- | --- |
| `bos_employees` | `id`, `user_id`, `email`, `name`, `role`, `department`, `status`, `approval_limit_minor`, `updated_at` |
| `bos_permissions`, `bos_role_permissions` | permission matrix |
| `business_events` | event envelope, `idempotency_key` unique |
| `idempotency_keys` | `(key, scope)` primary key, `status`, `request_hash`, `response`, `error`, `completed_at` |
| `inventory_locations` | `id`, `code`, `name`, `country`, `active` |
| `inventory_balances` | `location_id`, `product_id`, `sku`, `on_hand`, `reserved`, `committed`, `damaged`, `returned`, `in_transit` |
| `inventory_movements` | immutable movement ledger, `idempotency_key` unique |
| `stock_reservations` | `order_id`, `product_id`, `sku`, `quantity`, `status`, `expires_at` |
| `order_lines` | `order_id`, `product_id`, `sku`, `quantity`, `unit_price_minor`, `line_total_minor` |
| `order_events` | `order_id`, `status`, `note`, `actor_email`, `occurred_at` |
| `payments` | `order_id`, `amount_minor`, `method`, `reference`, `status`, `received_at` |
| `payment_events` | `payment_id`, `status`, `payload`, `occurred_at` |
| `shipments` | `order_id`, `carrier`, `tracking`, `status`, `estimated_delivery`, `shipped_at`, `delivered_at` |
| `shipment_events` | `shipment_id`, `status`, `note`, `actor_email`, `occurred_at` |
| `returns` | `order_id`, `customer_email`, `status`, `reason`, `notes`, timestamps |
| `return_lines` | `return_id`, `product_id`, `sku`, `quantity`, `unit_price_minor`, `condition`, `restock` |
| `refunds` | `order_id`, `return_id`, `amount_minor`, `status`, `created_at` |
| `promotions` | `name`, `scope`, `type`, `value`, `target_ids`, `starts_at`, `ends_at`, `active`, `priority` |
| `campaigns` | `name`, `channel`, `status`, `budget_minor`, `spend_minor`, dates |
| `marketing_touches` | `campaign_id`, `visitor_id`, `customer_email`, `event_type`, `revenue_minor`, `occurred_at` |
| `channel_costs` | `channel`, `month` (`YYYY-MM`), `spend_minor`, `impressions`, `clicks` |
| `crm_notes` | `customer_email`, `body`, `author_email`, `pinned`, `created_at` |
| `crm_tags` | `customer_email`, `tag`, `created_by` |
| `loyalty_accounts` | `customer_email`, `points`, `lifetime_points`, `tier` |
| `loyalty_transactions` | `customer_email`, `points_delta`, `reason`, `order_id`, `idempotency_key` unique |
| `loyalty_referrals` | `referrer_email`, `referee_email`, `status`, `revenue_minor` |
| `support_tickets` | `customer_email`, `order_id`, `subject`, `status`, `priority`, `assigned_to`, timestamps |
| `ticket_messages` | `ticket_id`, `author_type`, `author_email`, `body`, `created_at` |
| `reviews` | `product_id`, `customer_email`, `rating`, `title`, `body`, `status`, `verified_purchase`, `response` |
| `expenses` | `category`, `vendor`, `amount_minor`, `currency`, `incurred_on`, `reference`, `status` |
| `product_costs` | `product_id`, `unit_cost_minor`, `effective_from` |
| `ledger_accounts` | `code`, `name`, `type` |
| `journal_entries` | `entry_date`, `description`, `reference_type`, `reference_id` |
| `journal_lines` | `entry_id`, `account_code`, `debit_minor`, `credit_minor` |
| `suppliers` | `name`, `email`, `phone`, `country`, `lead_time_days`, `status` |
| `purchase_orders` | `supplier_id`, `number`, `status`, `ordered_at`, `expected_at`, `received_at`, `total_minor` |
| `purchase_order_lines` | `purchase_order_id`, `product_id`, `sku`, `quantity`, `unit_cost_minor`, `received_quantity` |
| `goods_receipts` | `purchase_order_id`, `received_at`, `received_by`, `notes` |
| `automation_rules` | `name`, `trigger_event`, `conditions`, `actions`, `active` |
| `workflow_executions` | `rule_id`, `event_id`, `status`, `started_at`, `finished_at`, `error`, `result` |

Scalar money columns are integer minor units on all new tables. Existing
floating-point euro columns remain compatibility projections.

### RPC contract

```sql
bos_create_order(
  p_payload jsonb,
  p_idempotency_key text,
  p_actor_email text,
  p_channel text
) returns jsonb
-- { orderId, number, status, totals, reservationExpiresAt }

bos_transition_order(
  p_order_id text,
  p_from_status text,
  p_to_status text,
  p_actor_email text,
  p_note text,
  p_tracking text,
  p_idempotency_key text
) returns jsonb

bos_record_payment(
  p_order_id text,
  p_amount_minor bigint,
  p_method text,
  p_reference text,
  p_received_at timestamptz,
  p_actor_email text,
  p_idempotency_key text
) returns jsonb

bos_order_note(
  p_order_id text,
  p_note text,
  p_actor_email text
) returns void

bos_refund_order(
  p_return_id text,
  p_actor_email text,
  p_idempotency_key text
) returns jsonb
-- { amountMinor, refundId, restockedUnits, orderStatus }

bos_loyalty_adjust(
  p_customer_email text,
  p_points integer,
  p_reason text,
  p_actor_email text,
  p_idempotency_key text
) returns jsonb
```

Inventory RPCs are already drafted in `docs/migration-drafts/0014_inventory_ledger.sql`:
`bos_adjust_stock`, `bos_reserve_order_stock`, `bos_commit_order_stock`,
`bos_release_order_stock`, `bos_sync_product_stock`.

`bos_create_order` must perform one transaction:

1. Claim/verify the idempotency key.
2. Insert the order, `order_lines`, `order_events` and a pending payment.
3. Reserve stock for every line; abort the whole order on insufficient stock.
4. Increment the discount `used` count only if a discount is attached.
5. Write the legacy `orders` JSON projection for the existing UI.
6. Emit `order.created` (application also emits; unique key makes it safe).
7. Return the created order.

`bos_transition_order` must lock the order row, verify `p_from_status`, apply
the stock effect (`commit`, `release` or restock), append the timeline/projection
and `order_events`, and reject invalid transitions.

## Status

- TypeScript: `npx tsc --noEmit` passes.
- Unit tests: `npx vitest run` passes (68 tests, including BOS money, state
  machine, permissions, RFM/cohorts and registry invariants).
- Build: `npm run build` passes the no-seed guard and Vite build.
- Runtime verification is pending the migrations. Actions that touch new tables
  fail closed with `schema_unavailable` (HTTP 503) rather than pretending to
  succeed.

The two draft SQL files were moved to `docs/migration-drafts/`. They are not in
`supabase/migrations/`, so they cannot be applied accidentally.
