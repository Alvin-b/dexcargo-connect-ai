# Dex Cargo v2 — Kenya Warehouse & Release Management

We are pivoting the backend from a China↔Kenya consolidation platform to a **Kenya-only warehouse, payment, and release management system**. The China-side desktop app and its endpoints are removed. Package intake now starts with an **AI OCR photo of the sticker**, and every touch is tied to an **Employee ID** for a full audit trail.

## What changes

### Removed
- All `/api/desktop/*` routes (China-side sticker printing, left-behind, bulk sticker).
- `left_behind_total`, China-warehouse batching flows, and the "loaded into batch" arrival check.
- Public client self sign-up: only admins create employee accounts.

### Kept (still useful)
- Supabase auth + `user_roles` + `has_role`.
- M-Pesa STK push via KCB Paybill 522522 + `daraja-callback`.
- `packages`, `package_events`, `payments`, `clients` tables (extended, not rebuilt).
- `warehouses` / `countries` (kept for future multi-branch — Kenya-only rows for now).
- Evolution WhatsApp notifier (status updates to customer).

### New / Reworked

**1. Employee identity (`employees` table, one row per staff auth user)**
- `employee_code` (auto: `DEX-0001`, immutable, shown on receipts/audit).
- `full_name`, `email`, `phone`, `role` (`admin` | `warehouse` | `cashier` | `releaser`), `branch_id` (→ `warehouses`), `status` (`active` | `suspended`), `created_by`.
- Populated by admin via `POST /api/mobile/admin/employees` (creates auth user with password, `user_roles` row, `employees` row).
- `PATCH` to edit / suspend / change role. `POST .../reset-password` triggers admin password reset.

**2. OCR intake (`POST /api/mobile/packages/extract-label` already exists)**
- Extend to also return suggested `customer_name`, `phone`, `courier`, `weight`, `destination_city`, `reference_numbers[]`, `raw_text`.
- New `POST /api/mobile/packages` (manual save after OCR review) — replaces auto-create in `scan.ts`. Stores `intake_photo_url`, `ocr_payload` (jsonb), `ocr_confidence`, and links `received_by_employee_id`.
- `packages.scan.ts` becomes status-transition only (no auto-create).

**3. Package lifecycle (new enum `package_status_v2`)**
`received` → `awaiting_payment` → `paid` → `ready_for_collection` → `released` → `cleared`.
Each transition writes a `package_events` row with `employee_id`, `at`, `notes`, and optional `payment_id`.

**4. Release flow (`POST /api/mobile/packages/:id/release`)**
- Requires: package is `paid` or cash-on-collection recorded now.
- Captures: `released_by_employee_id`, `recipient_name`, `recipient_id_number`, `recipient_phone`, `signature_url` (optional), `notes`.
- Auto-inserts payment row if cash paid at counter.
- Moves status to `released`, then a nightly job (or immediate flag) marks `cleared`.

**5. Cleared packages view (`GET /api/mobile/packages/cleared`)**
Returns full archive record per spec: tracking, customer, amount, mpesa code, received/released timestamps + employee codes, dwell time, image URL, ocr payload.

**6. Payments**
- `POST /api/mobile/payments` already supports mpesa STK.
- New `POST /api/mobile/payments/manual` for cash / bank / manual-mpesa-code entry by cashier (records `recorded_by_employee_id`, `mpesa_code`, `method`).
- Existing daraja callback links transaction back to package.

**7. Audit-first (`audit_logs` already exists — extend usage)**
- Add DB trigger on `packages`, `payments`, `employees` capturing `actor_employee_id`, `action`, `old`, `new`, `at`.
- New `GET /api/mobile/admin/audit` (admin only) filterable by employee, package, date.
- New `GET /api/mobile/admin/employees/:id/activity` — packages received, released, payments handled, logins.

**8. Search (`GET /api/mobile/search?q=...`)**
Single endpoint that fans out over tracking_number, internal package_id, customer name/phone, mpesa code, employee_code. Uses existing `pg_trgm`.

**9. Dashboard (`GET /api/mobile/stats/dashboard`)**
Today: received, awaiting_payment, ready_for_collection, cleared, revenue (KES), active employees, recent activity feed, 30-day trend.

**10. Reports (`GET /api/mobile/reports/*`)**
`daily`, `weekly`, `monthly`, `revenue`, `employee-performance`, `mpesa-reconciliation`, `turnaround-time`. All CSV + JSON.

## Migrations (single migration)

```text
- create type employee_role, package_status_v2, payment_method
- create table employees (+ auto employee_code sequence)
- alter packages: add intake_photo_url, ocr_payload jsonb, ocr_confidence,
  received_by_employee_id, released_by_employee_id, released_at,
  recipient_name, recipient_id_number, recipient_phone,
  status_v2 (backfilled from status), cleared_at
- alter payments: add method, recorded_by_employee_id, mpesa_code (unique nullable)
- audit trigger function + triggers
- GRANTs + RLS on employees (admin all, self read)
- drop unused: left_behind_total column
```

## Files

**Delete:** `src/routes/api/desktop/*`, `src/server/sticker.ts`.

**Add:**
- `src/routes/api/mobile/admin/employees.ts` (+ `.$id.ts`, `.$id.reset-password.ts`)
- `src/routes/api/mobile/packages/index.ts` rewrite (POST = create after OCR)
- `src/routes/api/mobile/packages.$id.release.ts`
- `src/routes/api/mobile/packages.cleared.ts`
- `src/routes/api/mobile/payments.manual.ts`
- `src/routes/api/mobile/search.ts`
- `src/routes/api/mobile/admin/audit.ts`
- `src/routes/api/mobile/admin/employees.$id.activity.ts`
- `src/routes/api/mobile/reports.$kind.ts`
- `src/server/employees.ts` (code generator, resolver from auth user)
- `src/server/audit.ts` (extend with `logPackageChange` etc.)

**Edit:** `packages.scan.ts` → status-transition only. `stats.ts` → dashboard shape. `auth.me.ts` → include `employee_code`, `branch_id`.

## Not in scope this pass
- Rebuilding the web dashboard UI (backend-only, per project scope).
- Rewriting the Android spec doc — will update in a follow-up once endpoints are live.
- Multi-branch UI (schema ready via `warehouses.branch_id`, but only one Kenya branch seeded).

Approve and I'll ship the migration + routes + deletions in one pass.
