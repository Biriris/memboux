# Event lifecycle

## Creation

Authenticated users create events through `POST /api/account/events` in [`src/routes/account.ts`](../../src/routes/account.ts). The route validates name, locale, event type, dates, and location input; reserves the owner's event quota; creates an event code/token hash; and batch-inserts `events`, the owner's `event_members` row, and an `event_access` row. It then redirects to the wedding or generic setup route. It does **not** create the specialized profile in the creation batch; setup handlers create/update profile state. On failure it releases the reserved event quota.

The public catalogue at `GET /:locale/templates` is rendered by [`src/views/template-catalogue.ts`](../../src/views/template-catalogue.ts). Its “use template” links preserve an allowlisted template key through registration and the account create-event form. After event creation, the key is forwarded to the appropriate setup route. [`src/routes/event-setup.ts`](../../src/routes/event-setup.ts) and [`src/routes/wedding.ts`](../../src/routes/wedding.ts) use it only as the default in `INSERT OR IGNORE` when the specialized profile is first created; an existing profile is not changed by revisiting a URL. Demo content and demo media are not copied into user events.

New-event access defaults are enforced by the current code/migrations:

- `access_state = preview`
- `enforcement_state = enforced`
- media limit 50
- guest access/uploads and original downloads disabled until the trial starts

Legacy events inserted into `event_access` by [`0041_event_access_lifecycle.sql`](../../migrations/0041_event_access_lifecycle.sql) are preserved as `unlocked` in `observe` mode.

Supported event types are defined in [`src/event-types.ts`](../../src/event-types.ts). The generic vertical metadata and wizard definitions are in [`src/event-verticals.ts`](../../src/event-verticals.ts) and [`src/event-wizard-schema.ts`](../../src/event-wizard-schema.ts); wedding has a separate six-step path in [`src/routes/wedding.ts`](../../src/routes/wedding.ts).

## Setup and preview

- Generic event setup uses `/dashboard/:code/setup` and `POST /api/account/events/:code/setup/:step` (plus autosave) in [`src/routes/event-setup.ts`](../../src/routes/event-setup.ts), persisting `event_vertical_profiles`.
- Wedding setup uses `/dashboard/:code/wedding/setup` and its wedding API routes, persisting wedding profile/features/media/menu/portraits. Completing step 6 records `wizard_completed_at` but leaves `publish_status = draft`.
- Owners can preview unpublished specialized pages because the page routes check event-management permission. Guests cannot see unpublished wedding pages.
- Wedding publication is explicit: `POST /api/account/events/:code/wedding/publish` requires completed/readiness-valid setup plus active guest access from trial or unlock. `POST /api/account/events/:code/wedding/unpublish` returns the site to draft without deleting its data.
- Wedding step 5 snapshots the current base and feature prices in `event_wedding_price_snapshots`; revisiting the feature step uses the active event snapshot rather than silently adopting current catalog prices.
- Public landing-page previews under `/:locale/events/:type/preview` and wedding preview routes are product demos, not previews of a user's persisted event.

The exact product rule for when a generic vertical page should be considered “published” is encoded in `event_vertical_profiles.publish_status`; no separate publication audit/history table exists.

## Trial transition

An owner now selects an event package and starts the Memboux Free access period in the same event-overview flow with `POST /api/account/events/:code/checkout/start-trial` in [`src/routes/commerce.ts`](../../src/routes/commerce.ts). The route and persisted `trial` state remain compatibility identifiers. [`startEventTrial`](../../src/event-access.ts) transitions only `preview` rows to `trial`, sets a 37-day end timestamp, enables guest access and guest uploads, keeps original downloads disabled, and applies a lifetime media limit of 50. Migration [`0068_free_plan_and_event_packages.sql`](../../migrations/0068_free_plan_and_event_packages.sql) raises existing enforced preview/trial capacity and establishes the inactive-checkout `Moments` and `Celebration` catalog entries.

The `media_uploads_consumed` counter introduced by [`0058_lifetime_trial_media_slots.sql`](../../migrations/0058_lifetime_trial_media_slots.sql) means deleting a file does not return a trial slot. D1 triggers enforce limits for ordinary media, wedding media, restores after expiry, and active multipart reservations. [`event-access.test.ts`](../../test/event-access.test.ts) and [`trial-media-slots.test.ts`](../../test/trial-media-slots.test.ts) cover this behavior.

## Active event behavior

`event_access` is independent from `events.status`:

- `events.status` is `active` or `archived` and is editable in admin routes.
- `event_access.access_state` controls preview/trial/unlocked/expired product access.
- `events.deleted_at`/`purge_at` control trash retention.
- `events.expires_at` is legacy/general event access metadata and is still read by media delivery; its precise relationship to paid `event_access.expires_at` is not centralized and is therefore **ambiguous**.

