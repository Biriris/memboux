# Media lifecycle

## Storage model

D1 stores metadata and R2 binding `MEDIA` stores bytes. The bucket is not configured as public; all reads pass through Worker routes. The principal metadata tables are `media`, `event_wedding_media`, `event_wedding_menus`, `event_covers`, `support_attachments`, `multipart_upload_sessions`, and `multipart_upload_parts`.

Verified key conventions:

| Object type | Key format/source |
| --- | --- |
| Ordinary/official media | `<event-id>/<media-id>.<safe-extension>` in [`routes/gallery.ts`](../../src/routes/gallery.ts), [`routes/studio.ts`](../../src/routes/studio.ts), [`routes/admin-events.ts`](../../src/routes/admin-events.ts), and [`routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts) |
| Derived thumbnail | `<original-key>.memboux-thumb-v1.webp` in [`media-variants.ts`](../../src/media-variants.ts) |
| Derived preview | `<original-key>.memboux-preview-v1.webp` in [`media-variants.ts`](../../src/media-variants.ts) |
| Event cover | `covers/<event-id>/<uuid>.<extension>` in [`routes/events.ts`](../../src/routes/events.ts) |
| Wedding library | `wedding-media/<event-id>/<uuid>.<extension>` in [`routes/wedding.ts`](../../src/routes/wedding.ts) |
| Wedding menu | `wedding-menus/<event-id>/<uuid>.<extension>` in [`routes/wedding.ts`](../../src/routes/wedding.ts) |
| Support attachment | `support-attachments/<conversation-id>/<message-id>/<uuid>` in [`support-attachments.ts`](../../src/support-attachments.ts) |

## Ordinary upload

`POST /api/upload/:code` in [`src/routes/gallery.ts`](../../src/routes/gallery.ts) implements bounded multipart-form upload:

1. Load active event and lifecycle state; require guest-upload access or an authorized event member.
2. Validate upload policy, consent, file count/type/size, and account/event capacity.
3. Reserve account storage.
4. Read bytes, derive capture time through EXIF where applicable, calculate exact and canonical hashes, and reject per-event duplicates.
5. Put the original object into R2.
6. Insert D1 `media` metadata with consent policy/version and uploader identity.
7. Roll back R2 objects, D1 rows, and quota reservations when the batch fails.

For recognized enforced packages, [`eventMediaCapacity`](../../src/event-access.ts) checks both remaining lifetime slots and the contribution window before transfer. Migration [`0074_event_upload_windows_and_no_downgrade.sql`](../../migrations/0074_event_upload_windows_and_no_downgrade.sql) repeats this invariant in D1 triggers for race safety. The first ordinary/wedding media insert or multipart reservation starts the 14/45/90-day package window. When it closes, new owner and guest uploads are rejected while existing media remains readable under the normal access and download policies.
8. Schedule upload notifications.

Exact and metadata-insensitive JPEG/PNG/WebP canonical hashes are implemented in [`src/media-fingerprint.ts`](../../src/media-fingerprint.ts); uniqueness comes from indexes introduced by migrations [`0010`](../../migrations/0010_media_content_hash.sql) and [`0029`](../../migrations/0029_media_canonical_hash.sql).

Admin and studio uploads follow similar R2-then-D1 compensation patterns, but use their own route implementations. Studio uploads set `origin='official'` and the professional user ID.

## Resumable upload

[`src/routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts) implements:

1. `PUT /api/upload/:code/fast` for a single streamed browser-to-Worker-to-R2 request for common files up to 64 MB. This stays below the lowest verified Cloudflare request-body ceiling with operational headroom. The route preserves authorization, quotas, exact SHA-256 duplicate detection, storage compensation, official-album insertion, and the batch notification/finalization contract. Its `Server-Timing` response and structured completion log separate authorization, duplicate-check, R2-write, and D1-persistence duration.
2. `POST /api/upload/:code/multipart` to authorize, validate, reserve package/storage capacity, create an R2 multipart upload, and store a session.
3. `PUT .../parts/:partNumber` to upload and record parts together with the required SHA-256 part fingerprint.
4. Optional `PUT .../variants/:variant` for client-produced image thumbnail/preview objects and video poster thumbnails. A video thumbnail may also be attached immediately after the fast path has completed its session.
5. `POST .../complete` to validate every part manifest, derive a deterministic content hash from the ordered SHA-256 part fingerprints, complete R2 multipart state, insert the `media` row, and mark the session complete. A matching active media row causes the new R2 original and its variants to be deleted and its storage reservation to be released.
6. `POST .../finalize` to finalize multiple client sessions.
7. `DELETE .../:sessionId` and scheduled reconciliation to abort/clean incomplete or expired sessions and release reservations.

