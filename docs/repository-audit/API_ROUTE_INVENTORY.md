# API and page route inventory

## Scope and counting

[`src/index.ts`](../../src/index.ts) mounts every route collection at `/`. Static inspection of `new Hono` route registrations found **214 explicit registrations** across 21 files. This inventory includes JSON APIs, HTML pages, form actions, health checks, and media streams because they share one Worker surface.

It excludes dependency-internal Better Auth subroutes: the repository registers `GET|POST /api/auth/*`, and [`better-auth`](../../package.json) decides the concrete subpaths at runtime. It also excludes implicit Workers Assets paths because those are files/configuration, not Hono registrations.

Path braces such as `:locale{el|en|fr|de|es|it}` and `:action{restore|delete}` are Hono parameter constraints as written in source.

## Global access rules

- All routes pass through HTTPS redirect, secure headers, and CSRF middleware in [`src/index.ts`](../../src/index.ts).
- `/admin/*` except login/logout passes through admin identity and permission middleware before route dispatch.
- Account/event/studio/gallery/support handlers perform their own session, membership, lifecycle, PIN, visitor-token, or assignment checks; access is summarized per module below, but the route source remains canonical.
- `GET /admin` is registered in both `src/index.ts` and `src/routes/admin.ts`. The earlier `src/index.ts` handler redirects using the middleware-populated role, so the later route is effectively shadowed for matching requests under normal Hono first-match behavior.

## Public, auth, and legal — `src/routes/public.ts` (29)

Source: [`src/routes/public.ts`](../../src/routes/public.ts). Health, marketing, auth UI, and legal pages are public. Privacy submission and selected auth actions are D1-rate-limited. Authenticated users are redirected away from login/register pages.

```text
GET   /health/live
GET   /health/ready
GET   /health/email
GET   /robots.txt
GET   /sitemap.xml
GET|POST /api/auth/*
GET   /
GET   /el
GET   /en
GET   /fr
GET   /de
GET   /es
GET   /it
GET   /:locale{el|en|fr|de|es|it}/wedding
GET   /:locale{el|en|fr|de|es|it}/wedding/preview
GET   /:locale{el|en|fr|de|es|it}/wedding/demo-frame
GET   /:locale{el|en|fr|de|es|it}/events/:type
GET   /:locale{el|en|fr|de|es|it}/events/:type/preview
GET   /:locale{el|en|fr|de|es|it}/events/:type/demo-frame
GET   /:locale{el|en|fr|de|es|it}/privacy-policy
GET   /:locale{el|en|fr|de|es|it}/cookie-policy
GET   /:locale{el|en|fr|de|es|it}/terms
GET   /:locale{el|en|fr|de|es|it}/privacy-request
POST  /api/privacy/requests
GET   /:locale{el|en|fr|de|es|it}/login
GET   /:locale{el|en|fr|de|es|it}/register
GET   /:locale{el|en|fr|de|es|it}/verify-email
GET   /:locale{el|en|fr|de|es|it}/forgot-password
GET   /:locale{el|en|fr|de|es|it}/reset-password
```

## Account — `src/routes/account.ts` (25)

Source: [`src/routes/account.ts`](../../src/routes/account.ts). All handlers resolve the Better Auth user; APIs reject unauthenticated calls and pages redirect to locale login. Event creation also enforces quota and validates type/date input.

```text
GET   /api/account/locations/search
GET   /api/account/locations/resolve
GET   /api/account/notifications/count
GET   /api/account/notifications/preview
GET   /api/account/events/search
GET   /:locale{el|en|fr|de|es|it}/notifications
POST  /api/account/notifications/:id/read
POST  /api/account/notifications/:id/status
POST  /api/account/notifications/read
GET   /:locale{el|en|fr|de|es|it}/settings
POST  /api/account/settings/language
GET   /:locale{el|en|fr|de|es|it}/profile-legacy
GET   /:locale{el|en|fr|de|es|it}/profile
POST  /api/account/profile/professional
GET   /:locale{el|en|fr|de|es|it}/security
POST  /api/account/security/revoke-other-sessions
GET   /api/account/export
GET   /api/account/deletion-eligibility
GET   /:locale{el|en|fr|de|es|it}/privacy
GET   /:locale{el|en|fr|de|es|it}/plan
GET   /:locale{el|en|fr|de|es|it}/account
GET   /:locale{el|en|fr|de|es|it}/account-legacy
POST  /api/account/events
POST  /api/account/events/:code/trash
POST  /api/account/events/:code/restore
```

