# Kenya Logistics Backend — Full Rebuild Plan

Rebuild the backend as a Kenya-only, mobile-first API. OCR runs on the phone (Google ML Kit); the backend receives structured JSON + the original sticker photo. All China-side sync, batching, containers, and loading logic are removed.

Stack stays TanStack Start server routes + Lovable Cloud (Postgres, Auth, Storage) + M-Pesa Daraja + Evolution WhatsApp + Lovable AI Gateway (optional server-side re-validation only). No frontend work — API endpoints only.

## 1. Remove (China-era surface)

Delete routes:
- `batches.ts`, `batches.$id.ts`, `batches.$id.close.ts`, `batches.$id.scan.ts`
- `packages.scan.ts` (auto-create from China scan), `packages.extract-label.ts` (server OCR — OCR is now on-device)
- `packages.ready-for-pickup.ts`, `packages.$id.deliver.ts` (replaced by unified release), `packages.lookup.ts` (folded into `/search`)
- `countries.ts`, `warehouses.ts` (Kenya-only; single warehouse table stays for shelf/bin)
- `quote.ts`, `rates.ts`, `rates.$id.ts`, `rates.lookup.ts` (no quoting — charges come from package)
- `clients.ts`, `clients.$id.ts`, `clients.$id.consent.ts` → replaced by `customers.*`
- `staff.ts` → replaced by `admin/employees.*` (already exists)
- Server helpers: `quote.ts`

Drop tables (in migration): `loading_batches`, `batch_packages`, `rates`, `countries`, `clients` (data migrated into `customers` if needed).

## 2. Database rebuild (single migration)

New / restructured tables:
- **customers** — replaces `clients`. Fields: full_name, phone (unique, normalized 2547…), whatsapp_number, national_id, email, default_address, city, notes, is_active. Backfill from `clients`.
- **packages** — slim schema focused on Kenya intake:
  tracking_number (unique), external_barcode, customer_id → customers, supplier, description, category, weight_kg, length_cm/width_cm/height_cm, courier, destination_city, special_notes,
  status (`received`|`verified`|`awaiting_payment`|`paid`|`ready_for_collection`|`collected`|`cleared`),
  amount_due, currency (KES),
  qr_code_token (uuid, unique), barcode,
  warehouse_id, shelf_id, bin_code,
  intake_photo_url, ocr_payload (jsonb, from phone), ocr_confidence,
  received_by_employee_id, received_at, verified_at, ready_at, collected_at, cleared_at.
- **package_images** — package_id, kind (`sticker`|`extra`|`proof_of_collection`|`qr`), url, uploaded_by, created_at.
- **package_status_history** — package_id, from_status, to_status, notes, changed_by_employee_id, created_at.
- **warehouse_shelves** — warehouse_id, code, section, capacity.
- **warehouse_bins** — shelf_id, code, is_occupied.
- **payments** — kept; extend with `receipt_url`, ensure `method` in (`mpesa_stk`,`mpesa_manual`,`cash`,`bank`), `status` in (`pending`,`paid`,`failed`,`refunded`,`cancelled`).
- **commissions** — employee_id, package_id, payment_id, trigger (`received`|`payment`|`delivery`), amount, percentage, status (`pending`|`approved`|`paid`), approved_by, approved_at.
- **commission_rules** — role or employee_id, trigger, percentage, flat_amount, active.
- **deliveries** — package_id, collected_by_name, collected_by_id_number, collected_by_phone, relationship_to_customer, signature_url, proof_photo_url, released_by_employee_id, collected_at.
- **whatsapp_logs** — customer_id, package_id, template, payload, status, provider_message_id, error, created_at.
- **notifications** — kept (internal alerts, extend audience enum for `employee`).
- **audit_logs** — kept; ensure `logAudit()` called from every mutation.
- **settings** — key/value jsonb for tunables (commission defaults, WhatsApp templates, working hours).

Keep: `employees`, `user_roles`, `profiles`, `audit_logs`, `idempotency_keys`, `rate_limit_hits`, `push_tokens`, `delivery_signatures` (merge into `deliveries`).

Every new public table: GRANT to authenticated + service_role, ENABLE RLS, staff-only policies via `is_staff(auth.uid())` plus admin-only for destructive ops.

DB helpers:
- `generate_qr_token()` — SECURITY DEFINER, returns unique token.
- `transition_package_status(_id, _to, _by, _notes)` — validates transition + writes history row.
- `award_commission(_package_id, _trigger)` — reads `commission_rules`, inserts commission.
- Trigger on `packages` insert → auto-generate qr_code_token + `received` history row + `received` commission.

## 3. New API surface (all under `/api/mobile/`, staff-authenticated)

### Auth (unchanged)
- `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/reset-password`

### Employees (admin) — keep existing `admin/employees.*`, add:
- `GET /admin/employees/:id/commission-summary`
- `PATCH /admin/employees/:id/commission-percentage`

### Customers (replaces clients)
- `GET /customers` (search q, is_active, page)
- `POST /customers`
- `GET /customers/:id` (with packages + outstanding balance)
- `PATCH /customers/:id`
- `POST /customers/:id/deactivate`
- `GET /customers/:id/history`

