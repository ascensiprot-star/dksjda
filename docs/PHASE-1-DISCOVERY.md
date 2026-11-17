# Phase 1 — System Discovery Report
## ZEJESH / Clofads → Clothing Brand Operating System (BOS)

**Status:** discovery complete, no application code changed.  
**Date:** 2026-11-17  
**Scope:** existing repository at `/Projects/Clofads`, all Supabase migrations, Express API, admin console, tracking layer, tests.

---

## 1. Executive summary

The repository is a real, working Vite + React 19 + TypeScript storefront with an Express API and Supabase (Postgres/Auth/Storage/Realtime). The admin console already contains **19 navigation surfaces**, a frozen visual design system, real RLS, a production checkout path, and a substantial **infrastructure control plane** (health, SLOs, incidents, deployments, jobs, feature flags, audit chain, cost snapshots, backup drills).

What exists is a **commerce back office plus a system-observability control plane**. What does **not** exist is the commerce **domain core** required by the BOS brief:

- no normalized order lines, payments, refunds, returns, shipments with lifecycle state machines;
- no inventory ledger with reservations and concurrency guarantees (stock is a mutable JSONB field);
- no product cost, so gross profit, contribution margin and COGS cannot be computed;
- no purchase/add-to-cart/product-view instrumentation in the storefront (the tracker engine exists but is never called for commerce events);
- no supplier/procurement, support-ticket, review, loyalty, referral, marketing-campaign or attribution domains;
- no configurable pricing/promotion engine;
- no commerce business-event envelope (analytics `events` is a client telemetry table, not an event bus).

The existing control plane is high quality and should be preserved and extended, not replaced. The correct strategy is an **incremental modular-monolith build-out** behind the existing 19 screens, with a compatibility path for current JSONB order/product rows.

**Baseline health:** `tsc --noEmit` passes (0 errors); `vitest run` passes 40/40 tests across 5 files. Those tests do not cover orders, inventory, money, RLS, concurrency, or event processing.

---

## 2. Technology stack (verified)

| Layer | Implementation | Notes |
|---|---|---|
| Frontend | Vite 8, React 19, TypeScript, Tailwind 4, Recharts, motion | SPA; no router package — `App.tsx` renders route state |
| Build | `vite build`, custom no-seed guard (`scripts/check-no-seed.mjs`) | Build fails if mock/seed/demo data is introduced |
| Server | Express 4 in `src/serverApp.ts`, entry `server.ts`, Vercel handler `api/index.ts` | 1,986 lines; JSON body limits, rate limit, request IDs, structured logs |
| Database | Supabase Postgres, 12 migrations (`0001`–`0012`) | 80+ tables/views; heavy use of JSONB and `text` timestamps |
| Auth | Supabase Auth + `public.admins` (`owner`/`editor`/`viewer`) and a second `admin_profiles` role set (`owner`/`manager`/`viewer`) | Two role models coexist — **must be unified** |
| Storage | Supabase Storage bucket `media`, `media_assets` table | Public read, owner-only write |
| Realtime | Supabase Realtime on catalogue/orders/customers/waitlist/events | Admin subscriptions refetch entire tables |
| Server jobs | `pg_cron` daily-stats function + `/api/cron/health` endpoint | No durable queue, retry, or dead-letter |
| Tests | Vitest (unit), Playwright (one storefront spec), SQL RLS test file | `supabase/tests/rls.test.sql` is **not executed by any script** |

---

## 3. The 19 existing screens (verified in `src/admin/AdminLayout.tsx`)

