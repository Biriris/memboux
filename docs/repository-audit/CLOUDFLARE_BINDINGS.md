# Cloudflare bindings and runtime configuration

## Configured bindings

The following are declared in [`wrangler.jsonc`](../../wrangler.jsonc).

| Binding/configuration | Cloudflare resource | Verified use |
| --- | --- | --- |
| `ASSETS` | Workers Assets, directory `public/` | Typed as `Fetcher` in [`src/domain.ts`](../../src/domain.ts). No direct application call was found. |
| `DB` | D1 database `memboux-db` | Auth, domain data, lifecycle, rate limits, support, commerce, backups, and audit. Migration directory is `migrations/`. |
| `MEDIA` | R2 bucket `memboux-media` | Originals, derived image variants, event covers, wedding media/menus, and support attachments. |
| `IMAGES` | Cloudflare Images binding | Generates `thumb` and `preview` WebP variants in [`src/media-variants.ts`](../../src/media-variants.ts). |
| `AI` | Workers AI, optional in application typing | Support response generation in [`src/support-ai.ts`](../../src/support-ai.ts); code must handle absence. |
| `DRIVE_BACKUP_WORKFLOW` | Workflow `memboux-google-drive-backups` | Creates `GoogleDriveBackupWorkflow` instances. |
| `DROPBOX_BACKUP_WORKFLOW` | Workflow `memboux-dropbox-backups` | Creates `DropboxBackupWorkflow` instances. |
| `SUPPORT_EMAIL` | Plain variable, `support@memboux.com` | Support sender/address behavior. |

The Worker is configured on custom domains `memboux.com` and `www.memboux.com`, uses compatibility date `2026-07-12`, enables `nodejs_compat`, enables logs/invocation logs, and disables traces.

No KV, Queue, Durable Object, Vectorize, Hyperdrive, Service binding, Analytics Engine, or Browser Rendering binding is declared.

## Code-declared environment values

[`src/auth.ts`](../../src/auth.ts) and [`src/domain.ts`](../../src/domain.ts) declare values not committed to `wrangler.jsonc`; these are expected to be secrets or deployment variables.

| Name | Required by type | Use/evidence |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Yes | Better Auth secret; also hashes audit/rate-limit identities and derives AES-GCM keys for cloud refresh tokens. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes | Better Auth Google login and Google Drive OAuth. |
| `RESEND_API_KEY` | Yes | Transactional email through Resend in [`src/auth.ts`](../../src/auth.ts). |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | No | Facebook login is enabled only when both are non-empty. |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | No | Dropbox OAuth; routes report unavailable configuration when absent. |
| `GOOGLE_MAPS_API_KEY` | No | Places search and resolution in [`src/places.ts`](../../src/places.ts). |
| `BUSINESS_LEGAL_NAME`, `BUSINESS_POSTAL_ADDRESS` | No | Legal/readiness presentation. |
| `PRIVACY_EMAIL` | No | Privacy contact configuration. |
| `RESEND_WEBHOOK_SECRET` | No | Svix-style signature verification in [`src/resend-webhooks.ts`](../../src/resend-webhooks.ts). |

Whether each value is configured in deployed environments is **Unknown**. `/health/email` reports only outbound/webhook presence plus DNS checks; `/health/ready` checks D1 only. See [`src/routes/public.ts`](../../src/routes/public.ts).

## D1 usage

- Binding: `DB`; database ID and name are committed in `wrangler.jsonc`.
- Better Auth receives `env.DB` directly in [`createAuth`](../../src/auth.ts).
- Application SQL uses `prepare`, `bind`, `first`, `all`, `run`, and `batch` throughout route and service modules.
- The schema is migration-driven. CI applies all migrations locally before the release gate.
- D1 also implements persistent request-rate counters in [`src/rate-limit.ts`](../../src/rate-limit.ts).

Remote D1 backup policy, point-in-time recovery settings, region/placement, and applied migration version are **Unknown**.

## R2 usage

- Binding: `MEDIA`; bucket `memboux-media`.
- Ordinary event object keys use `<event-id>/<media-id>.<extension>`.
- Derived variants use `<original-key>.memboux-thumb-v1.webp` and `<original-key>.memboux-preview-v1.webp`.
- Other prefixes include `covers/`, `wedding-media/`, `wedding-menus/`, and `support-attachments/`; exact creation sites are listed in [Media lifecycle](MEDIA_LIFECYCLE.md).
- Multipart upload uses R2 multipart APIs in [`src/routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts).

No bucket lifecycle, CORS, public-development URL, object-lock, replication, or jurisdiction configuration is present in the repository. Those settings are **Unknown**.

## Email and scheduled configuration gaps

The default export contains an `email` handler, but `wrangler.jsonc` contains no Email Routing rule or send-email binding. Routing of `support@memboux.com` to this Worker is therefore external and **Unknown**. Outbound mail uses the Resend REST API, not a Cloudflare send-email binding.

Cron definitions are committed, but their enabled/deployed status and last-run results are **Unknown**.
