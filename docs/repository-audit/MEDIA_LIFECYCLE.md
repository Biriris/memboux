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
8. Schedule upload notifications.

Exact and metadata-insensitive JPEG/PNG/WebP canonical hashes are implemented in [`src/media-fingerprint.ts`](../../src/media-fingerprint.ts); uniqueness comes from indexes introduced by migrations [`0010`](../../migrations/0010_media_content_hash.sql) and [`0029`](../../migrations/0029_media_canonical_hash.sql).

Admin and studio uploads follow similar R2-then-D1 compensation patterns, but use their own route implementations. Studio uploads set `origin='official'` and the professional user ID.

## Resumable upload

[`src/routes/resumable-uploads.ts`](../../src/routes/resumable-uploads.ts) implements:

1. `PUT /api/upload/:code/fast` for a single streamed browser-to-Worker-to-R2 request for common files up to 64 MB. This stays below the lowest verified Cloudflare request-body ceiling with operational headroom. The route preserves authorization, quotas, exact SHA-256 duplicate detection, storage compensation, official-album insertion, and the batch notification/finalization contract. Its `Server-Timing` response and structured completion log separate authorization, duplicate-check, R2-write, and D1-persistence duration.
2. `POST /api/upload/:code/multipart` to authorize, validate, reserve trial/storage capacity, create an R2 multipart upload, and store a session.
3. `PUT .../parts/:partNumber` to upload and record parts together with the required SHA-256 part fingerprint.
4. Optional `PUT .../variants/:variant` for client-produced image thumbnail/preview objects and video poster thumbnails. A video thumbnail may also be attached immediately after the fast path has completed its session.
5. `POST .../complete` to validate every part manifest, derive a deterministic content hash from the ordered SHA-256 part fingerprints, complete R2 multipart state, insert the `media` row, and mark the session complete. A matching active media row causes the new R2 original and its variants to be deleted and its storage reservation to be released.
6. `POST .../finalize` to finalize multiple client sessions.
7. `DELETE .../:sessionId` and scheduled reconciliation to abort/clean incomplete or expired sessions and release reservations.

Before a new multipart session reserves storage, completed sessions are checked by client fingerprint plus size/type, with a conservative filename/size/type/timestamp fallback. Filename alone is never treated as proof of duplication. The deterministic manifest helper is in [`src/media-fingerprint.ts`](../../src/media-fingerprint.ts).

The session/token authorization, duplicate cleanup, and state machine are tested by [`gallery-routes.test.ts`](../../test/gallery-routes.test.ts), [`media-fingerprint.test.ts`](../../test/media-fingerprint.test.ts), and [`trial-media-slots.test.ts`](../../test/trial-media-slots.test.ts). No Queue is involved.

The browser client in [`src/views/upload.ts`](../../src/views/upload.ts) uses the single-request fast path for files up to 64 MB and resumable multipart uploads for larger files. Adaptive file concurrency allows up to eight files on an unconstrained desktop connection, five on coarse-pointer/mobile devices, and two when data-saver or a 2G-class connection is reported. A single large file can use up to six R2 part workers on desktop, three on coarse-pointer/mobile devices, or two on a constrained connection; batches use one part worker per active file. Each fast-path payload is read once into an `ArrayBuffer`, exact hashing and sample fingerprinting run concurrently, and the same bytes are uploaded. The upload critical path does not create or transfer client-side image variants; thumbnails and previews are produced and cached by the existing Cloudflare Images read path when requested. For video files, browser poster extraction runs in parallel and stores a small WebP thumbnail when the browser can decode the selected format. Payload transfer uses progress-aware `XMLHttpRequest` while control/finalization calls retain `fetch`: aggregate bytes and the percentage now update from live transmitted-byte events, including in-flight multipart parts, and display tenths of a percent rather than advancing only at part boundaries. The UI continues to show completed/selected file counts rather than a per-file queue. Its cancel action aborts active browser requests and calls the existing authenticated session-abort route for every known multipart session. Resumability, per-part fingerprints, retries, local session state, early duplicate responses, and the finalization contract are preserved. [`upload-view.test.ts`](../../test/upload-view.test.ts) validates the assembled browser script and these progress/concurrency/cancellation markers.

