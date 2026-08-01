# Authentication and permissions

## Account authentication

[`createAuth`](../../src/auth.ts) configures Better Auth at `https://memboux.com/api/auth` and [`src/routes/public.ts`](../../src/routes/public.ts) forwards `GET` and `POST` requests under `/api/auth/*` to its handler.

Verified behavior:

- Email/password is enabled, requires verified email, and accepts passwords from 10 to 128 characters.
- Verification email is sent on sign-up and sign-in; verification auto-signs in the user.
- Password reset and verified account deletion email flows use Resend.
- Google is configured as a social provider. Facebook is added only when both optional Facebook credentials exist.
- Sessions expire after 30 days, update after one day, and use a five-minute cookie cache.
- Cookies are secure, HTTP-only, `SameSite=Lax`, and shared across `memboux.com` subdomains.
- Trusted origins are exactly `https://memboux.com` and `https://www.memboux.com`.
- Account deletion is blocked while the user owns active events.
- Selected auth POST paths have D1-backed rate limits in [`src/routes/public.ts`](../../src/routes/public.ts).

Auth tables (`user`, `session`, `account`, `verification`) originate in [`migrations/0003_accounts_and_event_members.sql`](../../migrations/0003_accounts_and_event_members.sql). Exact cookie names, OAuth callback subroutes, and other Better Auth-generated endpoints are dependency-owned and not enumerated by this repository.

## Global request protections

[`src/index.ts`](../../src/index.ts) applies production HTTPS redirect, Hono secure headers, and Hono CSRF middleware to all routes. HTML is marked private/no-store. Media responses set their own content/cache headers in the serving routes.

There is no repository-configured WAF, Turnstile, Access policy, CSP customization, or Cloudflare rate-limit rule. Dashboard-level protections are **Unknown**.

## Event membership authorization

Event membership is stored in `event_members` and evaluated by [`src/access.ts`](../../src/access.ts):

| Role | Capabilities |
| --- | --- |
| `owner` | `view`, `manage_media`, `manage_event`, `manage_members` |
| `editor` | `view`, `manage_media` |
| `viewer` | `view` |

Routes still perform authorization individually; there is no single event-route middleware. Owners manage details, privacy, members, setup, commerce, and specialized wedding configuration. Editors can manage media where the route checks `manage_media`. Viewers can view authenticated event workspaces.

Professional access is separate: `professional_profiles` and `event_professional_assignments` authorize the studio. Accepted professionals can upload official media and curate `official_album_items`; implementation is in [`src/studio.ts`](../../src/studio.ts) and [`src/routes/studio.ts`](../../src/routes/studio.ts).

## Gallery and guest authorization

Public sharing access combines event lifecycle state and three independent optional PIN surfaces:

- [`eventAccessAllows`](../../src/event-access.ts) gates guest access, guest upload, and original download according to `event_access`.
- [`hasEventSurfaceAccess`](../../src/gallery-access.ts) independently verifies `website`, `guest_gallery`, and `official_album` access. Each surface has its own stored hash, derived cookie token, and cookie name; the guest-gallery cookie name and token format remain backward compatible.
- [`hasGalleryAccess`](../../src/gallery-access.ts) is the guest-gallery compatibility wrapper used by guest upload and gallery routes.
- [`/gallery/:code/unlock`](../../src/routes/gallery.ts) accepts a validated surface identifier, validates only that surface's PIN, rate-limits attempts per event and surface, restricts the return URL to that surface, and sets only its access cookie.
- Migration [`0064`](../../migrations/0064_event_surface_pins.sql) copies a former shared PIN into all three surfaces so an existing protected event is not exposed during migration.
- Media and wedding routes repeat the applicable surface/session checks before object retrieval; the R2 bucket is not exposed directly. A successfully unlocked protected wedding website may load media embedded in that website, while the standalone guest and official URLs still check their own PINs.

PINs are SHA-256 hashed before persistence; surface-cookie derivation and constant-time verification are in [`src/gallery-access.ts`](../../src/gallery-access.ts). PIN brute-force limits are implemented where the unlock route calls the D1 rate limiter; any additional edge-level protection is **Unknown**.

## Admin authentication and RBAC

Admins use the normal Better Auth login page at `/admin/login`; an authenticated user becomes an admin only when [`currentAdmin`](../../src/admin-rbac.ts) finds an active `admin_members` row with a recognized role. There is no separate superadmin credential system.

Verified roles and permissions from [`src/admin-rbac.ts`](../../src/admin-rbac.ts):

| Role | Level | Permissions summary |
| --- | ---: | --- |
| `owner` | 100 | All permissions, including `team.manage`. |
| `administrator` | 80 | All permissions except `team.manage`. |
| `operations` | 60 | User/event read-write, support read-write, system read. |
| `support` | 50 | User/event read, support read-write. |
| `finance` | 50 | User read, support read-write, billing read-write. |
| `moderator` | 50 | User/event read, support read-write, moderation read-write. |
| `analyst` | 20 | Read-only users, events, support, billing, moderation, and system. |

The explicit permission vocabulary is `team.manage`, user/event read-write-delete, support read-write, billing read-write, moderation read-write, privacy read-write, and system read-write. [`permissionForAdminRequest`](../../src/admin-rbac.ts) maps every known `/admin` prefix to one permission; unknown admin paths are denied. The global middleware in [`src/index.ts`](../../src/index.ts) records successful non-read admin mutations in `admin_audit_log`, except `/admin/team` mutations, which record their own detailed audit actions in [`src/routes/admin.ts`](../../src/routes/admin.ts).

Support conversation access is narrower than general `support.read`: owner/administrator can access all; otherwise an assigned conversation is visible only to its assignee, and an unassigned conversation only to an admin whose role matches `required_role`. See [`src/support-access.ts`](../../src/support-access.ts).

## Invitation and support identities

- Event invitations use hashed tokens and expiry, then require an authenticated account to accept or decline. See [`src/invitations.ts`](../../src/invitations.ts), [`src/routes/invitations.ts`](../../src/routes/invitations.ts), and migrations `0005`, `0021`, and `0023`.
- Support chat can bind to an authenticated user or to a hashed visitor token cookie. Access checks are centralized in [`support-service.ts`](../../src/support-service.ts) and [`support-repository.ts`](../../src/support-repository.ts).
- Inbound staff email replies are checked against the ticket assignment and registered admin email behavior in [`inbound-support-email.ts`](../../src/inbound-support-email.ts). The external guarantee that only intended mail reaches the Worker is **Unknown** because Email Routing configuration is not in the repository.
- Wedding guest-directory records are not account members and grant no dashboard permission. Their personalized invitation URLs are bearer capabilities backed by SHA-256 token hashes; [`src/routes/wedding-planning.ts`](../../src/routes/wedding-planning.ts) additionally requires an unexpired event, published wedding profile and active guest access before rendering them.

## Permission tests

Relevant tests include [`access.test.ts`](../../test/access.test.ts), [`admin-rbac.test.ts`](../../test/admin-rbac.test.ts), [`admin-routes.test.ts`](../../test/admin-routes.test.ts), [`support-access.test.ts`](../../test/support-access.test.ts), [`studio.test.ts`](../../test/studio.test.ts), [`invitations.test.ts`](../../test/invitations.test.ts), [`gallery-routes.test.ts`](../../test/gallery-routes.test.ts), and [`security-middleware.test.ts`](../../test/security-middleware.test.ts).
