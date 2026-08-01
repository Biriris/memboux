# Verified technical debt

This register contains conditions visible in the audited source. It does not treat roadmap ideas as defects. Severity reflects likely operational or maintenance impact, not confirmed production incidents.

## High priority

### Event purge can leave specialized R2 objects

- **Evidence:** [`permanentlyDeleteEvent`](../../src/repositories.ts) enumerates ordinary `media` keys and separately looks up cover/menu keys. It does not enumerate `event_wedding_media`. D1 cascades remove metadata, not R2 bytes.
- **Impact:** permanent event deletion can leave wedding-library objects and their generated variants in R2, creating privacy, retention, and cost risk.
- **Existing coverage:** [`retention.test.ts`](../../test/retention.test.ts) and [`official-album-retention.test.ts`](../../test/official-album-retention.test.ts) do not establish complete specialized-object deletion.
- **Required follow-up:** define a complete object ownership manifest and add deletion/integration tests before relying on event purge for data-erasure guarantees.

### Payment fulfillment is not wired to a registered production route

- **Evidence:** [`src/commerce.ts`](../../src/commerce.ts) contains catalog/order/fulfillment logic and [`commerce-fulfillment.test.ts`](../../test/commerce-fulfillment.test.ts) tests it; [`src/routes/commerce.ts`](../../src/routes/commerce.ts) exposes checkout display and draft creation only. The route inventory contains no Stripe checkout or payment-provider webhook.
- **Impact:** the code cannot currently demonstrate an end-to-end paid unlock path. Manual D1 mutation or future integration could bypass expected idempotency/readiness behavior.
- **Required follow-up:** define the provider contract, signature verification, idempotency boundary, fulfillment caller, and launch rollback plan. Until then, keep `commerce_launch_settings.payments_enabled` false.

### Deployment state is not represented in repository evidence

- **Evidence:** `wrangler.jsonc` defines resources and crons, but there is no committed record of remote D1 migration level, deployed Worker version, Email Routing target, R2 lifecycle settings, or secret readiness.
- **Impact:** a green checkout/CI result cannot prove environment parity; newer code may depend on migrations `0059`/`0060` that are absent remotely.
- **Required follow-up:** add a non-secret environment manifest and deployment verification that reports Worker version, binding presence, migration level, routing readiness, and rollback target.

## Medium priority

### Route and view modules are very large

- **Evidence:** audit-time sizes include [`routes/wedding.ts`](../../src/routes/wedding.ts) at about 117 KB, [`routes/account.ts`](../../src/routes/account.ts) at about 100 KB, [`routes/admin.ts`](../../src/routes/admin.ts) at about 72 KB, [`routes/gallery.ts`](../../src/routes/gallery.ts) at about 63 KB, and [`views/event-workspace.ts`](../../src/views/event-workspace.ts) at about 62 KB.
- **Impact:** authorization, validation, persistence, HTML, and client scripts are difficult to review independently; change collision and regression risk grows with features.
- **Required follow-up:** extract cohesive controllers/use cases/view components without changing route contracts, using characterization tests first.

### Persistence boundaries are inconsistent

- **Evidence:** [`support-repository.ts`](../../src/support-repository.ts) provides a dedicated repository and [`repositories.ts`](../../src/repositories.ts) contains retention helpers, but most route and domain modules embed SQL directly.
- **Impact:** schema changes require broad search-and-edit, transaction boundaries are hard to see, and equivalent rules may diverge across admin, guest, studio, and wedding paths.
- **Required follow-up:** introduce domain-specific repositories incrementally for events, media, access, commerce, and backups; keep D1 statements explicit and testable.

### Authorization is centralized only for admin routes

- **Evidence:** admin permission mapping is centralized in [`admin-rbac.ts`](../../src/admin-rbac.ts), while account/event/gallery/studio routes individually call `currentUser`, `getEventRole`, lifecycle checks, or gallery checks.
- **Impact:** new routes can omit one of several required gates; behavior differs between similar media endpoints.
- **Required follow-up:** create tested route guards/policies for event capability plus lifecycle and media delivery, then inventory every route against them.

### Event schema carries parallel legacy and current columns

