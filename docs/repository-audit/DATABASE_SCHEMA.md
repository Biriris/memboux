# Database schema

## Authority and validation

The D1 schema is defined by the ordered SQL files in [`migrations/`](../../migrations/), not by TypeScript types. The current chain contains 63 files, from [`0001_initial.sql`](../../migrations/0001_initial.sql) through [`0063_structured_wedding_menu.sql`](../../migrations/0063_structured_wedding_menu.sql). Migrations `0061` and `0062` have dedicated D1 compatibility coverage in [`wedding-guest-planning-migration.test.ts`](../../test/wedding-guest-planning-migration.test.ts) and [`wedding-invitation-delivery-migration.test.ts`](../../test/wedding-invitation-delivery-migration.test.ts); migration `0063` is exercised through the complete migration chain in the Worker test suite.

Repository tests prove the newest migration against the D1 test runtime; they do not prove that remote D1 has applied migration `0063`.

Notation in this document lists logical current columns. Full defaults, checks, indexes, and rebuild details remain canonical in the linked migrations.

## Identity, accounts, and administration

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `user` | Better Auth user: `id`, name, unique email, verification flag, image, timestamps. | [`0003`](../../migrations/0003_accounts_and_event_members.sql) |
| `session` | Better Auth session token, expiry, user, IP/user agent, timestamps. | [`0003`](../../migrations/0003_accounts_and_event_members.sql) |
| `account` | Better Auth provider account, tokens/password, scopes, user relation. | [`0003`](../../migrations/0003_accounts_and_event_members.sql) |
| `verification` | Better Auth verification/reset value and expiry. | [`0003`](../../migrations/0003_accounts_and_event_members.sql) |
| `admin_members` | One admin membership per user, role/status/grant metadata, notification email and support-notification preference. | [`0039`](../../migrations/0039_admin_rbac.sql), [`0040`](../../migrations/0040_role_based_support_helpdesk.sql) |
| `admin_audit_log` | Actor, action, target, JSON metadata, hashed IP, timestamp. | [`0039`](../../migrations/0039_admin_rbac.sql) |
| `account_entitlements` | Plan key and storage/event/member limits per user. | [`0015`](../../migrations/0015_entitlements_and_storage_usage.sql) |
| `account_storage_usage` | Account storage counter. | [`0015`](../../migrations/0015_entitlements_and_storage_usage.sql) |
| `account_event_usage` | Active-owned-event counter. | [`0015`](../../migrations/0015_entitlements_and_storage_usage.sql) |
| `account_subscriptions` | Internal subscription snapshot including provider IDs, interval, amount, lifecycle timestamps. | [`0020`](../../migrations/0020_account_subscriptions_and_payments.sql) |
| `account_payments` | Provider-neutral payment records with amount, currency, provider ID, and paid timestamp. | [`0020`](../../migrations/0020_account_subscriptions_and_payments.sql), unique provider index in [`0050`](../../migrations/0050_unique_provider_payments.sql) |
| `account_notifications` | Invitation/media/trial notifications, event/actor links, item count, read state. | [`0023`](../../migrations/0023_notifications_professional_invites_and_covers.sql), rebuilt by [`0046`](../../migrations/0046_trial_lifecycle_notifications.sql) |

## Events, access, and engagement

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `events` | Event identity/code, current and legacy names/types/locales, dates, location, status, expiry, PIN hash, soft-delete timestamps. | Created by [`0001`](../../migrations/0001_initial.sql); evolved by `0002`, `0003`, `0004`, `0006`-`0011`, `0025`, `0026`, `0028`, and [`0060`](../../migrations/0060_expand_event_types_and_locales.sql) |
| `event_members` | Composite event/user membership with `owner`, `editor`, or `viewer` role. | [`0003`](../../migrations/0003_accounts_and_event_members.sql) |
| `event_invitations` | Hashed invitation token, email, event role, inviter, kind, expiry, accepted/declined timestamps. | [`0005`](../../migrations/0005_event_invitations.sql), [`0021`](../../migrations/0021_explicit_album_invitations.sql), [`0023`](../../migrations/0023_notifications_professional_invites_and_covers.sql) |
| `event_access` | `preview`/`trial`/`unlocked`/`expired`, observe/enforced mode, feature flags, trial dates, media limit, lifetime consumed-upload counter. | [`0041`](../../migrations/0041_event_access_lifecycle.sql), [`0044`](../../migrations/0044_enforce_new_event_trials.sql), [`0058`](../../migrations/0058_lifetime_trial_media_slots.sql) |
| `event_covers` | Event cover R2 key, source media, updater, content type, timestamp. | [`0023`](../../migrations/0023_notifications_professional_invites_and_covers.sql) |
| `event_experience_settings` | RSVP, guestbook, comments, slideshow, and moderation flags. | [`0027`](../../migrations/0027_event_engagement.sql) |
| `event_rsvps` | Guest response, guest count, dietary notes, message, contact, timestamps, and optional wedding guest-directory link. | [`0027`](../../migrations/0027_event_engagement.sql), extended by [`0061`](../../migrations/0061_wedding_guest_planning.sql) |
| `event_guestbook_entries` | Author/message, moderation status, creation/moderation times. | [`0027`](../../migrations/0027_event_engagement.sql) |
| `event_vertical_profiles` | Generic event wizard copy/theme/publish state plus JSON custom fields. | [`0043`](../../migrations/0043_event_vertical_profiles.sql), [`0052`](../../migrations/0052_event_vertical_custom_fields.sql) |
| `professional_profiles` | Professional business profile, slug, status, timestamps. | [`0016`](../../migrations/0016_professional_official_albums.sql) |
| `event_professional_assignments` | Event/professional assignment, assigner, status, acceptance and update times. | [`0016`](../../migrations/0016_professional_official_albums.sql) |

