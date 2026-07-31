import { Hono } from "hono";
import { canManageOfficialAlbum } from "../studio";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_FILES,
  MULTIPART_UPLOAD_PART_SIZE,
  MULTIPART_UPLOAD_TTL_MS,
} from "../config";
import type { Bindings, EventRow } from "../domain";
import { eventMediaCapacity, isTrialMediaLimitConstraint } from "../event-access";
import { hasGalleryAccess } from "../gallery-access";
import { normalizeLocale } from "../i18n";
import { queueAutomaticCloudBackupsForEvent } from "../cloud-backups";
import { notifyEventMembersAboutUpload } from "../notifications";
import { GUEST_UPLOAD_POLICY_VERSION } from "../privacy";
import { isCanonicalDuplicateConstraint } from "../media-fingerprint";
import { mediaObjectKeys, mediaVariantKey, type MediaVariant } from "../media-variants";
import { releaseStorage, reserveStorageForEvent } from "../quotas";
import { consumeRateLimit, tooManyRequests } from "../rate-limit";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { safeFileExtension, validateUploadFiles } from "../upload-policy";
import { constantTimeEqual, sha256 } from "../utils";

export const resumableUploadRoutes = new Hono<{ Bindings: Bindings }>();

type UploadOrigin = "guest" | "official";

type UploadSession = {
  id: string;
  event_id: string;
  upload_id: string;
  object_key: string;
  media_id: string;
  file_name: string;
  content_type: string;
  media_type: "image" | "video";
  size_bytes: number;
  part_size: number;
  total_parts: number;
  client_fingerprint: string;
  uploaded_by: string;
  uploaded_by_user_id: string | null;
  origin: UploadOrigin;
  reservation_owner_id: string | null;
  upload_consent_at: number | null;
  upload_policy_version: string | null;
  captured_at: number | null;
  status: "uploading" | "completing" | "completed" | "duplicate" | "aborted" | "failed";
  created_at: number;
  updated_at: number;
  expires_at: number;
  completed_at: number | null;
  notified_at: number | null;
};

type SessionPart = {
  part_number: number;
  etag: string;
  size_bytes: number;
  client_hash: string | null;
};

type UploadContext = {
  event: EventRow;
  origin: UploadOrigin;
  uploader: { id: string; name: string } | null;
  uploadedBy: string;
  consentAt: number | null;
  policyVersion: string | null;
};

function jsonError(message: string, status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429 | 500) {
  return Response.json({ ok: false, message }, { status });
}

async function uploadToken(secret: string, session: Pick<UploadSession, "id" | "event_id" | "upload_id">) {
  return sha256(`memboux-upload-v1:${secret}:${session.id}:${session.event_id}:${session.upload_id}`);
}

function suppliedToken(request: Request) {
  return request.headers.get("Upload-Token") ?? "";
}

async function tokenIsValid(secret: string, request: Request, session: UploadSession) {
  return tokenMatches(secret, suppliedToken(request), session);
}

async function tokenMatches(secret: string, supplied: string, session: UploadSession) {
  return Boolean(supplied && constantTimeEqual(supplied, await uploadToken(secret, session)));
}