### Packages (core)
- `POST /packages/intake` — body: structured OCR JSON + intake_photo_url (already uploaded via `/uploads`). Creates package in `received`. Auto QR + history + commission.
- `GET /packages` — filter by status, employee, customer, date, q.
- `GET /packages/:id` — full detail incl. images, history, payments, deliveries.
- `PATCH /packages/:id` — edit extracted fields (audit-logged).
- `POST /packages/:id/verify` → `verified`, sets amount_due if provided.
- `POST /packages/:id/set-charges` — amount_due, currency; transitions to `awaiting_payment`; triggers WhatsApp "payment required".
- `POST /packages/:id/assign-location` — warehouse_id, shelf_id, bin_code.
- `POST /packages/:id/images` — attach extra photo.
- `GET /packages/:id/qr` — return QR PNG/SVG data URL.
- `POST /packages/scan` — body: `{ qr_token | barcode | tracking_number }` → returns package. (Replaces old scan endpoint semantics.)
- `POST /packages/:id/mark-ready` → `ready_for_collection` (guard: paid or cash-on-collection allowed). WhatsApp "ready".
- `POST /packages/:id/collect` — body: recipient details, signature_url, proof_photo_url, cash payment if any → creates `deliveries` row, transitions `collected`. WhatsApp "collected". Awards delivery commission.
- Nightly job: `collected` older than N days → `cleared`.
- `GET /packages/cleared` — archive view (kept, filters expanded).

### Payments
- `POST /payments/stk-push` — package_id, phone → Daraja STK.
- `POST /payments/manual` — cash / bank / manual mpesa code (kept).
- `GET /payments`, `GET /payments/:id`
- `GET /payments/:id/receipt` — signed receipt HTML/PDF URL.
- `POST /payments/:id/verify` — re-query Daraja by CheckoutRequestID.
- `POST /public/daraja-callback` — kept; on success transitions package to `paid` + awards payment commission + WhatsApp "payment confirmed".

### Warehouse
- `GET /warehouses`, `POST /warehouses` (admin)
- `GET /warehouses/:id/shelves`, `POST /warehouses/:id/shelves`
- `GET /shelves/:id/bins`, `POST /shelves/:id/bins`
- `GET /warehouses/:id/occupancy`

### Commissions
- `GET /commissions` — filter by employee, status, period.
- `GET /commissions/summary?employee_id=&from=&to=`
- `POST /commissions/:id/approve` (admin)
- `POST /commissions/bulk-approve` (admin)
- `GET /commission-rules`, `POST /commission-rules`, `PATCH /commission-rules/:id` (admin)

### Notifications & WhatsApp
- `GET /notifications`, `POST /notifications/:id/read` (kept)
- `POST /whatsapp/send` — package_id + template; internal wrapper over Evolution.
- `GET /whatsapp/logs?customer_id=&package_id=`

### Search
- `GET /search?q=` — unified across tracking, barcode, qr_token, customer name/phone, mpesa code, employee_code (kept, expand fields).

### Dashboard & Reports
- `GET /stats/dashboard` — today's packages, collections, revenue, pending payments, ready-for-collection, working employees, monthly trend.
- `GET /reports/revenue?from=&to=&format=json|csv`
- `GET /reports/packages`
- `GET /reports/payments`
- `GET /reports/commissions`
- `GET /reports/employee-performance`
- `GET /reports/outstanding-balances`

### Uploads
- `POST /uploads` — kept; used for sticker photo, signature, proof of collection, extra images.

### Audit (admin)
- `GET /admin/audit` — kept.

## 4. Cross-cutting

- **Auth guard**: all `/api/mobile/*` require `requireSupabaseAuth` + `getEmployeeByUserId` active check (helper `requireActiveEmployee`).
- **Audit**: every mutation calls `logAudit()` with resource_type + before/after diff (via a small `withAudit()` wrapper).
- **Idempotency**: intake, collect, stk-push, manual payment use `withIdempotency`.
- **Rate limits**: intake 120/min, stk-push 10/min per user, whatsapp/send 30/min.
- **Validation**: Zod schemas per endpoint; reject unknown fields.
- **Status machine**: all transitions go through `transition_package_status` — no direct `UPDATE status`.
- **Commission engine**: fired from status transitions (`received`, payment `paid`, delivery `collected`) via `award_commission`.

## 5. Deliverables (this pass)

1. One migration: drop old tables, add new tables + enums + functions + triggers + RLS + GRANTs.
2. Delete removed routes and helpers.
3. Create ~35 new/rewritten route files listed above.
4. Add helpers: `src/server/packages.ts` (transitions, QR), `src/server/commissions.ts`, `src/server/whatsapp.ts` (wraps `evolution.ts` with templates), `src/server/customers.ts`, `src/server/warehouse.ts`, `src/server/reports.ts`.
5. Keep `daraja.ts`, `evolution.ts`, `api-auth.ts`, `audit.ts`, `idempotency.ts`, `rate-limit.ts`, `employees.ts`.

## Out of scope
- Mobile app code (frontend is Flutter, separate repo).
- Web admin dashboard rebuild (existing dashboard.* routes untouched this pass; may break — mark for future cleanup).
- AI-agent WhatsApp bot (future).
- PDF receipt generation library selection (return HTML for now; PDF later).

## Technical notes
- QR: server stores `qr_code_token` (uuid). Endpoint returns `qrserver.com`-style URL OR generates SVG with `qrcode` npm package — will `bun add qrcode` in implementation.
- Commission calc: percentage of `amount_due` on payment trigger; flat per package on received/delivery; configurable via `commission_rules`.
- Status transitions enforced in DB — invalid transitions raise, caught and returned as 409.
- Existing `dashboard.*` UI routes will reference dropped tables; they'll break but user confirmed backend-only focus. Will note in final message.

Approve to execute.
