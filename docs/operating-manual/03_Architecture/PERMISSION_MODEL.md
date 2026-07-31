# Permission Model

## Event permissions

**Repository Fact:** Event access is granted by `event_members` and evaluated
server-side through `src/access.ts`.

| Role | View | Manage media | Manage event | Manage members |
|---|---:|---:|---:|---:|
| owner | yes | yes | yes | yes |
| editor | yes | yes | no | no |
| viewer | yes | no | no | no |

Professional access is separate from event membership. It requires an active
professional profile and an accepted `event_professional_assignments` record.

Event membership alone does not grant every form of media export. Guest access,
guest uploads and original export are additionally controlled by the event's
`event_access` record.

## Cloud backup authorization

**Repository Fact:** Google Drive and Dropbox backups copy original media out of
Memboux and therefore use the same entitlement boundary as an original-file
download. `src/cloud-backup-access.ts` requires all of the following:

1. An active connection owned by the requesting user for the selected provider.
2. Current membership of a non-deleted event.
3. Event access that allows original export.

The policy is enforced both when a backup is prepared and again when its
Cloudflare Workflow starts. Automatic reconciliation and invitation-triggered
backups call the same policy. Preview, trial and expired events cannot export
originals unless their enforced access record explicitly permits it; unlocked
and legacy observe-mode events retain their existing behavior.

## Admin permissions

**Repository Fact:** Admin identity requires an authenticated Better Auth user
and an active `admin_members` row. `src/admin-rbac.ts` maps every `/admin/*`
request to a permission before route execution.

| Role | Primary boundary |
|---|---|
| owner | All permissions, including team management and system mutations |
| administrator | Broad operational and system access, excluding team management |
| operations | Users, events, support and read-only system readiness |
| support | Support work plus required user/event context |
| finance | Billing and billing-related support |
| moderator | Moderation and trust-and-safety support |
| analyst | Read-only operational access |

`system.write` is restricted to owner and administrator. Readiness checks are
visible through `system.read`, while outbound readiness tests require
`system.write`.

Support conversations add assignment and department checks after the general
`support.read` or `support.write` permission check.