| # | Screen id | Component | Approx. LOC | Current data source | Domain maturity |
|---|---|---|---|---|---|
| 01 | `dashboard` | `operations/OpsOverview.tsx` | 799 | orders, products, customers, waitlist, collections, live `events` count | commercial read-model, no finance/COGS |
| 02 | `control` | `control/AdminControlPlaneView.tsx` + 13 panels | ~3,500 | `system_*` tables via `/api/control/*` | strong infrastructure plane |
| 03 | `health` | `health/AdminSystemHealthView.tsx` | 423 | probes, events, localStorage counters | partly client-local, superseded by control plane |
| 04 | `products` | `products/*` | ~3,000 | `products` JSONB | catalogue CRUD, no cost/versioning/relationships |
| 05 | `collections` | `collections/*` | — | `collections` JSONB `productIds` | basic CRUD |
| 06 | `categories` | `categories/*` | — | `categories` | basic CRUD |
| 07 | `media` | `media/*` | — | `media_assets` + Storage | functional |
| 08 | `orders` | `orders/AdminOrdersView.tsx` | 1,449 | `orders` JSONB, direct client updates | no state machine, no events, no payments/returns |
| 09 | `inventory` | `inventory/AdminInventoryView.tsx` | 259 | `products.variants` JSONB + `inventoryLog` | read-modify-write, no ledger guarantees |
| 10 | `discounts` | `discounts/*` | 252 | `discounts` table **but initial state comes from `localStorage`** | rule engine absent |
| 11 | `customers` | `customers/*` | 178 | `customers` JSONB totals | CRM fields absent |
| 12 | `waitlist` | `waitlist/*` | 192 | `waitlist` | newsletter/drop signups |
| 13 | `suggestions` | `suggestions/*` | 340 | proposals/waves/votes ecosystem | community co-creation, not support |
| 14 | `content` | `content/*` | — | `content` JSONB | CMS |
| 15 | `analytics` | `analytics/AdminAnalyticsView.tsx` | 1,295 | orders/products + derived daily series | 40 honest "trajectory" panels; most show "No data" |
| 16 | `advisor` | `advisor/*` | — | derived catalog + orders | decision support, no server intelligence API |
| 17 | `atlas` | `atlas/*` + `atlasRegistry.ts` | — | local registry | describes surfaces |
| 18 | `security` | `security/*` | ~900 | `auditLog`, auth context, terminal lock | UI lock is client-side; server RLS is real |
| 19 | `settings` | `settings/*` | 293 | `settings` JSONB | store config only |

**Important:** the 19 **screens** are not the same set as the 19 **BOS systems** in the brief. Media, waitlists, CMS, advisor and atlas have no direct counterpart, while fulfillment, returns, marketing, loyalty, support, reviews, finance, suppliers and workforce have no dedicated screen. Since the brief forbids new top-level screens, Phase 2 must define an explicit **surface mapping** (section 9) and deliver some domains as service layers plus panels inside existing screens, using existing components only.

---

## 4. Existing database inventory

### 4.1 Commerce / content (migrations 0001–0007)

| Group | Tables | Assessment |
|---|---|---|
| Catalogue | `products`, `categories`, `collections`, `discounts` | `products` is a wide JSONB document (`variants`, `sizes`, `images`, `name/description/material/origin/care` localized JSONB). No `product_variants` table, no SKU uniqueness, no cost, no version history. |
| Content | `content`, `settings` | single-row JSONB documents |
| Identity | `admins`, `owner_config`, `admin_profiles` | two competing role models; `admins` has `owner/editor/viewer`, `admin_profiles` has `owner/manager/viewer` |
| Commerce | `orders`, `customers`, `waitlist`, `inventoryLog` | all order data in JSONB (`customer`, `items`, `totals`, `timeline`); no order items, payment, refund, shipment or return tables |
| Community | `suggestions`, `proposals`, `proposal_images`, `proposal_sizes`, `reservations`, `referral_events`, `waves`, `wave_members`, `votes`, `saves`, `subscribers`, `email_log`, `suggest_events`, `proposal_stats_daily`, `stripe_events`, `rate_limits` | migration 0003 is a large, partially separate subsystem with its own atomic reservation RPC |
| Telemetry | `events`, `dailyStats`, `insights` | flat client tracking rows + one rollup; no event schema version, product/order/channel columns, or dedupe key |
| Governance | `auditLog` | mutable free-form rows; separate hash-chained `system_audit_events` exists |
| Targets | `targetPlans`, `metricActuals`, `coachTasks`, `dailyCoachBriefs`, `reverseFunnelCalculations` | planning/coaching system, isolated from real commerce events |
| Media | `media_assets` | good |