During `trial`, guests can access/upload, owners can manage the event, and original exports remain disabled. `unlocked` or `observe` mode allows all lifecycle capabilities. See [`eventAccessAllows`](../../src/event-access.ts).

An owner can change the event type through `POST /api/account/events/:code/event-type`. [`changeEventType`](../../src/event-type-transitions.ts) records the transition, snapshots an active generic vertical profile, keeps Wedding-specific rows dormant instead of deleting them, and restores the latest saved generic profile when returning to that type. Shared event media, membership, access and commerce rows remain event-scoped and are not replaced. Migration [`0067_event_type_transitions.sql`](../../migrations/0067_event_type_transitions.sql) adds the audit/restore history.

For weddings, lifecycle access and publication are separate gates: trial/unlock makes guest capabilities eligible, while `event_wedding_profiles.publish_status` controls whether the wedding site and personalized invitations are publicly available.

## Wedding guest planning and RSVP

Owners manage households, contacts, personalized invitation links and tables at `/dashboard/:code/wedding/guests` in [`src/routes/wedding-planning.ts`](../../src/routes/wedding-planning.ts). The directory supports literal search and 50-row pages. Authenticated event managers can export the complete directory as CSV or atomically import up to 200 rows/1 MB through the same route module; required columns and cell validation are implemented in [`src/wedding-guests-csv.ts`](../../src/wedding-guests-csv.ts). Inserts are grouped to stay within D1's per-query bound-parameter limit and reduce invocation query count. An invalid row or an email already present in the event rejects the entire import. Exported cells that could be interpreted as spreadsheet formulas are escaped.

Raw invitation tokens are returned only when generated; D1 stores their SHA-256 hashes. Authenticated event managers can queue one personalized email for every unsent or failed guest record with an email address. Migration [`0062`](../../migrations/0062_wedding_guest_invitation_delivery.sql) records `not_sent`, `sending`, `sent`, and `failed` states; a ten-minute stale-send threshold permits retry after interrupted background work. Delivery uses the existing Resend path in [`src/auth.ts`](../../src/auth.ts), with at most five concurrent sends. A token-bound RSVP in [`src/routes/experience.ts`](../../src/routes/experience.ts) updates both `event_rsvps` and the matching `event_wedding_guests` record. The guest-upload/gallery UI never renders an RSVP form for any event type; wedding and baptism responses remain invitation-bound, and an owner can record them manually in the guest directory. The registered generic RSVP endpoint still accepts non-wedding/non-baptism submissions if invoked directly; whether that legacy API should also be retired is not defined by current product documentation. Seating capacity counts the guest record's current party size; a decline or an RSVP increase that would overfill a table saves the response and removes that seating assignment for replanning.

The public guest experience is ordered consistently across event types: private event upload, guest gallery, guestbook, non-empty official album, and QR/share last. The integrated wedding experience follows the same order, with optional live slideshow before the final share section. Empty official collections are omitted rather than rendered as placeholders. The verified implementations are [`src/routes/gallery.ts`](../../src/routes/gallery.ts) and [`src/views/wedding-experience.ts`](../../src/views/wedding-experience.ts).

Published event pages expose the event's guest album without requiring a separate navigation step. Wedding pages use the integrated wedding experience; every specialized non-wedding event page renders the same stored guest media, filtering, progressive loading, lightbox, likes, reporting, and links to the full upload surface through [`src/routes/event-setup.ts`](../../src/routes/event-setup.ts) and [`src/views/event-vertical-preview.ts`](../../src/views/event-vertical-preview.ts). Surface access remains enforced before media is rendered.

Guestbook entries are published immediately after validation and rate limiting. Event managers can hide a visible entry or restore a hidden entry from the engagement dashboard; the former approval queue is not part of the current guest workflow. Existing non-hidden legacy entries remain visible. The verified route implementation is [`src/routes/experience.ts`](../../src/routes/experience.ts), and the public read filter is in [`src/routes/gallery.ts`](../../src/routes/gallery.ts).

Groups and tables can be renamed or deleted. Deleting a group leaves its guests ungrouped; deleting a table removes its seat assignments through the existing foreign-key cascade. Table capacity cannot be reduced below the assigned party-size total. The authenticated seating-plan page renders an A4-landscape print view using the wedding reception location; it can be printed or saved as PDF and intentionally omits guest email addresses and phone numbers. Structured menu courses and their printable, template-colored A4 view are stored by migration [`0063`](../../migrations/0063_structured_wedding_menu.sql); the earlier uploaded image/PDF menu remains supported as a fallback. Structured items expose owner-defined titles and descriptions, automatically save edits through the existing authenticated update route, and render under populated categories in the canonical reception order. Empty categories are omitted from guest and print views.