- **Evidence:** after [`0060_expand_event_types_and_locales.sql`](../../migrations/0060_expand_event_types_and_locales.sql), `events` contains `couple`, `eventName`, `default_locale_legacy`, `default_locale`, `event_type_legacy`, and `event_type`.
- **Impact:** writes and reads can drift between legacy/current fields; constraints and nullability do not reflect a single canonical model.
- **Required follow-up:** measure remaining reads, backfill/validate, select canonical columns, and remove legacy fields in a separately staged rebuild.

### Type coverage has localized escape hatches

- **Evidence:** D1 results use `all<any>()` in [`routes/experience.ts`](../../src/routes/experience.ts) and [`wedding-portraits.ts`](../../src/wedding-portraits.ts); several handlers accept broad `Record<string, unknown>` and transform it manually.
- **Impact:** schema/renderer mismatches can survive compilation.
- **Required follow-up:** define row/input types and reusable validation schemas at external boundaries.

### Scheduled jobs have logging but no durable retry/alert contract

- **Evidence:** [`src/index.ts`](../../src/index.ts) runs daily jobs concurrently with `Promise.allSettled` and logs rejection. Support reminders retry from D1 state; trash/quota/trial reconciliation has no explicit alert or dead-letter path.
- **Impact:** repeated failures may be visible only in logs and can delay retention, quota correction, notifications, or backup initiation.
- **Required follow-up:** define SLOs, retry/idempotency guarantees, alert thresholds, and operator runbooks per job.

### Observability is partial

- **Evidence:** invocation logs are enabled and traces disabled in [`wrangler.jsonc`](../../wrangler.jsonc). Logs are mostly direct `console` calls; no correlation-ID middleware, metrics binding, or documented alert integration is present.
- **Impact:** cross-request and Workflow incident diagnosis is limited.
- **Required follow-up:** standardize structured fields, request/job IDs, redaction, metrics, and alerts before higher traffic.

### Wedding guest contact retention is not yet operationalized

- **Evidence:** [`0061_wedding_guest_planning.sql`](../../migrations/0061_wedding_guest_planning.sql) stores names, email addresses, phone numbers, dietary notes and invitation-token hashes under the event. Owners can edit/delete directory records and linked RSVP data through [`wedding-planning.ts`](../../src/routes/wedding-planning.ts), but no guest-specific retention, export or formal data-rights workflow is documented.
- **Impact:** the product now holds additional personal and dietary data without a source-defined minimization or retention policy.
- **Required follow-up:** approve purposes and retention periods, define guest data-rights handling, document SMS consent before delivery exists, and include the tables in privacy/export review.

## Lower priority / contained debt

### Generated and source CSS names are not a single obvious contract

`build:css` in [`package.json`](../../package.json) writes `public/app-midnight.css`, while the generated-asset step in [`.github/workflows/quality.yml`](../../.github/workflows/quality.yml) checks `public/app.css` and `worker-configuration.d.ts`. `public/` also contains `app-manrope.css`. The build output and CI drift target are therefore inconsistent; which CSS files are generated versus intentionally retained is not documented.

### Better Auth route surface is opaque in repository docs

The app registers `/api/auth/*`, but individual dependency-owned paths are not locked in an API contract or dependency-version-specific inventory. This is acceptable for internal UI use but complicates external API consumers and security review.

### Backup scope excludes specialized media

Drive/Dropbox snapshots contain ordinary `media` rows only. Covers, wedding library/menu, and support attachments are omitted. This may be deliberate, but no source-adjacent product contract states the scope, making user expectations ambiguous.

### Readiness endpoints are narrow

`/health/ready` tests D1 only; `/health/email` separately tests DNS/config. R2, Images, AI, Workflows, and external OAuth readiness are not covered by the public readiness response. Admin readiness adds checks, but it is not a deployment health contract.

## Not classified as debt without more evidence

- Workers AI being optional may be intentional graceful degradation.
- Direct SQL is not inherently a defect; the debt is inconsistent ownership and duplicated policy.
- The single-Worker architecture is not inherently unscalable. Current production load, latency, CPU, D1 contention, R2 volume, and cost data are **Unknown**, so no scaling bottleneck is claimed as observed.