function inferredContentType(filename: string, supplied: string) {
  const normalized = supplied.toLowerCase().split(";", 1)[0].trim();
  if (normalized) return normalized;
  const extension = safeFileExtension(filename);
  return ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

async function authorizeUpload(
  c: {
    env: Bindings;
    req: {
      raw: Request;
      param(name: string): string;
    };
  },
  input: { origin: UploadOrigin; name: string; consent: string },
): Promise<UploadContext | Response> {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return jsonError("Event not found.", 404);
  if (Date.now() > event.expires_at) return jsonError("This event has expired.", 410);
  const uploader = await currentUser(c);
  const capacity = await eventMediaCapacity(c.env.DB, event.id, 1, input.origin === "official");
  if (!capacity.allowed)
    return jsonError(`This trial event reached its ${capacity.access.media_limit}-media limit.`, 409);
  if (input.origin === "official") {
    if (!uploader) return jsonError("Sign in to upload official media.", 401);
    if (!(await canManageOfficialAlbum(c.env.DB, event.id, uploader.id)))
      return jsonError("You cannot manage this official album.", 403);
    return {
      event,
      origin: "official",
      uploader,
      uploadedBy: uploader.name.slice(0, 60),
      consentAt: null,
      policyVersion: null,
    };
  }
  if (!(await hasGalleryAccess(c.req.raw, event)))
    return jsonError("Gallery PIN required.", 401);
  if (input.consent !== "accepted")
    return jsonError("Upload confirmation is required.", 400);
  const uploadedBy = input.name.trim().slice(0, 60) || "Anonymous";
  return {
    event,
    origin: "guest",
    uploader,
    uploadedBy,
    consentAt: Date.now(),
    policyVersion: GUEST_UPLOAD_POLICY_VERSION,
  };
}

async function getSession(db: D1Database, code: string, id: string) {
  return db.prepare(
    `SELECT s.* FROM multipart_upload_sessions s
     JOIN events e ON e.id=s.event_id
     WHERE s.id=? AND e.code=?`,
  ).bind(id, code).first<UploadSession>();
}

function expectedPartSize(session: UploadSession, partNumber: number) {
  if (partNumber < session.total_parts) return session.part_size;
  return session.size_bytes - session.part_size * (session.total_parts - 1);
}

async function abortSession(env: Bindings, session: UploadSession, status: "aborted" | "failed" = "aborted") {
  if (session.status === "completed" || session.status === "duplicate" || session.status === "aborted")
    return;
  try {
    await env.MEDIA.resumeMultipartUpload(session.object_key, session.upload_id).abort();
  } catch {
    /* R2 also expires incomplete multipart uploads automatically. */
  }
  await env.MEDIA.delete(mediaObjectKeys(session.object_key));
  await releaseStorage(env.DB, session.reservation_owner_id, session.size_bytes);
  await env.DB.prepare(
    "UPDATE multipart_upload_sessions SET status=?,updated_at=? WHERE id=? AND status NOT IN ('completed','duplicate','aborted')",
  ).bind(status, Date.now(), session.id).run();
}

resumableUploadRoutes.post("/api/upload/:code/multipart", async (c) => {
  const raw = await c.req.json<{
    filename?: string;
    contentType?: string;
    size?: number;
    lastModified?: number;
    fingerprint?: string;
    origin?: UploadOrigin;
    name?: string;
    consent?: string;
    locale?: string;
  }>().catch(() => null);
  if (!raw) return jsonError("Invalid upload request.", 400);
  const origin: UploadOrigin = raw.origin === "official" ? "official" : "guest";
  const context = await authorizeUpload(c, {
    origin,
    name: String(raw.name ?? ""),
    consent: String(raw.consent ?? ""),
  });
  if (context instanceof Response) return context;

  const locale = normalizeLocale(raw.locale ?? context.event.default_locale);
  const filename = String(raw.filename ?? "").trim().slice(0, 240);
  const contentType = inferredContentType(filename, String(raw.contentType ?? ""));
  const size = Math.floor(Number(raw.size));
  const fingerprint = String(raw.fingerprint ?? "").toLowerCase();
  const capturedAtValue = Math.floor(Number(raw.lastModified));
  const capturedAt = Number.isFinite(capturedAtValue)
    && capturedAtValue > 0
    && capturedAtValue <= Date.now() + 86400000
    ? capturedAtValue
    : null;
  const validation = validateUploadFiles([{ name: filename, type: contentType, size }], { resumable: true });
  if (!filename || validation === "empty") return jsonError("Choose a file to upload.", 400);
  if (validation === "unsupported_type" || !ALLOWED_TYPES.has(contentType))
    return jsonError(
      locale === "el"
        ? "Ο τύπος αρχείου δεν υποστηρίζεται."
        : "This file type is not supported.",
      415,
    );
  if (validation === "file_too_large")
    return jsonError(
      locale === "el"
        ? "Το αρχείο ξεπερνά το όριο των 10 GB."
        : "This file exceeds the 10 GB limit.",
      413,
    );
  if (!Number.isSafeInteger(size) || size <= 0 || !/^[a-f0-9]{64}$/.test(fingerprint))
    return jsonError("Invalid file metadata.", 422);

  const uploadLimit = await consumeRateLimit(c.env.DB, c.req.raw, c.env.BETTER_AUTH_SECRET, {
    scope: `resumable-upload:${context.event.code}`,
    limit: MAX_UPLOAD_FILES * 2,
    windowMs: 60 * 60_000,
  });
  if (!uploadLimit.allowed) return tooManyRequests(uploadLimit);

  const existing = await c.env.DB.prepare(
    `SELECT * FROM multipart_upload_sessions
     WHERE event_id=? AND client_fingerprint=? AND size_bytes=? AND content_type=?
       AND origin=? AND status IN ('uploading','completing') AND expires_at>?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(
    context.event.id,
    fingerprint,
    size,
    contentType,
    origin,
    Date.now(),
  ).first<UploadSession>();
  if (existing) {
    const parts = await c.env.DB.prepare(
      "SELECT part_number,etag,size_bytes,client_hash FROM multipart_upload_parts WHERE session_id=? ORDER BY part_number",
    ).bind(existing.id).all<SessionPart>();
    return c.json({
      ok: true,
      resumed: true,
      sessionId: existing.id,
      token: await uploadToken(c.env.BETTER_AUTH_SECRET, existing),
      partSize: existing.part_size,
      totalParts: existing.total_parts,
      uploadedParts: parts.results.map((part) => ({
        partNumber: part.part_number,
        size: part.size_bytes,
        hash: part.client_hash,
      })),
    });
  }

  const active = await c.env.DB.prepare(
    "SELECT COUNT(*) total FROM multipart_upload_sessions WHERE event_id=? AND status IN ('uploading','completing') AND expires_at>?",
  ).bind(context.event.id, Date.now()).first<{ total: number }>();
  if (Number(active?.total ?? 0) >= MAX_UPLOAD_FILES)
    return jsonError("Too many unfinished uploads. Finish or retry the current selection first.", 429);

  const reservation = await reserveStorageForEvent(c.env.DB, context.event.id, size);
  if (!reservation.allowed)
    return jsonError(
      locale === "el" ? "Το όριο χώρου του event συμπληρώθηκε." : "The event storage quota was reached.",
      413,
    );

  const id = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const objectKey = `${context.event.id}/${mediaId}.${safeFileExtension(filename)}`;
  let multipart: R2MultipartUpload | null = null;
  try {
    multipart = await c.env.MEDIA.createMultipartUpload(objectKey, {
      httpMetadata: { contentType, cacheControl: "private, no-store" },
      customMetadata: { eventId: context.event.id, mediaId },
    });
    const now = Date.now();
    const totalParts = Math.ceil(size / MULTIPART_UPLOAD_PART_SIZE);
    await c.env.DB.prepare(
      `INSERT INTO multipart_upload_sessions
       (id,event_id,upload_id,object_key,media_id,file_name,content_type,media_type,size_bytes,
        part_size,total_parts,client_fingerprint,uploaded_by,uploaded_by_user_id,origin,
        reservation_owner_id,upload_consent_at,upload_policy_version,captured_at,status,
        created_at,updated_at,expires_at,completed_at,notified_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'uploading',?,?,?,NULL,NULL)`,
    ).bind(
      id,
      context.event.id,
      multipart.uploadId,
      objectKey,
      mediaId,
      filename,
      contentType,
      contentType.startsWith("image/") ? "image" : "video",
      size,
      MULTIPART_UPLOAD_PART_SIZE,
      totalParts,
      fingerprint,
      context.uploadedBy,
      context.uploader?.id ?? null,
      context.origin,
      reservation.ownerId,
      context.consentAt,
      context.policyVersion,
      capturedAt,
      now,
      now,
      now + MULTIPART_UPLOAD_TTL_MS,
    ).run();
    const session: Pick<UploadSession, "id" | "event_id" | "upload_id"> = {
      id,
      event_id: context.event.id,
      upload_id: multipart.uploadId,
    };
    return c.json({
      ok: true,
      resumed: false,
      sessionId: id,
      token: await uploadToken(c.env.BETTER_AUTH_SECRET, session),
      partSize: MULTIPART_UPLOAD_PART_SIZE,
      totalParts,
      uploadedParts: [],
    }, 201);
  } catch (error) {
    if (multipart) await multipart.abort().catch(() => undefined);
    await releaseStorage(c.env.DB, reservation.ownerId, size);
    if (isTrialMediaLimitConstraint(error))
      return jsonError("This trial event has no remaining media slots.", 409);
    console.error(JSON.stringify({
      event: "multipart_upload_create_failed",
      eventId: context.event.id,
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    }));
    return jsonError("The upload could not be started. Please try again.", 500);
  }
});

resumableUploadRoutes.get("/api/upload/:code/multipart/:sessionId", async (c) => {
  const session = await getSession(c.env.DB, c.req.param("code"), c.req.param("sessionId"));
  if (!session) return jsonError("Upload session not found.", 404);
  if (!(await tokenIsValid(c.env.BETTER_AUTH_SECRET, c.req.raw, session)))
    return jsonError("Invalid upload session.", 401);
  const parts = await c.env.DB.prepare(
    "SELECT part_number,etag,size_bytes,client_hash FROM multipart_upload_parts WHERE session_id=? ORDER BY part_number",
  ).bind(session.id).all<SessionPart>();
  return c.json({
    ok: true,
    status: session.status,
    partSize: session.part_size,
    totalParts: session.total_parts,
    uploadedParts: parts.results.map((part) => ({
      partNumber: part.part_number,
      size: part.size_bytes,
      hash: part.client_hash,
    })),
  });
});

resumableUploadRoutes.put("/api/upload/:code/multipart/:sessionId/parts/:partNumber", async (c) => {
  const session = await getSession(c.env.DB, c.req.param("code"), c.req.param("sessionId"));
  if (!session) return jsonError("Upload session not found.", 404);
  if (!(await tokenIsValid(c.env.BETTER_AUTH_SECRET, c.req.raw, session)))
    return jsonError("Invalid upload session.", 401);
  if (session.status !== "uploading") return jsonError("This upload is no longer accepting parts.", 409);
  if (session.expires_at <= Date.now()) {
    await abortSession(c.env, session);
    return jsonError("This upload session expired. Start it again.", 410);
  }

  const partNumber = Number(c.req.param("partNumber"));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.total_parts)
    return jsonError("Invalid part number.", 422);
  const expectedSize = expectedPartSize(session, partNumber);
  const suppliedLength = Number(c.req.header("Content-Length"));
  if (Number.isFinite(suppliedLength) && suppliedLength > 0 && suppliedLength !== expectedSize)
    return jsonError("The upload part has an invalid size.", 422);
  const clientHash = String(c.req.header("Part-Fingerprint") ?? "").toLowerCase();
  if (clientHash && !/^[a-f0-9]{64}$/.test(clientHash))
    return jsonError("Invalid part fingerprint.", 422);

  const existing = await c.env.DB.prepare(
    "SELECT part_number,etag,size_bytes,client_hash FROM multipart_upload_parts WHERE session_id=? AND part_number=?",
  ).bind(session.id, partNumber).first<SessionPart>();
  if (existing && clientHash && existing.client_hash === clientHash)
    return c.json({ ok: true, partNumber, resumed: true });
  if (!c.req.raw.body) return jsonError("The upload part is empty.", 400);

  try {
    const multipart = c.env.MEDIA.resumeMultipartUpload(session.object_key, session.upload_id);
    const uploaded = await multipart.uploadPart(partNumber, c.req.raw.body);
    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO multipart_upload_parts (session_id,part_number,etag,size_bytes,client_hash,created_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(session_id,part_number) DO UPDATE SET
           etag=excluded.etag,size_bytes=excluded.size_bytes,
           client_hash=excluded.client_hash,created_at=excluded.created_at`,
      ).bind(session.id, partNumber, uploaded.etag, expectedSize, clientHash || null, now),
      c.env.DB.prepare(
        "UPDATE multipart_upload_sessions SET updated_at=?,expires_at=? WHERE id=? AND status='uploading'",
      ).bind(now, now + MULTIPART_UPLOAD_TTL_MS, session.id),
    ]);
    return c.json({ ok: true, partNumber, resumed: false });
  } catch (error) {
    console.error(JSON.stringify({
      event: "multipart_part_failed",
      sessionId: session.id,
      partNumber,
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    }));
    return jsonError("This part could not be uploaded. It is safe to retry.", 500);
  }
});