Before a new multipart session reserves storage, completed sessions are checked by client fingerprint plus size/type, with a conservative filename/size/type/timestamp fallback. Filename alone is never treated as proof of duplication. The deterministic manifest helper is in [`src/media-fingerprint.ts`](../../src/media-fingerprint.ts).

The session/token authorization, duplicate cleanup, and state machine are tested by [`gallery-routes.test.ts`](../../test/gallery-routes.test.ts), [`media-fingerprint.test.ts`](../../test/media-fingerprint.test.ts), and [`free-event-plan-migration.test.ts`](../../test/free-event-plan-migration.test.ts). No Queue is involved.

The browser client in [`src/views/upload.ts`](../../src/views/upload.ts) uses the single-request fast path for files up to 64 MB and resumable multipart uploads for larger files. Adaptive file concurrency allows up to eight files on an unconstrained desktop connection, five on coarse-pointer/mobile devices, and two when data-saver or a 2G-class connection is reported. A single large file can use up to six R2 part workers on desktop, three on coarse-pointer/mobile devices, or two on a constrained connection; batches use one part worker per active file. Each fast-path payload is read once into an `ArrayBuffer`, exact hashing and sample fingerprinting run concurrently, and the same bytes are uploaded. The upload critical path does not create or transfer client-side image variants; thumbnails and previews are produced and cached by the existing Cloudflare Images read path when requested. For video files, browser poster extraction runs in parallel and stores a small WebP thumbnail when the browser can decode the selected format. Payload transfer uses progress-aware `XMLHttpRequest` while control/finalization calls retain `fetch`: aggregate bytes and the percentage now update from live transmitted-byte events, including in-flight multipart parts, and display tenths of a percent rather than advancing only at part boundaries. The UI continues to show completed/selected file counts rather than a per-file queue. Its cancel action aborts active browser requests and calls the existing authenticated session-abort route for every known multipart session. Resumability, per-part fingerprints, retries, local session state, early duplicate responses, and the finalization contract are preserved. [`upload-view.test.ts`](../../test/upload-view.test.ts) validates the assembled browser script and these progress/concurrency/cancellation markers.

The shared gallery lightbox supports horizontal navigation, pinch/desktop zoom, explicit close, and vertical swipe dismissal in either direction for an unzoomed open image or video on touch devices. The gesture follows the finger with scale and opacity feedback, locks out when horizontal navigation wins, and does not start in the bottom video-control area. Successful swipe dismissal emits the `memboux:lightbox-dismiss` browser event with direction and media type. The behavior is attached only to pages that render the media lightbox and does not override zoomed-image panning. Closing the lightbox through any path pauses the active video or audio element, removes its source, reloads it to release the browser media pipeline, and clears the stage.

When originals are allowed, individual tile and lightbox actions fetch the real file and prefer the browser Web Share API with a `File`, which exposes the operating system share sheet and its available save-to-device actions. Unsupported browsers fall back to an attachment download. The web application cannot silently write to iOS or Android photo libraries. Bulk download uses the same multi-file share path when the platform accepts it, with ordinary downloads as the fallback. The event `original_downloads` entitlement, album `allow_downloads` policy and `guest_downloads_enabled` setting must all allow an individual download. Migration [`0072`](../../migrations/0072_guest_bulk_downloads.sql) adds `guest_bulk_downloads_enabled`; bulk access requires both guest download settings and therefore cannot override individual-download denial. Owners and co-owners manage both settings through [`src/routes/experience.ts`](../../src/routes/experience.ts).

