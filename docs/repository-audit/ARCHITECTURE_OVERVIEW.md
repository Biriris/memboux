# Architecture overview

## System shape

Memboux is a single Cloudflare Worker using Hono and server-rendered HTML. The same Worker handles public pages, account UI, JSON/form APIs, admin UI, media delivery, Better Auth, inbound support email, scheduled reconciliation, and exports two Cloudflare Workflow classes. This is verified by [`src/index.ts`](../../src/index.ts) and [`wrangler.jsonc`](../../wrangler.jsonc).

```text
Browser / email / cron
        |
        v
Cloudflare Worker (Hono, src/index.ts)
  |-- route modules + server-rendered views
  |-- Better Auth
  |-- domain/application helpers
  |-- Google Drive and Dropbox Workflow entrypoints
        |
        +-- D1: relational state, auth, permissions, lifecycle, audit
        +-- R2: original media, derived images, covers, menus, attachments
        +-- Images: on-demand image transformations
        +-- Workers AI: support assistant
        +-- Resend / Google / Dropbox / Google Places: outbound HTTPS APIs
```

## Request runtime

The HTTP pipeline in [`src/index.ts`](../../src/index.ts) is ordered as follows:

1. Redirect production-host HTTP requests to HTTPS.
2. Apply Hono secure headers with camera, geolocation, and microphone disabled.
3. Apply Hono CSRF middleware globally.
4. For `/admin/*`, exempt login/logout, resolve the Better Auth user to an active `admin_members` row, map the request to an admin permission, enforce RBAC, and schedule an audit record for successful non-read mutations.
5. Redirect `/admin` to the role-specific admin home.
6. Add `Cache-Control: private, no-store` to HTML responses.
7. Dispatch to all route collections mounted at `/`.
8. Return explicit `HTTPException` responses, expose stack traces only on localhost, and otherwise return a generic 500 response.

Static assets are exposed through the `ASSETS` binding, but no explicit `ASSETS.fetch()` fallback appears in `src/index.ts`; asset delivery behavior therefore depends on Cloudflare Workers Assets configuration. Exact not-found precedence between Worker routes and assets is **Unknown** from application code alone.

## Runtime entry points

| Entry point | Implementation | Responsibility |
| --- | --- | --- |
| `fetch` | `app.fetch` in [`src/index.ts`](../../src/index.ts) | HTTP pages, APIs, auth, admin, and media delivery. |
| `email` | [`handleSupportEmailMessage`](../../src/inbound-support-email.ts) | Parses inbound support email, ignores DMARC aggregate reports through [`support-email-filter.ts`](../../src/support-email-filter.ts), verifies ticket/actor rules, records messages and attachments, and may send customer replies. Dashboard Email Routing configuration is **Unknown**. |
| `scheduled` | default export in [`src/index.ts`](../../src/index.ts) | Runs daily reconciliation/retention jobs or 15-minute support SLA reminders based on the triggering cron string. |
| `GoogleDriveBackupWorkflow` | [`src/google-drive.ts`](../../src/google-drive.ts) | Durable snapshot and per-item upload of event media to Google Drive. |
| `DropboxBackupWorkflow` | [`src/dropbox.ts`](../../src/dropbox.ts) | Durable snapshot and per-item upload of event media to Dropbox. |

## Application layers as implemented

The code has recognizable layers, but their boundaries are not consistently enforced:

- **Route/controllers:** `src/routes/*` parse input, authorize, call D1/R2/external APIs, and render or redirect.
- **Views:** `src/views/*` return HTML strings and embedded client-side scripts.
- **Domain/application services:** focused modules such as [`event-access.ts`](../../src/event-access.ts), [`commerce.ts`](../../src/commerce.ts), [`support-service.ts`](../../src/support-service.ts), and [`cloud-backups.ts`](../../src/cloud-backups.ts).
- **Repositories:** [`repositories.ts`](../../src/repositories.ts) contains event/media retention helpers, while [`support-repository.ts`](../../src/support-repository.ts) is a class-based support data-access boundary. Most other modules and routes issue D1 SQL directly.
- **Infrastructure adapters:** [`auth.ts`](../../src/auth.ts) for Better Auth/Resend, [`google-drive.ts`](../../src/google-drive.ts), [`dropbox.ts`](../../src/dropbox.ts), [`places.ts`](../../src/places.ts), R2 calls in media/support modules, and Workers AI in [`support-ai.ts`](../../src/support-ai.ts).