### 4.2 Control plane (migrations 0008–0011)

`system_services`, `system_health_checks`, `system_health_results`, `system_incidents`, `system_incident_events`, `system_alerts`, `system_deployments`, `system_jobs`, `system_job_runs`, `system_slo_definitions`, `system_alert_rules`, `system_data_quality_checks`, `system_data_quality_results`, `system_feature_flags`, `system_runbooks`, `system_change_requests`, `system_cost_budgets`, `system_cost_snapshots`, `system_admin_sessions`, `system_security_events`, `system_runbook_executions`, `system_backup_drills`, `system_audit_events` (hash-chained, unique tail).

This layer is genuinely implemented and should be extended for System 19 rather than duplicated. It is **infrastructure** governance; it does not govern commerce records.

### 4.3 Missing entity classes (relative to the brief)

`product_variants`, `product_attributes`, `product_version`, `inventory_location`, `inventory_balance`, `inventory_movement` (immutable), `stock_reservation`, `cart`, `cart_line`, `order_line`, `order_event`, `payment`, `payment_event`, `refund`, `return_request`, `return_line`, `exchange`, `shipment`, `shipment_event`, `campaign`, `campaign_spend`, `attribution_touch`, `promotion`, `promotion_rule`, `promotion_redemption`, `loyalty_account`, `loyalty_transaction`, `referral`, `support_ticket`, `ticket_message`, `review`, `review_response`, `supplier`, `supplier_contact`, `purchase_order`, `purchase_order_line`, `goods_receipt`, `quality_inspection`, `expense`, `financial_transaction`, `ledger_account`, `employee`, `role`, `permission`, `role_permission`, `business_event`, `automation_rule`, `workflow_execution`, `notification`, `report_run`, `cost_snapshot` (commerce COGS), `fx_rate`.

---

## 5. Existing API surface (Express, `src/serverApp.ts`)

- Public probe routes: `/health/live`, `/health/ready`, `/health/deep` (admin), `/api/cron/health` (secret).
- Customer account: `GET /api/account/overview`, `PATCH /api/account/profile`.
- System control plane: ~40 routes under `/api/control/*` (health, SLO, alerts, incidents, deployments, data quality, intelligence, jobs, flags, runbooks, change requests, audit, costs, security, backups, runbook executions).
- Video generation: `/api/generate-video`, `/api/video-status`, `/api/video-download`.
- Targets/coach: ~20 routes under `/api/targets/*`, `/api/metrics*`, `/api/coach/*`.

**Every `/api/*` route except cron/health requires an admin JWT resolved against `public.admins`.** There is **no commerce domain API**: orders, inventory, products, customers, discounts and analytics are mutated directly from the browser with the anon key and RLS. Server-side business rules therefore do not exist for any commerce operation.

---

## 6. Analytics and event tracking assessment

### 6.1 What exists

- `src/tracker/trackingService.ts`: consent gate, DNT honor, anonymous visitor/session IDs, batched inserts into `public.events`, scroll/click/page-view capture, product dwell API.
- `public.events` columns: `id, type, timestamp, sessionId, visitorId, page, deviceClass, viewport, language, referrer, utm, payload, data, details`.
- `aggregate_daily_stats()` daily rollup of `page_view`, `add_to_bag`, `purchase` counts and payload totals.

### 6.2 What is actually instrumented

`grep` across `src/` finds **no calls** to `tracker.trackEvent` for `product_view`, `add_to_bag`, `remove_from_bag`, `checkout_step`, `purchase`, `wishlist_*`, `search`, or `quicklook_open`. The only production use is `tracker.setConsent(true)` in `CookieBanner.tsx`. The engine's constructor emits one `page_view` (only after consent) and window click/scroll listeners.

Consequences:

- product reach/impressions/views/add-to-cart/funnel/cart-abandonment analytics have **no source events**;
- purchases are recorded only as orders, never as purchase events, so `dailyStats.orders` from the event rollup is always 0 even when orders exist;
- attribution (`utm`, referrer) is collected in the type but never populated because `trackEvent` does not read `document.location.search`;
- anonymous visitor → identified customer linking does not exist;
- there is no event dedupe, schema version, product/order/channel column, or ingestion error path.

The analytics screen is therefore honest but mostly empty by design. This is the single largest data prerequisite for Systems 01, 02, 04, 11, 12 and 15.

---

## 7. Confirmed defects and integrity risks (code-referenced)

These are existing defects, not hypothetical future concerns.

| # | Severity | Defect | Evidence |
|---|---|---|---|
| D1 | Critical | **Checkout bypasses the atomic RPC.** `CheckoutModal` calls `createStoreOrder`, which inserts directly into `orders` from the browser. Stock is never decremented, no inventory ledger row is written, no payment record exists, and order + customer writes are not one transaction. | `src/components/CheckoutModal.tsx:83`, `src/supabase/dbService.ts:772-824` |
| D2 | Critical | **`place_order` allows overselling and is not idempotent.** It decrements with `greatest(0, stock - qty)` without checking availability, and still runs the decrement loop when the order insert hit `on conflict do nothing`, so a retried request can decrement twice. It writes no `inventoryLog` row and does not adjust exact variant balances reliably. | `supabase/migrations/0002_production_security.sql` `place_order`, ~lines 72-170 |
| D3 | Critical | **Inventory quick-edit is a browser read-modify-write.** It reads `variants`, computes new stock client-side, writes the whole array back, then upserts a log row. Concurrent operators or checkout will lose updates. `inventoryLog` is also mutable/deletable and not append-only. | `src/admin/inventory/AdminInventoryView.tsx:48-92` |
| D4 | High | **Order lifecycle is unconstrained.** Status/timeline updates are direct client `UPDATE`s with no state machine, no transition validation, no corresponding business event, and a mutable JSONB timeline. | `src/admin/orders/AdminOrdersView.tsx:380-465` |
| D5 | High | **No financial source of truth.** Amounts are `double precision` in JSONB; there is no payment, refund, fee, tax, COGS or ledger table. Gross/net profit and reconciliation cannot be computed. The product model has no cost field at all. | `0001_init_schema.sql` (`price`, `orders.totals`), product editor |
| D6 | High | **Discount state is initialised from `localStorage`, not the database.** `AdminLayout` seeds discounts from `zejesh_discounts`; `AdminDiscountsView` writes to Supabase but `onRefresh` is a no-op, so the visible list is stale and machine-specific. | `src/admin/AdminLayout.tsx:171-178`, `AdminDiscountsView.tsx:30-70` |
| D7 | High | **Waitlist insert targets a non-existent column.** `joinWaitlist` inserts `target`, but `public.waitlist` only has `dropId`; no later migration adds `target`. | `src/supabase/dbService.ts:611-629` vs `0001_init_schema.sql:167-174` |
| D8 | High | **Two incompatible role models coexist.** `admins` (`owner/editor/viewer`) is enforced by `is_admin/can_write/is_owner`; `admin_profiles` (`owner/manager/viewer`) is enforced by `is_admin_user`. There is no department, resource-level permission, or approval authority. | `0002`, `0003`, `0004` |
| D9 | High | **No commerce audit trail by default.** Hash-chained audit exists only for control-plane actions. Commerce mutations rely on ad-hoc `logAuditEvent` calls, and `auditLog` is freely insertable by `anon` and mutable by editors. | `0002` RLS, `dbService.ts:62-82` |
| D10 | Medium | **Catalogue lacks SKU integrity.** Variants live in JSONB; `sku` is not unique across products; `stock` is duplicated at product and variant level and can drift. | `products` schema; inventory view |
| D11 | Medium | **Customer identity is derived from email string normalisation** (`lower(regexp_replace(email,...))`). Email changes create a second record; there is no unique email constraint, merge history, or canonical customer ID. | `0002 place_order`, `dbService.createStoreOrder` |
| D12 | Medium | **Client order creation fabricates fallbacks.** `createStoreOrder` defaults to `customer@zejesh.com` / "Archive Patron" and zero totals if fields are missing. Checkout normally supplies them, but the function violates the no-fabrication rule as a library API. | `dbService.ts:777-806` |
| D13 | Medium | **`events` ingestion has no reliability contract.** Batched insert failure keeps at most 50 queued events in memory and then drops them; no retry, dedupe, schema version, or dead-letter. | `trackingService.ts:222-243` |
| D14 | Medium | **Analytics computes revenue from all orders including cancelled/refunded.** `AdminAnalyticsView` sums `orders` without status filtering; `createStoreOrder` can mark orders `paid` without payment verification. | `AdminAnalyticsView.tsx:69-71` |
| D15 | Medium | **Tests do not cover any critical business workflow.** 40 tests = framing, media, guard, one intelligence calc. No order lifecycle, inventory concurrency, money, refund, RLS execution, or event tests. | `tests/unit/*` |