resumableUploadRoutes.put("/api/upload/:code/multipart/:sessionId/variants/:variant", async (c) => {
  const session = await getSession(c.env.DB, c.req.param("code"), c.req.param("sessionId"));
  if (!session) return jsonError("Upload session not found.", 404);
  if (!(await tokenIsValid(c.env.BETTER_AUTH_SECRET, c.req.raw, session)))
    return jsonError("Invalid upload session.", 401);
  if (session.media_type !== "image" || session.status !== "uploading")
    return jsonError("Image preview upload is not available.", 409);
  const variant = c.req.param("variant");
  if (variant !== "thumb" && variant !== "preview") return jsonError("Invalid image variant.", 422);
  const contentType = c.req.header("Content-Type")?.toLowerCase().split(";", 1)[0];
  const length = Number(c.req.header("Content-Length"));
  if (contentType !== "image/webp" || !Number.isFinite(length) || length <= 0 || length > 12 * 1024 * 1024)
    return jsonError("Invalid image preview.", 422);
  if (!c.req.raw.body) return jsonError("The image preview is empty.", 400);
  await c.env.MEDIA.put(mediaVariantKey(session.object_key, variant as MediaVariant), c.req.raw.body, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "private, max-age=31536000, immutable",
    },
  });
  return c.json({ ok: true });
});