`events` currently retains `couple`, `default_locale_legacy`, and `event_type_legacy` alongside `eventName`, `default_locale`, and `event_type`. This is the actual result of the migration chain, not a documentation alias. [`schema-compatibility.test.ts`](../../test/schema-compatibility.test.ts) covers compatibility expectations.

## Media and privacy

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `media` | Event media metadata and R2 key, type/content type/size, uploader/origin, upload/capture timestamps, exact/canonical hashes, title, report/soft-delete/purge state, consent evidence. | [`0001`](../../migrations/0001_initial.sql), evolved by `0007`, `0008`, `0010`, `0011`, `0013`, `0016`, and [`0029`](../../migrations/0029_media_canonical_hash.sql) |
| `media_likes` | Composite media/actor like record. | [`0024`](../../migrations/0024_media_likes.sql) |
| `media_comments` | Event/media comment, author, moderation status, timestamp. | [`0027`](../../migrations/0027_event_engagement.sql) |
| `official_album_items` | Curated event/media membership, position, actor, timestamp. | [`0016`](../../migrations/0016_professional_official_albums.sql), rebuilt for media-retention semantics by [`0017`](../../migrations/0017_preserve_official_albums.sql) |
| `media_removal_requests` | Request against a specific media item, requester email, reason, status, resolution time. | [`0009`](../../migrations/0009_privacy_requests.sql) |
| `privacy_requests` | General privacy request email/type/details/status/timestamps. | [`0014`](../../migrations/0014_privacy_requests.sql) |
| `multipart_upload_sessions` | R2 multipart identifiers, target media/object, file metadata, fingerprint, actor/origin, reservation, consent, status/expiry/completion. | [`0038`](../../migrations/0038_resumable_media_uploads.sql) |
| `multipart_upload_parts` | Composite session/part record with ETag, byte size, optional client hash, timestamp. | [`0038`](../../migrations/0038_resumable_media_uploads.sql) |

## Wedding specialization

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `event_wedding_profiles` | Six-step wedding content, places, template/accent, publication, catalog/estimate, completion state. | [`0030`](../../migrations/0030_wedding_wizard.sql), `0031`, `0034`, rebuilt by [`0037`](../../migrations/0037_wedding_wizard_six_steps.sql) |
| `event_wedding_features` | Selected catalog features, enabled flag, price and catalog version. | [`0030`](../../migrations/0030_wedding_wizard.sql) |
| `event_wedding_media` | Separate pre-wedding image/video library and R2 metadata. | [`0035`](../../migrations/0035_wedding_media.sql) |
| `event_wedding_portrait_assignments` | Composite event/slot assignment to wedding media with position. | [`0036`](../../migrations/0036_wedding_portrait_assignments.sql) |
| `event_wedding_menus` | One wedding menu object per event with filename/type/size/updater. | [`0034`](../../migrations/0034_wedding_places_and_menu.sql) |
| `event_wedding_menu_courses` | Structured reception-menu courses with category, owner-defined title/description and display order. | [`0063`](../../migrations/0063_structured_wedding_menu.sql) |
| `event_wedding_guest_groups` | Event-scoped households or guest groups. | [`0061`](../../migrations/0061_wedding_guest_planning.sql) |
| `event_wedding_guests` | Guest identity/contact, invitation-token hash, plus-one limit, attendance targets, synchronized RSVP state, and retryable email-delivery state. | [`0061`](../../migrations/0061_wedding_guest_planning.sql), [`0062`](../../migrations/0062_wedding_guest_invitation_delivery.sql) |
| `event_wedding_tables` | Event-scoped seating tables, shape, capacity, order and optional layout coordinates. | [`0061`](../../migrations/0061_wedding_guest_planning.sql) |
| `event_wedding_seat_assignments` | One current table assignment per guest record. | [`0061`](../../migrations/0061_wedding_guest_planning.sql) |
| `event_wedding_price_snapshots` | Event-specific base and feature prices, currency, catalog version and lock interval. | [`0061`](../../migrations/0061_wedding_guest_planning.sql) |