The canonical gallery, embedded generic-event album, and embedded wedding album pass the resolved download policy into the shared lightbox; trial/preview pages therefore render the upgrade state instead of an unusable download control. Uploader identity and the removal-report action appear only after opening the lightbox, while downloadable gallery tiles expose a direct icon action. Gallery image and video previews share the same contained 4:5 `object-cover` tile, while the lightbox preserves each full image or video with `object-contain`. Progressive cards are hidden through both the renderer/script state and an explicit CSS guard so masonry display rules cannot expose an unmeasured, full-width deferred image or video over the grid. Image cards retry a failed derivative through the protected original media route and replace an unrecoverable broken image with a localized placeholder. The verified implementations are [`src/views/media.ts`](../../src/views/media.ts), [`src/views/shared.ts`](../../src/views/shared.ts), [`src/views/event-vertical-preview.ts`](../../src/views/event-vertical-preview.ts), [`src/views/wedding-experience.ts`](../../src/views/wedding-experience.ts), and [`src/styles.css`](../../src/styles.css).

## Read and transformation

`GET /media/:id` authorizes event/gallery access, blocks deleted/reported media, enforces original-download access, and streams R2. For images, `variant=thumb|preview` calls [`getOrCreateMediaVariant`](../../src/media-variants.ts):

- Return a non-empty cached R2 WebP variant if present; an empty cached object is removed and regenerated.
- Fetch the original; for originals over 20 MB, return the original instead of transforming.
- Use Cloudflare Images to scale down to 640 px/76 quality or 1600 px/82 quality, refetching the original and retrying once if the transformation throws.
- Persist the generated WebP back to R2 with an immutable private cache directive.

Wedding, account-trash, and studio serving routes reuse the same helper. Video originals are streamed directly and support byte ranges. Gallery cards request the client-produced WebP poster thumbnail and retain a first-frame video fallback plus a visible video badge. When a selected event album contains exactly one item and that item is a video, the album hero uses the same poster endpoint with the video's first frame as fallback; otherwise the normal event cover remains in use. Dashboard event cards report separate image and video totals and use the first active video as their visual when no image cover exists. Historical videos without a stored poster return `404` for the poster request and rely on that fallback. No transcoding pipeline exists in the repository.

## Curation and secondary objects

- `official_album_items` references ordinary media and is curated by accepted professionals through studio routes.
- [`resolveEventCover`](../../src/event-cover.ts) gives an owner-selected `event_covers` row precedence and otherwise resolves the oldest active, unreported ordinary image as a temporary automatic cover. The automatic fallback reads the existing media object and does not create another R2 copy or database row. An explicit owner selection still copies the authorized source to a dedicated R2 key and upserts `event_covers`; previous selected-cover keys are asynchronously deleted. Dashboard cards, event workspace/gallery heroes, generic event heroes, wedding pages, and personalized invitation covers use the same resolution rule.
- Wedding media is a separate table/library, with portrait slot assignments. Deleting wedding media removes its portrait references through foreign-key behavior and schedules R2 deletion.
- Wedding menus are a single replaceable object per event.
- Support email attachments are validated, stored in R2, and recorded in `support_attachments`; access routes enforce visitor/user/admin conversation access.

## Soft deletion, reporting, and permanent deletion

Ordinary media soft deletion sets `deleted_at` and `purge_at`; the object remains in R2 and can be restored unless it would duplicate active media or exceed the event package limit. Reported media uses `reported_at` and disappears from ordinary gallery queries until admin action.

[`purgeExpiredTrash`](../../src/repositories.ts) runs daily and deletes up to 100 expired media records per run, removing the original and both derived variant keys and releasing account storage. [`permanentlyDeleteMedia`](../../src/media-trash.ts) performs the same object cleanup for explicit permanent deletion.

Deleting an event explicitly cleans ordinary media variants, wedding-library media variants, and known cover/menu objects. Support attachments belong to support conversations rather than events and are not part of event deletion. [`permanentlyDeleteEvent`](../../src/repositories.ts) also releases the ordinary-media, wedding-media, and menu bytes charged to the owning account.

No repository-defined R2 lifecycle rule independently expires orphan objects.

## Backup/export lifecycle

### Albums, moderation, and event exports