resumableUploadRoutes.post("/api/upload/:code/multipart/:sessionId/complete", async (c) => {
  const session = await getSession(c.env.DB, c.req.param("code"), c.req.param("sessionId"));
  if (!session) return jsonError("Upload session not found.", 404);
  if (!(await tokenIsValid(c.env.BETTER_AUTH_SECRET, c.req.raw, session)))
    return jsonError("Invalid upload session.", 401);
  if (session.status === "completed")
    return c.json({ ok: true, uploaded: 1, duplicate: false, mediaId: session.media_id });
  if (session.status === "duplicate")
    return c.json({ ok: true, uploaded: 0, duplicate: true });
  if (session.status !== "uploading" && session.status !== "completing")
    return jsonError("This upload cannot be completed.", 409);
  const capacity = await eventMediaCapacity(c.env.DB, session.event_id, 0, session.origin === "official");
  if (!capacity.allowed) {
    await abortSession(c.env, session);
    return jsonError(`This trial event reached its ${capacity.access.media_limit}-media limit.`, 409);
  }

  const parts = await c.env.DB.prepare(
    "SELECT part_number,etag,size_bytes,client_hash FROM multipart_upload_parts WHERE session_id=? ORDER BY part_number",
  ).bind(session.id).all<SessionPart>();
  if (parts.results.length !== session.total_parts)
    return jsonError("Some upload parts are still missing.", 409);
  for (let index = 0; index < parts.results.length; index += 1) {
    if (parts.results[index].part_number !== index + 1)
      return jsonError("Some upload parts are still missing.", 409);
  }
  const contentHash = await sha256(
    `memboux-r2-multipart-v1\0${session.size_bytes}\0${session.part_size}\0${parts.results.map((part) => part.etag).join("\0")}`,
  );
  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM media WHERE event_id=? AND deleted_at IS NULL AND reported_at IS NULL AND (content_hash=? OR canonical_hash=?) LIMIT 1",
  ).bind(session.event_id, contentHash, contentHash).first<{ id: string }>();
  if (duplicate) {
    await abortSession(c.env, session);
    await c.env.DB.prepare(
      "UPDATE multipart_upload_sessions SET status='duplicate',completed_at=?,updated_at=? WHERE id=?",
    ).bind(Date.now(), Date.now(), session.id).run();
    return c.json({ ok: true, uploaded: 0, duplicate: true, mediaId: duplicate.id });
  }

  await c.env.DB.prepare(
    "UPDATE multipart_upload_sessions SET status='completing',updated_at=? WHERE id=? AND status='uploading'",
  ).bind(Date.now(), session.id).run();
  let object = await c.env.MEDIA.head(session.object_key);
  if (!object) {
    try {
      object = await c.env.MEDIA.resumeMultipartUpload(session.object_key, session.upload_id).complete(
        parts.results.map((part) => ({ partNumber: part.part_number, etag: part.etag })),
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "multipart_complete_failed",
        sessionId: session.id,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      }));
      return jsonError("The upload could not be finalized. Retrying is safe.", 500);
    }
  }
  if (object.size !== session.size_bytes) {
    await c.env.MEDIA.delete(mediaObjectKeys(session.object_key));
    await releaseStorage(c.env.DB, session.reservation_owner_id, session.size_bytes);
    await c.env.DB.prepare(
      "UPDATE multipart_upload_sessions SET status='failed',updated_at=? WHERE id=?",
    ).bind(Date.now(), session.id).run();
    return jsonError("The completed file size did not match the original.", 422);
  }

  const now = Date.now();
  try {
    const statements = [
      c.env.DB.prepare(
        `INSERT INTO media
         (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,captured_at,
          content_hash,canonical_hash,size_bytes,title,upload_consent_at,upload_policy_version,
          origin,uploaded_by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)`,
      ).bind(
        session.media_id,
        session.event_id,
        session.object_key,
        session.media_type,
        session.content_type,
        session.uploaded_by,
        now,
        session.captured_at,
        contentHash,
        contentHash,
        session.size_bytes,
        session.upload_consent_at,
        session.upload_policy_version,
        session.origin,
        session.uploaded_by_user_id,
      ),
    ];
    if (session.origin === "official" && session.uploaded_by_user_id) {
      statements.push(c.env.DB.prepare(
        "INSERT INTO official_album_items (event_id,media_id,added_by,position,created_at) VALUES (?,?,?,?,?)",
      ).bind(session.event_id, session.media_id, session.uploaded_by_user_id, 0, now));
    }
    statements.push(c.env.DB.prepare(
      "UPDATE multipart_upload_sessions SET status='completed',completed_at=?,updated_at=? WHERE id=?",
    ).bind(now, now, session.id));
    await c.env.DB.batch(statements);
  } catch (error) {
    if (isTrialMediaLimitConstraint(error)) {
      await abortSession(c.env, session);
      return jsonError(`This trial event reached its ${capacity.access.media_limit}-media limit.`, 409);
    }
    if (!isCanonicalDuplicateConstraint(error)) throw error;
    await c.env.MEDIA.delete(mediaObjectKeys(session.object_key));
    await releaseStorage(c.env.DB, session.reservation_owner_id, session.size_bytes);
    await c.env.DB.prepare(
      "UPDATE multipart_upload_sessions SET status='duplicate',completed_at=?,updated_at=? WHERE id=?",
    ).bind(now, now, session.id).run();
    return c.json({ ok: true, uploaded: 0, duplicate: true });
  }
  return c.json({ ok: true, uploaded: 1, duplicate: false, mediaId: session.media_id });
});