## Account trash — `src/routes/account-trash.ts` (4)

Source: [`src/routes/account-trash.ts`](../../src/routes/account-trash.ts). Requires an authenticated user and checks ownership/authorized event relationship for selected media/events.

```text
GET   /account/trash/media/:id
POST  /api/account/trash/media/:action{restore|delete}
POST  /api/account/trash/events/:action{restore|delete}
GET   /:locale{el|en|fr|de|es|it}/trash
```

## Admin shell/team/readiness — `src/routes/admin.ts` (20)

Source: [`src/routes/admin.ts`](../../src/routes/admin.ts). Login/logout use normal Better Auth. Other paths require the permission mapped in [`admin-rbac.ts`](../../src/admin-rbac.ts); team management is owner-only through `team.manage`.

```text
GET   /admin/login
POST  /admin/login
POST  /admin/logout
GET   /admin/language/:locale{el|en}
GET   /admin/profile
POST  /admin/profile
POST  /admin/profile/test-notification
GET   /admin/team
POST  /admin/team
POST  /admin/team/:id
POST  /admin/team/:id/test-notification
POST  /admin/readiness/test-email
POST  /admin/readiness/test-alias
GET   /admin/readiness
GET   /admin/professionals
POST  /admin/professionals/:userId
GET   /admin/accounts
POST  /admin/accounts/:id/entitlement
GET   /admin
GET   /admin/events
```

## Admin events — `src/routes/admin-events.ts` (5)

Source: [`src/routes/admin-events.ts`](../../src/routes/admin-events.ts). Requires event read/write/delete permissions according to method and suffix.

```text
GET   /admin/events/:code
POST  /admin/events/:code/upload
POST  /admin/events/:code/media/bulk-trash
POST  /admin/events/:code/update
POST  /admin/events/:code/delete
```

## Admin media/privacy — `src/routes/admin-media.ts` (8)

Source: [`src/routes/admin-media.ts`](../../src/routes/admin-media.ts). Media/reported/trash paths map to event or moderation permissions; privacy-request paths map to privacy permissions.

```text
GET   /admin/media/:id
GET   /admin/reported
GET   /admin/privacy-requests
POST  /admin/privacy-requests/:id/:action{resolve|dismiss}
POST  /admin/reported/:action{restore|trash}
GET   /admin/trash
POST  /admin/trash/:action{restore|delete}
POST  /admin/events/:code/media/:id/restore
```

## Admin users/billing — `src/routes/admin-users.ts` (9)

Source: [`src/routes/admin-users.ts`](../../src/routes/admin-users.ts). User details/actions map to user permissions; entitlement/subscription/payment suffixes map to billing permissions; deletion maps to `users.delete`.

```text
GET   /admin/users
GET   /admin/users/:id
POST  /admin/users/:id/delete
POST  /admin/users/:id/quick-plan
POST  /admin/users/:id/quick-subscription
POST  /admin/users/:id/events/:eventId/role
POST  /admin/users/:id/entitlement
POST  /admin/users/:id/subscription
POST  /admin/users/:id/payments
```

## Event workspace — `src/routes/events.ts` (19)

Source: [`src/routes/events.ts`](../../src/routes/events.ts). Dashboard pages require membership. Mutations check owner/event capability; cover delivery also checks authorized access. Trial start is owner-managed. `/manage` is a compatibility alias for the overview, not a navigation step. The privacy mutation accepts only `website`, `guest_gallery`, or `official_album`, hashes the submitted PIN, and updates that surface independently.