---

## 8. What is good and must be preserved

1. **Frozen visual system and 19-screen navigation.** No redesign is needed or permitted.
2. **No-seed guard.** The build fails on mock/seed data — keep it and extend it to migrations/services.
3. **Server-side auth gate.** `requireAdmin` verifies Supabase JWTs against `admins` and fails closed without the service key.
4. **Control plane depth.** Hash-chained audit, unique-tail concurrency handling, SLOs, incidents, data quality, flags, runbooks, backups, cost budgets.
5. **Checkout honesty.** The modal refuses to show a receipt unless the row can be read back; errors are surfaced.
6. **Analytics honesty.** Empty/no-source panels say "No data yet" with a reason instead of inventing figures.
7. **RLS baseline.** Catalogue is publicly readable, commerce tables are admin-only, mutations go through role helpers.
8. **Existing targets/coach engine.** Real calculations in `src/services/targetCalculator.ts` can feed the Executive system later.

---

## 9. Proposed surface mapping (19 BOS systems → 19 existing screens)

No new top-level screens or routes will be created. Each system is a **domain service** with an API; its operator surface lives inside an existing screen using existing components and tokens.

| BOS system | Primary existing screen(s) | Delivery mode |
|---|---|---|
| 01 Executive Command Center | 01 Overview, 15 Analytics | read-model APIs consumed by existing KPI/chart components |
| 02 Customer Intelligence | 15 Analytics, 11 Clients | analytics API + cohort/RFM read models |
| 03 CRM | 11 Clients (+ 08 Orders detail) | profile/timeline/notes/tags panels in existing drawers |
| 04 Product Intelligence | 15 Analytics, 04 Products | product performance read model |
| 05 Catalog Management | 04 Products, 05 Collections, 06 Categories, 07 Media | canonical catalogue service, versioning, bulk ops |
| 06 Inventory & Stock | 09 Inventory Control | ledger-backed balances, adjustments, reservations |
| 07 Order Management | 08 Orders | lifecycle API, event history |
| 08 Fulfillment & Logistics | 08 Orders | shipment/picking/packing panel + API |
| 09 Returns, Exchanges, Refunds | 08 Orders, 15 Analytics | return/refund workflow + API |
| 10 Pricing & Promotions | 10 Discounts | rule engine + redemption ledger |
| 11 Marketing & Attribution | 15 Analytics, 02 Control Plane | campaign/attribution read models |
| 12 Sales Channels | 15 Analytics, 01 Overview | channel reconciliation read model |
| 13 Loyalty & Referral | 11 Clients (+ 12 Waitlist) | loyalty ledger + referral API |
| 14 Customer Support | 11 Clients, 08 Orders | ticket panel + API |
| 15 Reviews & Feedback | 13 Suggestions, 04 Products | review moderation + feedback analytics |
| 16 Financial Intelligence | 01 Overview, 15 Analytics | ledger, P&L, reconciliation APIs |
| 17 Suppliers & Procurement | 09 Inventory Control | supplier/PO/receipt API + panel |
| 18 Workforce & Access | 18 Security & Audit | unified RBAC, sessions, approvals |
| 19 Governance & Automation | 02 Control Plane, 03 Health, 17 Atlas, 19 Settings, 18 Security | extend existing system_* plane to commerce rules/jobs/audit |