resumableUploadRoutes.post("/api/upload/:code/multipart/finalize", async (c) => {
  const raw = await c.req.json<{ sessions?: Array<{ id?: string; token?: string }> }>().catch(() => null);
  const requested = (raw?.sessions ?? []).slice(0, MAX_UPLOAD_FILES);
  if (!requested.length) return c.json({ ok: true, uploaded: 0, duplicates: 0 });
  const completed: UploadSession[] = [];
  let duplicates = 0;
  for (const item of requested) {
    const session = await getSession(c.env.DB, c.req.param("code"), String(item.id ?? ""));
    if (!session || !item.token) continue;
    if (!(await tokenMatches(c.env.BETTER_AUTH_SECRET, String(item.token), session))) continue;
    if (session.status === "duplicate") duplicates += 1;
    if (session.status === "completed" && session.notified_at === null) completed.push(session);
  }
  if (completed.length) {
    const first = completed[0];
    await notifyEventMembersAboutUpload(c.env.DB, {
      eventId: first.event_id,
      actorUserId: first.uploaded_by_user_id,
      actorName: first.uploaded_by,
      itemCount: completed.length,
    });
    const now = Date.now();
    await c.env.DB.batch(completed.map((session) =>
      c.env.DB.prepare(
        "UPDATE multipart_upload_sessions SET notified_at=?,updated_at=? WHERE id=? AND notified_at IS NULL",
      ).bind(now, now, session.id)
    ));
    c.executionCtx.waitUntil(
      queueAutomaticCloudBackupsForEvent(c.env, first.event_id).catch((error) => {
        console.error(JSON.stringify({
          event: "resumable_upload_backup_sync_failed",
          eventId: first.event_id,
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        }));
      }),
    );
  }
  return c.json({ ok: true, uploaded: completed.length, duplicates });
});

resumableUploadRoutes.delete("/api/upload/:code/multipart/:sessionId", async (c) => {
  const session = await getSession(c.env.DB, c.req.param("code"), c.req.param("sessionId"));
  if (!session) return jsonError("Upload session not found.", 404);
  if (!(await tokenIsValid(c.env.BETTER_AUTH_SECRET, c.req.raw, session)))
    return jsonError("Invalid upload session.", 401);
  await abortSession(c.env, session);
  return c.json({ ok: true });
});

export async function reconcileResumableUploads(env: Bindings) {
  const expired = await env.DB.prepare(
    `SELECT * FROM multipart_upload_sessions
     WHERE status IN ('uploading','completing') AND expires_at<=?
     ORDER BY expires_at LIMIT 100`,
  ).bind(Date.now()).all<UploadSession>();
  for (const session of expired.results) await abortSession(env, session);
}