## Authenticated event workspace

`GET /dashboard/:code` renders the event overview, including plan/access state and event details. Exact routes below it (`/website`, `/guests`, `/media`, `/menu`, `/share`, and `/team`) render focused workspace areas in [`src/routes/events.ts`](../../src/routes/events.ts). The former `/manage` URL remains only as a compatibility alias that renders the overview and is no longer a workspace step. [`src/views/event-workspace.ts`](../../src/views/event-workspace.ts) renders the event-specific panels, while [`src/views/event-workspace-shell.ts`](../../src/views/event-workspace-shell.ts) owns the responsive workspace navigation.

The navigation is derived from the verified event membership role without changing the capability model: owners receive website, guests, media, wedding-menu, sharing, team, and plan/settings pages; editors and viewers receive only overview, media, and sharing pages. Owner-only section requests are rejected server-side. The shell exposes `data-workspace-section-link` attributes, marks the selected page with `aria-current="page"`, and emits a local `memboux:workspace-navigation` browser event when a section link is selected. No analytics provider consumes that event in this repository.

On narrow viewports, the shell keeps a compact sticky navigation strip visible instead of placing sections inside a collapsed disclosure. The active section is centered in the horizontal strip on page load; the desktop breakpoint retains the full sidebar navigation.

## State and external systems

- D1 is authoritative for users, sessions, events, membership, media metadata, quotas, lifecycle state, commerce drafts, support, backup state, and audit records. See [Database schema](DATABASE_SCHEMA.md).
- R2 stores private binary objects. Routes authorize reads and stream objects; there is no public R2 URL in configuration. See [Media lifecycle](MEDIA_LIFECYCLE.md).
- Workflows perform provider backups from a D1 snapshot and R2 objects. Automatic reconciliation is initiated by the daily cron.
- Resend is called over HTTPS for transactional email; webhook delivery events enter through `/api/webhooks/resend`.
- Better Auth uses D1 directly and owns `/api/auth/*` behavior.

## Background work

The configured cron expressions in [`wrangler.jsonc`](../../wrangler.jsonc) map to [`src/index.ts`](../../src/index.ts):

| Schedule | Jobs |
| --- | --- |
| `17 3 * * *` | [`purgeExpiredTrash`](../../src/repositories.ts), [`reconcileAutomaticCloudBackups`](../../src/cloud-backups.ts), and [`reconcileResumableUploads`](../../src/routes/resumable-uploads.ts). |
| `*/15 * * * *` | [`reconcileSupportSlaReminders`](../../src/support-sla-reminders.ts). |

Jobs run concurrently via `Promise.allSettled`; failures are structured-console logged. There is no Queue binding, dead-letter mechanism, or repository-defined alert transport. Workflow steps provide their own Cloudflare durability for cloud backups.

## Testing and release gates

[`package.json`](../../package.json) defines a full `check` gate: CSS build, TypeScript, Vitest, generated Worker type check, and Wrangler dry-run bundle. [`.github/workflows/quality.yml`](../../.github/workflows/quality.yml) additionally applies local D1 migrations and verifies generated assets. [`.github/workflows/production-smoke.yml`](../../.github/workflows/production-smoke.yml) runs [`scripts/smoke.mjs`](../../scripts/smoke.mjs) against production every six hours and on demand.

The remote database migration state, currently deployed Worker version, and latest CI results are **Unknown** from this checkout.