```text
GET   /dashboard/:code
GET   /dashboard/:code/website
GET   /dashboard/:code/guests
GET   /dashboard/:code/media
GET   /dashboard/:code/menu
GET   /dashboard/:code/share
GET   /dashboard/:code/team
GET   /dashboard/:code/manage
POST  /api/account/events/:code/access/start-trial
GET   /dashboard/:code/trial
GET   /dashboard/:code/edit
GET   /event-cover/:code
POST  /api/account/events/:code/cover
POST  /api/account/events/:code/privacy
POST  /api/account/events/:code/removal/:requestId/:action{approve|dismiss}
POST  /api/account/events/:code/details
POST  /api/account/events/:code/invite
POST  /api/account/events/:code/members/remove
POST  /api/account/events/:code/members/role
```

## Generic event setup — `src/routes/event-setup.ts` (4)

Source: [`src/routes/event-setup.ts`](../../src/routes/event-setup.ts). Setup routes require authenticated event-management permission. `/event/:code` is the persisted generic public event page and applies publication/lifecycle/gallery checks in the handler.

```text
GET   /dashboard/:code/setup
POST  /api/account/events/:code/setup/:step
POST  /api/account/events/:code/setup/:step/autosave
GET   /event/:code
```

## Event media management — `src/routes/event-media.ts` (6)

Source: [`src/routes/event-media.ts`](../../src/routes/event-media.ts). Requires authenticated membership with media-management capability, except page behavior that redirects to login.

```text
GET   /dashboard/:code/media/:id
POST  /api/account/events/:code/media/:id/rename
POST  /api/account/events/:code/media/:id/trash
POST  /api/account/events/:code/media/bulk-trash
POST  /api/account/events/:code/media/:id/restore
GET   /dashboard-legacy/:code
```

## Event professional assignment — `src/routes/event-professional.ts` (3)

Source: [`src/routes/event-professional.ts`](../../src/routes/event-professional.ts). Dashboard requires event access; assign/revoke requires owner/member-management authority.

```text
GET   /dashboard/:code/professional
POST  /api/account/events/:code/professional/assign
POST  /api/account/events/:code/professional/revoke
```

## Gallery and direct upload — `src/routes/gallery.ts` (9)

Source: [`src/routes/gallery.ts`](../../src/routes/gallery.ts). Guest-gallery, official-album, and media reads combine event lifecycle, their surface-specific PIN cookie, and authorized-member preview rules. The wedding guest gallery remains a distinct URL from the wedding website. Upload combines guest-upload lifecycle access or member access, consent, policy, quota, and trial capacity.

```text
POST  /gallery/:code/unlock
GET   /gallery/:code/cover
GET   /gallery/:code
POST  /api/gallery/:code/media/:mediaId/like
GET   /gallery/:code/official
GET   /gallery/:code/removal/:mediaId
POST  /gallery/:code/removal/:mediaId
POST  /api/upload/:code
GET   /media/:id
```

## Resumable upload — `src/routes/resumable-uploads.ts` (7)