Existing screens 12 (Waitlists), 14 (CMS), 16 (AI Advisor) and 17 (Atlas) become **consumers** of these services (CRM acquisition, catalogue publishing, intelligence queries, service catalogue) rather than new systems.

---

## 10. Target architecture (modular monolith)

Keep Supabase Postgres as the system of record and Express as the server boundary. Do **not** introduce microservices.

```
Browser (19 admin screens, frozen UI) + Storefront
                    │
          Admin/commerce API (Express)
   ┌────────────┬───────────┬────────────┬────────────┐
   │ Identity & │ Catalogue │ Commerce   │ Intelligence│
   │ Access     │ & Pricing │ (orders,   │ (events,    │
   │            │           │ payments,  │ analytics,  │
   │            │           │ returns)   │ reporting)  │
   └────────────┴───────────┴────────────┴────────────┘
   ┌────────────┬───────────┬────────────┬────────────┐
   │ Inventory  │ Finance   │ CRM/       │ Suppliers/ │
   │ ledger     │ ledger    │ Loyalty    │ Procurement│
   └────────────┴───────────┴────────────┴────────────┘
   ┌──────────────────────────────────────────────────┐
   │ Shared: audit, events, automations, notifications,│
   │ idempotency, jobs, reporting, integration layer   │
   └──────────────────────────────────────────────────┘
                    Supabase Postgres (RLS + RPC)
```

**Boundary rules**

- One writer per fact. Stock changes only via inventory service; money only via financial service; order state only via order service.
- All money in **integer minor units** (`*_minor`), ISO currency, explicit FX rate snapshots. Existing `double` columns remain as compatibility projections until migration completes.
- All critical mutations are transactional RPCs or server endpoints with **idempotency keys**.
- Every mutation emits a canonical `business_event` and an append-only audit entry with actor and before/after.
- Existing JSONB tables stay readable during transition; canonical normalized tables become the source of truth and JSONB is derived/maintained for the UI.

### 10.1 Canonical event envelope (replaces the ad-hoc `events` row for business facts)

```
id (uuid) | type | schema_version | occurred_at | recorded_at
actor_type/actor_id | customer_id? | anonymous_id? | session_id?
product_id? | variant_id? | sku? | order_id? | payment_id? | return_id?
channel | source | campaign_id? | currency? | amount_minor?
idempotency_key (unique) | payload jsonb | consent_basis | correlation_id
```

Core taxonomy (dot-namespaced, versioned): `product.viewed`, `product.impression`, `cart.item_added`, `cart.item_removed`, `checkout.started`, `checkout.completed`, `customer.registered`, `customer.updated`, `order.created`, `order.confirmed`, `payment.completed`, `payment.failed`, `order.cancelled`, `shipment.dispatched`, `shipment.delivered`, `return.requested`, `return.approved`, `refund.issued`, `inventory.stock_changed`, `inventory.reserved`, `review.submitted`, `loyalty.points_earned`, `loyalty.points_redeemed`.

### 10.2 Metric definitions to be codified (examples)

- **Product reach** = distinct `anonymous_id`/`customer_id` with `product.impression` or `product.viewed` in range.
- **Product impressions** = count of `product.impression` events, deduped by `event_id`.
- **Product views** = count of `product.viewed` events (PDP sessions), distinct by session for "visitors".
- **Product conversion rate** = distinct purchasing customers / distinct product viewers (numerator and denominator stated on every report).
- **AOV** = net revenue / orders, excluding cancelled and fully refunded orders.
- **LTV** = sum of recognized net revenue per customer over lifetime; cohort LTV uses acquisition month.
- **Retention** = customers with a repeat purchase in period / customers acquired in the cohort base period.
- **Cart abandonment** = sessions with `cart.item_added` and no `checkout.completed` within 24h / sessions with an add.
- **CAC** = attributed campaign spend / customers acquired.
- **ROAS** = attributed net revenue / campaign spend.