The shared gallery lightbox supports horizontal navigation, pinch/desktop zoom, explicit close, and swipe-up dismissal for an unzoomed open image. Swipe-up dismissal is attached only to pages that render the media lightbox and does not override horizontal navigation or zoomed-image panning. The verified implementations are [`src/views/media.ts`](../../src/views/media.ts) and [`src/views/shared.ts`](../../src/views/shared.ts).

## Read and transformation

`GET /media/:id` authorizes event/gallery access, blocks deleted/reported media, enforces original-download access, and streams R2. For images, `variant=thumb|preview` calls [`getOrCreateMediaVariant`](../../src/media-variants.ts):

- Return the cached R2 WebP variant if present.
- Fetch the original; for originals over 20 MB, return the original instead of transforming.
- Use Cloudflare Images to scale down to 640 px/76 quality or 1600 px/82 quality.
- Persist the generated WebP back to R2 with an immutable private cache directive.

Wedding, account-trash, and studio serving routes reuse the same helper. Video originals are streamed directly and support byte ranges. Gallery cards request the client-produced WebP poster thumbnail and retain a first-frame video fallback plus a visible video badge. Historical videos without a stored poster return `404` for the poster request and rely on that fallback. No transcoding pipeline exists in the repository.

## Curation and secondary objects

- `official_album_items` references ordinary media and is curated by accepted professionals through studio routes.
- Covers copy an authorized ordinary-media object to a dedicated R2 key and upsert `event_covers`; previous keys are asynchronously deleted.
- Wedding media is a separate table/library, with portrait slot assignments. Deleting wedding media removes its portrait references through foreign-key behavior and schedules R2 deletion.
- Wedding menus are a single replaceable object per event.
- Support email attachments are validated, stored in R2, and recorded in `support_attachments`; access routes enforce visitor/user/admin conversation access.

## Soft deletion, reporting, and permanent deletion

Ordinary media soft deletion sets `deleted_at` and `purge_at`; the object remains in R2 and can be restored unless it would duplicate active media or the event trial has expired. Reported media uses `reported_at` and disappears from ordinary gallery queries until admin action.

[`purgeExpiredTrash`](../../src/repositories.ts) runs daily and deletes up to 100 expired media records per run, removing the original and both derived variant keys and releasing account storage. [`permanentlyDeleteMedia`](../../src/media-trash.ts) performs the same object cleanup for explicit permanent deletion.

Deleting an event explicitly cleans ordinary media variants plus known cover/menu objects. The code does not enumerate `event_wedding_media` or `support_attachments` object keys during event deletion; D1 cascade deletion does not delete R2 bytes. Wedding-media orphan cleanup after event purge is therefore **unverified and likely incomplete** based on [`permanentlyDeleteEvent`](../../src/repositories.ts).

No repository-defined R2 lifecycle rule independently expires orphan objects.

## Backup/export lifecycle

Google Drive and Dropbox backup creation snapshots active ordinary `media` rows into `event_backup_items`. Workflow steps read each R2 `object_key`, upload it to the provider, and update item/backup progress. Wedding library, menus, covers, and support attachments are not included in that snapshot. See [`google-drive.ts`](../../src/google-drive.ts), [`dropbox.ts`](../../src/dropbox.ts), and [`cloud-backups.ts`](../../src/cloud-backups.ts).

Original export is denied when enforced event access disables originals. The exact retention of completed provider backups is provider-side and **Unknown**.

## Tests

Relevant coverage includes [`gallery-routes.test.ts`](../../test/gallery-routes.test.ts), [`media-fingerprint.test.ts`](../../test/media-fingerprint.test.ts), [`media-trash.test.ts`](../../test/media-trash.test.ts), [`official-album-retention.test.ts`](../../test/official-album-retention.test.ts), [`quotas.test.ts`](../../test/quotas.test.ts), [`google-drive.test.ts`](../../test/google-drive.test.ts), [`dropbox.test.ts`](../../test/dropbox.test.ts), [`wedding-menu.test.ts`](../../test/wedding-menu.test.ts), and [`inbound-support-email.test.ts`](../../test/inbound-support-email.test.ts).