Source: [`src/routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts). Initial authorization mirrors direct-upload access; continuation calls require the stored upload token and valid session state.

```text
POST   /api/upload/:code/multipart
GET    /api/upload/:code/multipart/:sessionId
PUT    /api/upload/:code/multipart/:sessionId/parts/:partNumber
PUT    /api/upload/:code/multipart/:sessionId/variants/:variant
POST   /api/upload/:code/multipart/:sessionId/complete
POST   /api/upload/:code/multipart/finalize
DELETE /api/upload/:code/multipart/:sessionId
```

## Guest engagement — `src/routes/experience.ts` (11)

Source: [`src/routes/experience.ts`](../../src/routes/experience.ts). Guest actions require the corresponding experience setting and gallery/lifecycle access. Wedding and baptism RSVP submissions require a hashed personalized guest token; the handler binds the response to the matching guest-directory record and enforces publication and active guest access. Generic public RSVP remains available only to other event types. Dashboard/moderation actions require event management.

```text
POST  /api/gallery/:code/rsvp
POST  /api/gallery/:code/guestbook
GET   /api/gallery/:code/media/:mediaId/comments
POST  /api/gallery/:code/media/:mediaId/comments
GET   /api/gallery/:code/slideshow-feed
GET   /gallery/:code/slideshow
GET   /dashboard/:code/engagement
POST  /api/account/events/:code/experience-settings
POST  /api/account/events/:code/guestbook/:id/status
POST  /api/account/events/:code/comments/:id/hide
GET   /dashboard/:code/qr-templates
```

## Invitations — `src/routes/invitations.ts` (2)

Source: [`src/routes/invitations.ts`](../../src/routes/invitations.ts). Token view is public but token-bound; accept/decline requires the authenticated invitee.

```text
GET   /invite/:token
POST  /api/account/invitations/:id/:action{accept|decline}
```

## Studio/professionals — `src/routes/studio.ts` (10)

Source: [`src/routes/studio.ts`](../../src/routes/studio.ts). Requires authenticated active professional profile and, where event-specific, an accepted/relevant assignment. Media trash is limited to eligible professional uploads.

```text
GET   /studio
POST  /studio/assignments/:eventId/accept
GET   /studio/media/:id
GET   /studio/events/:code
POST  /studio/events/:code/official/:action{add|remove}
POST  /studio/events/:code/media/trash
GET   /studio/trash/media/:id
GET   /studio/trash
POST  /studio/trash/restore
POST  /studio/events/:code/upload
```

## Wedding — `src/routes/wedding.ts` (20)

Source: [`src/routes/wedding.ts`](../../src/routes/wedding.ts). Public wedding/media/menu/calendar reads apply publication, lifecycle, the wedding-website PIN, or authorized preview checks. Dashboard and wedding mutations require authenticated event-management permission.

```text
GET    /wedding-media/:id
GET    /wedding/:code
GET    /wedding/:code/calendar/:file
GET    /wedding/:code/menu
GET    /dashboard/:code/wedding/setup
GET    /dashboard/:code/wedding/menu/print
POST   /api/account/events/:code/wedding/media/upload
POST   /api/account/events/:code/wedding/media/:mediaId/delete
POST   /api/account/events/:code/wedding/menu
POST   /api/account/events/:code/wedding/menu/delete
POST   /api/account/events/:code/wedding/menu-courses
POST   /api/account/events/:code/wedding/menu-courses/:id
POST   /api/account/events/:code/wedding/menu-courses/:id/delete
GET    /api/account/events/:code/wedding/portraits
POST   /api/account/events/:code/wedding/portraits/:slot/delete
POST   /api/account/events/:code/wedding/portraits
DELETE /api/account/events/:code/wedding/portraits/:slot
POST   /api/account/events/:code/wedding/setup/:step
POST   /api/account/events/:code/wedding/publish
POST   /api/account/events/:code/wedding/unpublish
```

## Wedding guest planning — `src/routes/wedding-planning.ts` (18)

Source: [`src/routes/wedding-planning.ts`](../../src/routes/wedding-planning.ts). The dashboard and all planning mutations require authenticated `manage_event` permission. The personalized invitation page is public but token-bound; it is available only for a published, unexpired wedding with active guest access. Invitation tokens are stored only as SHA-256 hashes.

```text
GET   /dashboard/:code/wedding/guests
GET   /dashboard/:code/wedding/guests/:guestId/edit
GET   /dashboard/:code/wedding/guests/seating-plan
GET   /api/account/events/:code/wedding/guests/export
POST  /api/account/events/:code/wedding/guest-groups
POST  /api/account/events/:code/wedding/guest-groups/:groupId
POST  /api/account/events/:code/wedding/guest-groups/:groupId/delete
POST  /api/account/events/:code/wedding/guests
POST  /api/account/events/:code/wedding/guests/import
POST  /api/account/events/:code/wedding/guests/:guestId
POST  /api/account/events/:code/wedding/guests/invitations/send
POST  /api/account/events/:code/wedding/guests/:guestId/invite-link
POST  /api/account/events/:code/wedding/guests/:guestId/delete
POST  /api/account/events/:code/wedding/tables
POST  /api/account/events/:code/wedding/tables/:tableId
POST  /api/account/events/:code/wedding/tables/:tableId/delete
POST  /api/account/events/:code/wedding/seating
GET   /event/:code/invite/:token
```

## Cloud backups — `src/routes/backups.ts` (10)

Source: [`src/routes/backups.ts`](../../src/routes/backups.ts). All routes require an authenticated account. Event backup creation/status also verifies event backup access; OAuth callback state is hashed, expiring, provider-bound state in D1.

```text
GET   /:locale{el|en|fr|de|es|it}/backups
GET   /api/cloud/google/connect
GET   /api/cloud/google/callback
POST  /api/cloud/google/disconnect
GET   /api/cloud/dropbox/connect
GET   /api/cloud/dropbox/callback
POST  /api/cloud/dropbox/disconnect
POST  /api/account/events/:code/backups/google
POST  /api/account/events/:code/backups/dropbox
GET   /api/backups/:id
```

## Commerce — `src/routes/commerce.ts` (2)

Source: [`src/routes/commerce.ts`](../../src/routes/commerce.ts). Requires authenticated event owner/manager as enforced by the handler. The API creates a draft only; no card-provider checkout route is registered.

```text
GET   /dashboard/:code/checkout
POST  /api/account/events/:code/checkout/draft
```

## Support/helpdesk — `src/routes/support.ts` (14)

Source: [`src/routes/support.ts`](../../src/routes/support.ts). Customer routes use authenticated user identity or hashed visitor token. Attachment reads re-check conversation ownership. Admin routes additionally pass global RBAC and conversation assignment/role access.

```text
GET   /api/support/conversation
POST  /api/support/conversation
POST  /api/support/messages
GET   /admin/support
GET   /api/support/attachments/:id
GET   /admin/support/:id/attachments/:attachmentId
GET   /admin/support/:id
GET   /admin/support/:id/activity
POST  /admin/support/:id/claim
POST  /admin/support/:id/reassign
POST  /admin/support/:id/retry-staff-notification
POST  /admin/support/:id/reply
POST  /admin/support/:id/messages/:messageId/retry-email
POST  /admin/support/:id/status
```

## Webhooks — `src/routes/webhooks.ts` (1)

Source: [`src/routes/webhooks.ts`](../../src/routes/webhooks.ts). This route is not user-authenticated; [`src/resend-webhooks.ts`](../../src/resend-webhooks.ts) verifies the configured webhook signature and stores provider event IDs for idempotency.

```text
POST  /api/webhooks/resend
```

## Non-HTTP runtime handlers

These are Worker entry points rather than routes:

| Handler | Source | Input |
| --- | --- | --- |
| `email` | [`src/index.ts`](../../src/index.ts), [`src/inbound-support-email.ts`](../../src/inbound-support-email.ts) | `ForwardableEmailMessage` from externally configured Email Routing. |
| `scheduled` | [`src/index.ts`](../../src/index.ts) | Cron `17 3 * * *` or `*/15 * * * *`. |
| Workflow `run` | [`src/google-drive.ts`](../../src/google-drive.ts), [`src/dropbox.ts`](../../src/dropbox.ts) | `{ backupId }` Workflow event. |

## Route inventory verification

Relevant route-level tests include [`routes.test.ts`](../../test/routes.test.ts), [`account-routes.test.ts`](../../test/account-routes.test.ts), [`admin-routes.test.ts`](../../test/admin-routes.test.ts), [`event-routes.test.ts`](../../test/event-routes.test.ts), [`gallery-routes.test.ts`](../../test/gallery-routes.test.ts), [`support.test.ts`](../../test/support.test.ts), [`studio.test.ts`](../../test/studio.test.ts), and [`security-middleware.test.ts`](../../test/security-middleware.test.ts). There is no automated repository script that compares this Markdown inventory to Hono registrations; future route changes can make this snapshot stale.