Every metric endpoint must return `definition`, `formula`, `source`, `period`, `filters`, `currency`, `generated_at`, and `completeness` (missing-data flags). No metric may silently use fabricated numbers.

---

## 11. Proposed implementation sequence

Foundations first. Advanced prediction only after events and ledgers exist.

### M0 — Guardrails and migration harness (small)
- Verify which of `0001`–`0012` are applied to the live project; add a schema-version check.
- Add migration/runbook script, rollback notes, and a DB integration test harness (local Postgres or Supabase test project).
- Extend the no-seed guard to new services and SQL.
- **No UI change.**

### M1 — Foundation: identity, money, audit, events, idempotency
- Unified RBAC: one role/permission model, least privilege, departments, approval authority.
- Money as minor units + currency; FX snapshots.
- `business_events` + `audit_events` (extend hash chain to commerce) + `idempotency_keys`.
- Shared service conventions and validation library.
- Migration/backfill plan from existing `*_minor`? (new columns).

### M2 — Inventory ledger and reservations
- `inventory_locations`, `inventory_balances`, immutable `inventory_movements`, `stock_reservations`.
- Backfill from `products.variants` and `inventoryLog`.
- Concurrency-safe `reserve_stock` / `release_stock` / `commit_sale` RPCs (row locks, availability checks, no `greatest(0, …)`).
- Replace browser read-modify-write; preserve the existing Inventory screen visuals.

### M3 — Order lifecycle, checkout, payments, fulfillment
- `order_lines`, `order_events`, `payments`, `payment_events`, `shipments`, `shipment_events`.
- Server-authoritative `create_order` RPC: idempotent, re-prices server-side, reserves stock, writes payment intent, emits events.
- Order state machine with allowed transitions; partial fulfillment; cancellation releases reservations.
- Migrate `CheckoutModal` to the server endpoint; keep current UI and honest error states.
- Fix D1–D4, D7, D12; deprecate unsafe `place_order` and `createStoreOrder`.

### M4 — Returns, exchanges, refunds
- `returns`, `return_lines`, `exchanges`, `refunds`, refund state machine.
- Inspection dispositions (`restock`, `damaged`, `quarantine`); only approved dispositions create positive inventory movements.
- Link to order, customer, inventory and financial ledgers.

### M5 — Financial ledger, COGS, expenses, reconciliation
- `ledger_accounts`, `journal_entries`, `journal_lines`, `financial_transactions`, `expenses`, `product_costs`, `supplier_invoices`.
- Server-calculated gross/net profit, COGS, payment fees, shipping margin, tax, cash flow.
- Daily reconciliation job: orders ↔ payments ↔ refunds ↔ ledger ↔ inventory COGS; surface mismatches in existing Control Plane data-quality panel.

### M6 — Event instrumentation and attribution
- Call tracker for product views/impressions, cart add/remove, checkout start/complete, purchase, search, wishlist, size select.
- Populate UTM/referrer/channel, link anonymous IDs to customers after checkout/login.
- Server ingestion endpoint with schema validation, dedupe, retries, dead-letter, consent enforcement.
- Backfill known historical orders into `business_events` (marked `source: backfill`).

### M7 — Customer intelligence and CRM
- RFM, cohorts, retention, LTV, repeat rate, acquisition channels, product attention vs conversion.
- Unified customer profile, merge/dedupe, tags, notes, timeline, preferences, consent.
- Wire into existing Clients and Analytics screens; exportable reports with definitions.

