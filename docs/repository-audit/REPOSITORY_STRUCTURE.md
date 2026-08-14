# Repository structure

## Top-level layout

| Path | Verified responsibility |
| --- | --- |
| [`.github/`](../../.github/) | GitHub Actions quality and production-smoke workflows plus Dependabot configuration. |
| [`docs/`](../) | Operating manual and this source-verified audit. |
| [`migrations/`](../../migrations/) | Ordered D1/SQLite schema migrations, currently numbered `0001` through `0063`. |
| [`public/`](../../public/) | Worker static assets: generated CSS and font CSS. Served through the `ASSETS` binding. |
| [`scripts/`](../../scripts/) | Production smoke test and a production-media deduplication utility. |
| [`src/`](../../src/) | Worker entry point, domain/application modules, Hono routes, server-rendered views, and CSS source. |
| [`test/`](../../test/) | Vitest tests running in the Cloudflare Workers pool. |
| [`AGENTS.md`](../../AGENTS.md) | Repository operating rules and source-of-truth precedence. |
| [`AI_INDEX.md`](../../AI_INDEX.md) | Navigation index for AI contributors. |
| [`package.json`](../../package.json) | Node dependencies and build, test, deployment, D1, and smoke scripts. |
| [`wrangler.jsonc`](../../wrangler.jsonc) | Worker, domain, asset, D1, R2, Images, AI, Workflow, cron, and observability configuration. |
| [`worker-configuration.d.ts`](../../worker-configuration.d.ts) | Generated Cloudflare runtime type declarations. |

At the 2026-08-01 update, `rg --files` reported 470 non-hidden files: 111 under `src`, 78 under `test`, 62 migrations, 202 under `docs`, four under `public`, and two under `scripts`. Hidden `.github` files are additional.

## `src` organization

The project is a flat, domain-oriented TypeScript codebase rather than a package monorepo.

- [`src/index.ts`](../../src/index.ts) is the Worker composition root and the `fetch`, `email`, and `scheduled` entry point.
- [`src/routes/`](../../src/routes/) contains 22 files; 21 register Hono endpoints and [`admin-auth.ts`](../../src/routes/admin-auth.ts) provides shared admin-route helpers. Every route collection is mounted at `/` by `src/index.ts`.
- [`src/views/`](../../src/views/) contains 24 server-rendered HTML modules.
- Cross-cutting modules include authentication, RBAC, quotas, rate limiting, privacy, support, commerce, cloud backup, event access, and media processing.

The most important domain groupings are:

| Area | Primary source files |
| --- | --- |
| Authentication/session | [`auth.ts`](../../src/auth.ts), [`session.ts`](../../src/session.ts) |
| Admin authorization | [`admin-rbac.ts`](../../src/admin-rbac.ts), [`routes/admin-auth.ts`](../../src/routes/admin-auth.ts) |
| Events and membership | [`access.ts`](../../src/access.ts), [`event-access.ts`](../../src/event-access.ts), [`event-people.ts`](../../src/event-people.ts), [`routes/events.ts`](../../src/routes/events.ts) |
| Event verticals/wizards | [`event-types.ts`](../../src/event-types.ts), [`event-verticals.ts`](../../src/event-verticals.ts), [`event-wizard-schema.ts`](../../src/event-wizard-schema.ts), [`routes/event-setup.ts`](../../src/routes/event-setup.ts) |
| Gallery/media | [`media-fingerprint.ts`](../../src/media-fingerprint.ts), [`media-variants.ts`](../../src/media-variants.ts), [`media-trash.ts`](../../src/media-trash.ts), [`routes/gallery.ts`](../../src/routes/gallery.ts), [`routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts) |
| Wedding specialization | [`routes/wedding.ts`](../../src/routes/wedding.ts), [`routes/wedding-planning.ts`](../../src/routes/wedding-planning.ts), [`wedding-portraits.ts`](../../src/wedding-portraits.ts), [`wedding-menu.ts`](../../src/wedding-menu.ts), [`wedding-themes.ts`](../../src/wedding-themes.ts) |
| Support/helpdesk | [`support-repository.ts`](../../src/support-repository.ts), [`support-service.ts`](../../src/support-service.ts), [`support-ai.ts`](../../src/support-ai.ts), [`support-routing.ts`](../../src/support-routing.ts), [`inbound-support-email.ts`](../../src/inbound-support-email.ts), [`routes/support.ts`](../../src/routes/support.ts) |
| Commerce/event packages | [`commerce.ts`](../../src/commerce.ts), [`event-access.ts`](../../src/event-access.ts), [`routes/commerce.ts`](../../src/routes/commerce.ts) |
| Cloud backups | [`cloud-backups.ts`](../../src/cloud-backups.ts), [`cloud-backup-access.ts`](../../src/cloud-backup-access.ts), [`google-drive.ts`](../../src/google-drive.ts), [`dropbox.ts`](../../src/dropbox.ts), [`routes/backups.ts`](../../src/routes/backups.ts) |
| Persistence helpers | [`repositories.ts`](../../src/repositories.ts), [`quotas.ts`](../../src/quotas.ts), plus SQL embedded in route and service modules |

## Entry points and generated outputs

- Worker module: `src/index.ts`, configured by [`wrangler.jsonc`](../../wrangler.jsonc).
- CSS source: [`src/styles.css`](../../src/styles.css); `npm run build:css` writes [`public/app-midnight.css`](../../public/app-midnight.css).
- Tests: `test/**/*.test.ts`, configured by [`vitest.config.ts`](../../vitest.config.ts).
- Local/remote migrations: `npm run db:local` and `npm run db:remote` from [`package.json`](../../package.json).
- Production smoke entry: [`scripts/smoke.mjs`](../../scripts/smoke.mjs).

No workspace/package boundaries, separate frontend application, or separate API service are present.
