# Documentation gaps and ambiguities

## Operating-manual coverage

Many operating-manual files are headings or very short placeholders rather than executable guidance. At audit time, examples included:

- [`03_Architecture/SYSTEM_OVERVIEW.md`](../operating-manual/03_Architecture/SYSTEM_OVERVIEW.md)
- [`03_Architecture/EVENT_LIFECYCLE.md`](../operating-manual/03_Architecture/EVENT_LIFECYCLE.md)
- [`03_Architecture/MEDIA_PIPELINE.md`](../operating-manual/03_Architecture/MEDIA_PIPELINE.md)
- [`03_Architecture/ERROR_HANDLING.md`](../operating-manual/03_Architecture/ERROR_HANDLING.md)
- [`09_DevOps/MONITORING.md`](../operating-manual/09_DevOps/MONITORING.md)
- [`09_DevOps/SCALING.md`](../operating-manual/09_DevOps/SCALING.md)
- runbooks under [`13_Runbooks/`](../operating-manual/13_Runbooks/)
- reference files under [`15_Reference/`](../operating-manual/15_Reference/)

This audit fills descriptive gaps but is not a replacement for operational runbooks or architecture decisions.

## Missing deployment documentation

The repository does not establish:

- environments and their Cloudflare account/resource mapping;
- how secrets are provisioned, rotated, or validated;
- remote D1 migration status and rollback/restore procedure;
- Email Routing rules for inbound support mail;
- DNS records and domain ownership procedure;
- R2 lifecycle/CORS/public-access policy;
- release promotion, Worker version rollback, and database compatibility rules;
- alert destinations, on-call ownership, log retention, or incident severity policy.

The GitHub workflows define checks and a scheduled production smoke, but operator response to failure is not documented. Evidence: [`.github/workflows/quality.yml`](../../.github/workflows/quality.yml), [`.github/workflows/production-smoke.yml`](../../.github/workflows/production-smoke.yml), and [`scripts/smoke.mjs`](../../scripts/smoke.mjs).

## Missing API contracts

- There is no OpenAPI or machine-readable route contract.
- Request/response schemas, status codes, CSRF expectations, content-type limits, and rate limits are implemented in handlers rather than documented per route.
- Better Auth-generated subroutes are dependency-owned and not enumerated.
- Internal HTML form endpoints and JSON APIs share prefixes; intended external/public API stability is not defined.
- Webhook replay window, supported Resend event types, and provider retry expectations need a formal contract around [`resend-webhooks.ts`](../../src/resend-webhooks.ts).

The verified endpoint list is in [API route inventory](API_ROUTE_INVENTORY.md).

## Missing data and retention contracts

- Table/column ownership by domain is not documented outside migrations.
- There is no data classification map for PII, secrets, media, audit records, or support attachments.
- Retention periods implemented by [`purgeExpiredOperationalRecords`](../../src/repositories.ts) need a policy justification and legal approval record.
- Event, wedding-media, cover, menu, support-attachment, and cloud-provider backup deletion guarantees are not documented end to end.
- D1 backup/PITR and R2 recovery procedures are unknown.
- The legacy/current event-column migration plan after `0060` is not documented.

## Missing security documentation

- Threat models for guest uploads, media enumeration, support email ingestion, admin escalation, OAuth token theft, and payment webhooks.
- CSP policy and third-party script/resource inventory.
- WAF/bot/abuse controls beyond application D1 rate limiting.
- Admin bootstrap/recovery procedure, mandatory MFA policy, and break-glass controls. Better Auth configuration in [`auth.ts`](../../src/auth.ts) does not show an MFA requirement.
- Key rotation implications: Drive/Dropbox refresh-token encryption derives from `BETTER_AUTH_SECRET`; a rotation/migration procedure is not described.
- Security/privacy review requirements for Workers AI support prompts and support data.

## Missing lifecycle/product decisions

- Canonical relationship between `events.status`, `events.expires_at`, `event_access.access_state`, and `event_access.expires_at`.
- Ownership-transfer flow (account deletion currently blocks active owners).
- Exact generic-vertical publication criteria and preview guarantees.
- Whether cloud backup is expected to include wedding media, menus, covers, or only gallery media.
- Trial-to-paid unlock orchestration, refund/revocation effects, and entitlement expiry.
- Whether archived events remain guest-accessible.
- Service-level expectations for support AI, human assignment, and attachments.

## Documentation/code inconsistencies

These are current checkout observations, not assumptions:

1. The operating manual's architecture lifecycle and media files are placeholders, while the code contains substantial implemented behavior. This audit links the actual sources.
2. [`src/domain.ts`](../../src/domain.ts) hand-declares a broad `Bindings` type while [`worker-configuration.d.ts`](../../worker-configuration.d.ts) is generated from Wrangler. Optional/secret values are not all represented in committed Wrangler vars, so environment completeness cannot be inferred from either file alone.
3. `events` still has legacy and current locale/type/name fields after migration `0060`; documentation that presents a single clean event model would be incomplete.
4. Commerce code and tests contain fulfillment behavior, but the registered HTTP surface has only draft checkout. Documentation must not describe card payment as live.
5. The Worker exports an inbound `email` handler, but repository configuration does not define which address routes to it.
6. The application describes automatic cloud backups, but configured provider credentials and actual Workflow deployment are unknown.

## Recommended documentation owners

| Area | Suggested source owner |
| --- | --- |
| Route/request contracts | Backend engineering, reviewed by security |
| Schema/data retention | Backend + privacy/legal |
| Cloudflare environments/deploy | Platform/operations |
| Auth/admin bootstrap | Security + platform owner |
| Payment lifecycle | Finance/product + backend |
| Support/email/SLA | Support operations + backend |
| Incident/rollback/restore | Platform/operations |

Owner names and staffing assignments are **Unknown**; the table names responsibility domains only.