### M8 — Product intelligence and catalogue management
- Performance per product/variant/SKU/collection; attention-without-conversion; high-demand/low-stock; lifecycle.
- Product version history, bulk operations, relationships/recommendations, attributes, cost fields.
- Fix D10 (SKU uniqueness) with backfill and validation.

### M9 — Pricing/promotions and loyalty/referrals
- Promotion rules, stacking, limits, scheduled prices, coupons, customer-specific offers; actual discount impact.
- Immutable loyalty ledger, tiers, referral attribution and abuse controls.
- Fix D6 (discounts localStorage).

### M10 — Marketing, attribution and channels
- Campaigns, spend, first/last/configurable multi-touch attribution, CAC/ROAS.
- Channel reconciliation across orders/payments/refunds; tracked vs estimated labels.

### M11 — Support, reviews and feedback
- Tickets, assignment, SLA, escalation, satisfaction; review verification and issue taxonomy.
- Link to customers/orders/returns; no removal of genuine feedback.

### M12 — Suppliers and procurement
- Suppliers, contacts, purchase orders, approvals, receipts, inspections, lead times, performance.
- Connect receipts to inventory movements and invoices to the financial ledger.

### M13 — Workforce and access hardening
- Unify roles, resource-level permissions, session inventory, denied-access analytics, step-up approvals, two-person approval for destructive actions.
- Server-side enforcement for every commerce mutation (not UI hiding).

### M14 — Governance, automation, reporting
- Configurable rules engine (conditions/triggers/actions/approvals), execution logs, retries, duplicate-execution protection, failure states.
- Alerts: low stock, return anomalies, delayed shipments, payment failures, supplier delays.
- Async report generation (CSV/XLSX/PDF) with definition metadata, pagination, access control.
- Extend existing control-plane jobs/audit/health rather than duplicating.

### M15 — Verification and hardening
- DB constraint tests, RLS tests executed in CI, inventory concurrency tests, order/refund/payment calculation tests, reconciliation tests, event dedupe/replay tests, authorization tests.
- End-to-end business-event propagation check: paid order updates inventory, customer history, revenue, product performance exactly once.
- Update docs and mark anything incomplete honestly.

---

## 12. Decisions required before foundational work

1. **Live database state:** are all migrations `0001`–`0012` applied? Is there production data that must be preserved? (No DB credentials are present in `.env`; only Supabase URL/keys.)
2. **Migration delivery:** apply migrations directly if a database connection is provided, or deliver reviewed SQL for the Supabase SQL Editor.
3. **Money policy:** confirm integer minor units with EUR base and FX snapshot table.
4. **Role policy:** which of the two existing role models is authoritative, and what departments/approval thresholds are required.
5. **UI latitude:** confirm that functional controls may be added **inside** existing screens using existing components/tokens (no new screens, no visual redesign). Without this, Systems 03, 08, 09, 13, 14, 15, 17 can only be backend/API-complete, not operator-operable.
6. **Order surface:** confirm the checkout migration to a server-authoritative RPC may change the checkout's internal call path while preserving its visuals and error behaviour (it must, to fix D1).

---

## 13. Suggested first build slice (after approval)

**M1 + M2 + M3 foundation slice**, delivered as reversible migrations + tested services:

1. `0013_bos_foundation.sql`: unified roles/permissions, `business_events`, `idempotency_keys`, minor-unit money columns.
2. `0014_inventory_ledger.sql`: locations, balances, immutable movements, reservations, concurrency-safe RPCs, backfill.
3. `0015_orders_payments.sql`: order lines/events, payments, shipments, state machine, atomic idempotent checkout RPC.
4. Server endpoints under `/api/commerce/*` with validation and RBAC.
5. Wire checkout + inventory + order status to the new endpoints (no visual change).
6. Tests: oversell prevention, duplicate checkout idempotency, partial refund accounting, stock reconciliation, RLS.
7. Verification report showing one paid order propagating to inventory, customer, revenue and events exactly once.

This slice fixes the critical integrity defects first, creates the data foundation every later system depends on, and produces measurable proof before analytics/prediction work begins.