Direct SMS delivery, a drag-and-drop room canvas and venue-owned reusable layouts are **not implemented**. CSV import does not automatically send invitations or infer consent for future SMS delivery.

## Expiry and notification

[`reconcileEventTrials`](../../src/trial-lifecycle.ts), run daily, selects enforced trials ending within three days. It creates at-most-once owner notifications for three days, one day, and expiry. At expiry it changes the access state to `expired`, disables guest access/uploads/original downloads, and records `expires_at`.

[`getEventAccess`](../../src/event-access.ts) also lazily performs the expiry transition when an expired trial is read, so access does not depend exclusively on the cron.

The scheduled job uses D1 notifications only; no trial-expiry email is sent by this code.

## Unlock/payment

Commerce product and draft-order infrastructure exists in [`src/commerce.ts`](../../src/commerce.ts) and [`src/routes/commerce.ts`](../../src/routes/commerce.ts). The checkout page can create/update a draft order, and the catalog includes entitlement snapshots. Database triggers in [`0055_commerce_launch_guard.sql`](../../migrations/0055_commerce_launch_guard.sql) block paid transitions until all launch-readiness fields are true.

Before payment launch is ready, an event owner can submit `POST /api/account/events/:code/checkout/activate-beta`. The handler persists the selected draft snapshot, applies only monotonic access improvements, transitions `event_access` to `unlocked`, and writes a separate [`complimentary_event_activations`](../../migrations/0065_complimentary_event_activations.sql) audit row. It deliberately leaves the order in `draft` with no billing provider, payment ID, or paid timestamp; this path is not evidence of payment. Managers who are not owners cannot use it, and it is refused once [`commerceLaunchReady`](../../src/commerce.ts) becomes true. Coverage is in [`commerce-fulfillment.test.ts`](../../test/commerce-fulfillment.test.ts).

No route in the current inventory starts a Stripe checkout or consumes a payment-provider webhook. The provider-neutral paid fulfillment function and tests exist, but the production payment integration and who will invoke it remain **unknown/not implemented in the registered routes**.

## Collaboration and professional lifecycle

- Owners invite `owner`, `editor`, or `viewer` members through event routes; invitations are hashed, expiring records. An accepted `owner` invitation grants full co-owner capabilities.
- The recipient authenticates and accepts/declines through the invitation API; acceptance creates membership and notifications.
- Owners can change/remove non-owner members. Co-owners are added through explicit invitation acceptance and are protected from the ordinary member role/removal controls; account deletion requires no active owned events.
- Professional assignment uses `event_professional_assignments`; a professional accepts from the studio and can curate/upload official media until revoked.

Evidence: [`src/invitations.ts`](../../src/invitations.ts), [`src/routes/invitations.ts`](../../src/routes/invitations.ts), [`src/routes/event-professional.ts`](../../src/routes/event-professional.ts), and [`src/routes/studio.ts`](../../src/routes/studio.ts).

## Archive, trash, restore, purge

Owners trash an event via `POST /api/account/events/:code/trash`; the event gets `deleted_at` and `purge_at`, and active-event quota is released. Restore clears those timestamps and re-reserves quota. Trash UI/actions are in [`src/routes/account-trash.ts`](../../src/routes/account-trash.ts).

The daily [`purgeExpiredTrash`](../../src/repositories.ts) permanently deletes expired media first and then up to 25 expired events. Permanent event deletion removes known R2 media variants, cover/menu objects, D1 media/event state, and reconciles storage usage through cascading relations and explicit cleanup. Wedding media objects are not included in the explicit `SELECT object_key FROM media` loop in [`permanentlyDeleteEvent`](../../src/repositories.ts); whether all wedding-media R2 objects are removed elsewhere is **not established** and is recorded as technical debt.

## Lifecycle tests

Primary coverage includes [`event-routes.test.ts`](../../test/event-routes.test.ts), [`account-routes.test.ts`](../../test/account-routes.test.ts), [`wedding-guests-csv.test.ts`](../../test/wedding-guests-csv.test.ts), [`wedding-guest-planning-migration.test.ts`](../../test/wedding-guest-planning-migration.test.ts), [`event-access.test.ts`](../../test/event-access.test.ts), [`trial-lifecycle.test.ts`](../../test/trial-lifecycle.test.ts), [`trial-media-slots.test.ts`](../../test/trial-media-slots.test.ts), [`retention.test.ts`](../../test/retention.test.ts), [`invitations.test.ts`](../../test/invitations.test.ts), and [`commerce-fulfillment.test.ts`](../../test/commerce-fulfillment.test.ts).