## Commerce

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `commerce_products` | Localized product catalog, billing model, price, access entitlements, activation/checkout flags. | [`0042`](../../migrations/0042_commerce_catalog_and_orders.sql), [`0049`](../../migrations/0049_localize_commerce_catalog.sql) |
| `commerce_orders` | User/event order with draft/payment state, totals, provider IDs, expiry and timestamps. | [`0042`](../../migrations/0042_commerce_catalog_and_orders.sql), provider uniqueness in [`0050`](../../migrations/0050_unique_provider_payments.sql) |
| `commerce_order_items` | Product snapshot and line totals per order. | [`0042`](../../migrations/0042_commerce_catalog_and_orders.sql) |
| `commerce_launch_settings` | Legal, tax, invoicing, policy, Stripe, and master payment-enable flags. | [`0055`](../../migrations/0055_commerce_launch_guard.sql) |

Two triggers in migration `0055` reject paid/payment transitions unless all launch flags are ready. The repository currently exposes draft selection, not a provider checkout/webhook fulfillment route; production payment launch is therefore not established.

## Cloud backups

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `cloud_connections` | Provider-neutral encrypted refresh token, IV, scope, optional root folder per user/provider. | [`0019`](../../migrations/0019_google_drive_backups.sql), rebuilt for Dropbox by [`0022`](../../migrations/0022_dropbox_backups.sql) |
| `cloud_oauth_states` | Hashed OAuth state, user, provider, locale, expiry. | `0019`, rebuilt by `0022` and [`0060`](../../migrations/0060_expand_event_types_and_locales.sql) |
| `event_backups` | Backup owner/event/provider, Workflow instance, progress counters, status/error/timestamps. | `0019`, rebuilt by `0022` |
| `event_backup_items` | Composite backup/media snapshot with sequence, R2 key, status, provider file ID, progress/error. | `0019`, rebuilt by `0022` |

Refresh tokens are AES-GCM encrypted in [`google-drive.ts`](../../src/google-drive.ts) and [`dropbox.ts`](../../src/dropbox.ts), with user/provider-specific additional authenticated data and a key derived from `BETTER_AUTH_SECRET`.

## Support and email

| Table | Current purpose and key columns | Migration evidence |
| --- | --- | --- |
| `support_conversations` | User/visitor identity, subject/status/source, category/required role/assignee, notification delivery, priority/SLA, read/resolution timestamps. | [`0033`](../../migrations/0033_support_conversations.sql), evolved by `0040`, `0047`, `0048`, `0053`, `0054` |
| `support_messages` | Conversation message, sender/actor, body, email delivery and inbound-email metadata. | `0033`, evolved by `0040`, `0048`, [`0057`](../../migrations/0057_inbound_support_email.sql) |
| `support_attachments` | Conversation/message attachment R2 key, name/type/size/timestamp. | [`0059`](../../migrations/0059_support_email_attachments.sql) |
| `email_delivery_attempts` | Hashed recipient, purpose, accepted/failed state, provider message and webhook outcome. | [`0018`](../../migrations/0018_email_delivery_attempts.sql), rebuilt by [`0045`](../../migrations/0045_expand_email_delivery_purposes.sql), evolved by `0048` |
| `resend_webhook_events` | Idempotency/audit record for received Resend events. | [`0048`](../../migrations/0048_resend_delivery_webhooks.sql) |

## Operational tables and triggers

`request_rate_limits`, created by [`0012_request_rate_limits.sql`](../../migrations/0012_request_rate_limits.sql), stores persistent scope/identity counters and expiry.

Final trigger inventory:

- `media_trial_limit_before_insert`, `media_trial_usage_after_insert`
- `wedding_media_trial_limit_before_insert`, `wedding_media_trial_usage_after_insert`
- `media_trial_limit_before_restore`
- `multipart_trial_limit_before_insert`
- `commerce_orders_block_payment_insert`, `commerce_orders_block_payment_transition`

The trial triggers are finalized by [`0058_lifetime_trial_media_slots.sql`](../../migrations/0058_lifetime_trial_media_slots.sql); earlier trigger versions in `0051` and `0056` are replaced.

## Migration and deployment unknowns

- No repository file records the last migration applied to remote D1.
- Rollback/down migrations do not exist.
- Backup/restore and disaster-recovery configuration for D1 is not committed.
- Migration `0060` rebuilds `cloud_oauth_states` and retains legacy event columns; the intended removal date for legacy columns is **Unknown**.
- Remote application status for migration `0063` is **Unknown** until deployment-time migration checks are run.