[`src/event-media-hub.ts`](../../src/event-media-hub.ts) resolves event albums,
PIN-derived access cookies, pseudonymous guest sessions, and aggregate activity.
[`src/routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts) carries
the album, guest-session ID, and initial moderation state through fast and
multipart paths. Public gallery queries return only approved media and isolate
the main gallery (`album_id IS NULL`) from each album.

When video guestbook is enabled, the browser uploads through the existing guest
fast-upload path and then links that event-scoped, active video to
`event_guestbook_entries.media_id`. The server verifies the event, media type,
guest session, moderation/report and deletion state. A failed linking request
can leave the video as an ordinary gallery item; retrying reuses duplicate
handling. There is no server-side recording or transcoding.

The slideshow feed can include approved images and videos from the main gallery
or a selected album. Playback settings control uploader labels, shuffle,
transition and photo duration; videos advance on `ended`. The client polls for
new media rather than maintaining a persistent connection.

Event branding references an existing active event image as its logo and does
not copy the R2 object. Custom domains and organization-wide brand inheritance
are not implemented.

[`src/routes/event-albums.ts`](../../src/routes/event-albums.ts) provides album
policies and a streaming stored-method ZIP implemented in
[`src/zip-stream.ts`](../../src/zip-stream.ts). ZIP entry names remove traversal
segments. The response reads one R2 object at a time instead of buffering the
complete archive. ZIP64 and individual objects of 4 GiB or larger are not
supported. Interrupted archive downloads are not resumable background jobs.

Custom album capacity is an event-package entitlement implemented by
[`0075_event_album_entitlements.sql`](../../migrations/0075_event_album_entitlements.sql):
Free includes one, Moments includes three, and Celebration includes five. The
main Guest Gallery does not consume these slots. Official Album is unavailable
on enforced Free events; paid packages include it without consuming a custom-album slot. Each custom
album has its own guest URL and QR destination, appears in the event Share
section, and can be opened directly in QR Template Studio. Deleting a custom
album soft-deletes the album, returns its active media and incomplete multipart
uploads to the main gallery, clears it as a slideshow filter, and immediately
returns its package slot. Existing events above a newly introduced limit keep
their albums but cannot create another until below their limit.

Google Drive and Dropbox backup creation snapshots active ordinary `media`, the
wedding website media library, the selected event cover, and the wedding menu
PDF into `event_backup_items`. After the file steps complete, each provider
workflow writes or replaces `memboux-event.json` in the same event folder. This
manifest contains the portable Event Archive plus provider file identifiers and
the metadata needed to rebuild gallery, wedding-media, cover, menu, and album
relationships. Support attachments remain outside event backups. See
[`cloud-backup-manifest.ts`](../../src/cloud-backup-manifest.ts),
[`google-drive.ts`](../../src/google-drive.ts), and
[`dropbox.ts`](../../src/dropbox.ts).

Importing a provider-backed `memboux-event.json` creates a new private preview
and queues `CloudEventRestoreWorkflow`. The Workflow streams every listed
provider object back into R2 and rebuilds its D1 media record; paid entitlements,
memberships, invitations, PIN/token hashes and audit activity remain excluded.
The provider account containing the files must be connected at import time. See
[`cloud-restore.ts`](../../src/cloud-restore.ts) and migration
[`0076_cloud_event_restore_jobs.sql`](../../migrations/0076_cloud_event_restore_jobs.sql).

Original export is denied when enforced event access disables originals. The exact retention of completed provider backups is provider-side and **Unknown**.

## Tests

Relevant coverage includes [`gallery-routes.test.ts`](../../test/gallery-routes.test.ts), [`media-fingerprint.test.ts`](../../test/media-fingerprint.test.ts), [`media-trash.test.ts`](../../test/media-trash.test.ts), [`official-album-retention.test.ts`](../../test/official-album-retention.test.ts), [`quotas.test.ts`](../../test/quotas.test.ts), [`google-drive.test.ts`](../../test/google-drive.test.ts), [`dropbox.test.ts`](../../test/dropbox.test.ts), [`wedding-menu.test.ts`](../../test/wedding-menu.test.ts), and [`inbound-support-email.test.ts`](../../test/inbound-support-email.test.ts).
