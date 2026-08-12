# Memboux repository audit

This directory records a source-verified audit of the Memboux checkout as inspected on 2026-07-31. It describes the code and files present in the working tree; it does not prove which migration, secret, DNS rule, email route, or Worker version is deployed in production.

The audit follows the precedence in [`AGENTS.md`](../../AGENTS.md): production source, migrations, configuration, and tests are evidence; the operating manual supplies intent and is not treated as implementation proof. Pre-existing working-tree changes were inspected but were not modified or included with this documentation commit. Where runtime or deployment state cannot be established from the repository, the text says **Unknown**.

## Audit documents

- [Repository structure](REPOSITORY_STRUCTURE.md)
- [Architecture overview](ARCHITECTURE_OVERVIEW.md)
- [API and page route inventory](API_ROUTE_INVENTORY.md)
- [Database schema and migration chain](DATABASE_SCHEMA.md)
- [Cloudflare bindings](CLOUDFLARE_BINDINGS.md)
- [Authentication and permissions](AUTHENTICATION_AND_PERMISSIONS.md)
- [Event lifecycle](EVENT_LIFECYCLE.md)
- [Media lifecycle](MEDIA_LIFECYCLE.md)
- [Technical debt](TECHNICAL_DEBT.md)
- [Documentation gaps](DOCUMENTATION_GAPS.md)

## Evidence inspected

- Runtime/configuration: [`src/index.ts`](../../src/index.ts), [`src/domain.ts`](../../src/domain.ts), [`wrangler.jsonc`](../../wrangler.jsonc), [`package.json`](../../package.json), [`tsconfig.json`](../../tsconfig.json), and [`vitest.config.ts`](../../vitest.config.ts).
- Application: every TypeScript module under `src/`, including all route and view modules.
- Persistence: the complete ordered chain [`migrations/0001_initial.sql`](../../migrations/0001_initial.sql) through [`migrations/0070_event_qr_designs.sql`](../../migrations/0070_event_qr_designs.sql).
- Verification: all tests under [`test/`](../../test/) and CI definitions under [`.github/workflows/`](../../.github/workflows/).
- Intended architecture and policy: [`AI_INDEX.md`](../../AI_INDEX.md) and the relevant sections of [`docs/operating-manual/`](../operating-manual/).

## Known scope limits

- Cloudflare dashboard settings, deployed secrets, Email Routing rules, DNS, R2 lifecycle rules, and the migration level of the remote D1 database are not stored in this checkout. Their current state is **Unknown**.
- Production traffic behavior was not used as evidence for this static repository audit.
- Better Auth owns behavior below `/api/auth/*`; this repository registers the catch-all but does not enumerate the dependency's generated subroutes.
- File counts and large-module sizes are audit-time observations and will naturally change as the repository evolves.
