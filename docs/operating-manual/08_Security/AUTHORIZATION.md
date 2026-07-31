# Authorization
Enforce server-side permissions using least privilege. Never trust client claims.

## Repository enforcement points

- Better Auth establishes user identity; submitted user IDs or roles are never
  accepted as identity claims.
- Event routes resolve membership from D1 and evaluate a named capability.
- Original media delivery and cloud export also evaluate `event_access`.
- Admin middleware denies unknown routes and maps known routes to explicit RBAC
  permissions before their handlers execute.
- Support routes apply ticket assignment and department restrictions in addition
  to general admin RBAC.
- Cloud backup Workflows repeat authorization before reading original media from
  R2 so queued work cannot rely on stale membership or entitlement state.

Every new protected route must have a negative test for an anonymous or
underprivileged actor. Side-effecting system diagnostics require a write
permission even when their results appear on a read-only readiness page.
