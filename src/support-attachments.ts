import type { Bindings } from "./domain";

const MAX_ATTACHMENTS = 8;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export type SupportAttachmentInput = {
  filename?: string | null;
  mimeType?: string | null;
  disposition?: "attachment" | "inline" | null;
  related?: boolean;
  content: ArrayBuffer | Uint8Array | string;
};

export type PreparedSupportAttachment = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export type StoredSupportAttachment = {
  id: string;
  conversationId: string;
  messageId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
};

export type SupportAttachmentRow = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
};

export function safeSupportFilename(value: string | null | undefined, contentType = "") {
  const fallback = contentType === "application/pdf" ? "attachment.pdf" : "attachment";
  const filename = String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return filename || fallback;
}

function contentBytes(content: SupportAttachmentInput["content"]) {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function hasExpectedSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png")
    return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (contentType === "image/gif")
    return bytes.length >= 6 && new TextDecoder().decode(bytes.subarray(0, 6)).match(/^GIF8[79]a$/) !== null;
  if (contentType === "image/webp")
    return bytes.length >= 12
      && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  if (contentType === "application/pdf")
    return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  return false;
}

export function prepareSupportAttachments(inputs: SupportAttachmentInput[] = []) {
  const accepted: PreparedSupportAttachment[] = [];
  let skipped = 0;
  let totalBytes = 0;
  for (const input of inputs) {
    const contentType = String(input.mimeType ?? "").toLowerCase().split(";", 1)[0].trim();
    const bytes = contentBytes(input.content);
    const eligible = !input.related
      && ALLOWED_CONTENT_TYPES.has(contentType)
      && bytes.byteLength > 0
      && hasExpectedSignature(contentType, bytes)
      && accepted.length < MAX_ATTACHMENTS
      && totalBytes + bytes.byteLength <= MAX_TOTAL_BYTES;
    if (!eligible) {
      skipped++;
      continue;
    }
    accepted.push({
      filename: safeSupportFilename(input.filename, contentType),
      contentType,
      bytes,
    });
    totalBytes += bytes.byteLength;
  }
  return { accepted, skipped, totalBytes };
}

export function inboundAttachmentSummary(imported: number, skipped: number) {
  const lines: string[] = [];
  if (imported)
    lines.push(`[${imported} attachment${imported === 1 ? "" : "s"} added securely to this ticket.]`);
  if (skipped)
    lines.push(`[${skipped} unsupported, embedded, or oversized attachment${skipped === 1 ? "" : "s"} skipped.]`);
  return lines.join("\n");
}

export async function storeSupportAttachments(
  env: Pick<Bindings, "MEDIA">,
  conversationId: string,
  messageId: string,
  attachments: PreparedSupportAttachment[],
  createdAt: number,
) {
  const stored: StoredSupportAttachment[] = [];
  try {
    for (const attachment of attachments) {
      const id = crypto.randomUUID();
      const objectKey = `support-attachments/${conversationId}/${messageId}/${id}`;
      await env.MEDIA.put(objectKey, attachment.bytes, {
        httpMetadata: {
          contentType: attachment.contentType,
          contentDisposition: `attachment; filename="${safeSupportFilename(attachment.filename).replace(/["\\]/g, "_")}"`,
        },
        customMetadata: {
          conversationId,
          messageId,
        },
      });
      stored.push({
        id,
        conversationId,
        messageId,
        objectKey,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.bytes.byteLength,
        createdAt,
      });
    }
    return stored;
  } catch (error) {
    await deleteStoredSupportAttachments(env, stored).catch(() => undefined);
    throw error;
  }
}

export function supportAttachmentInsertStatements(db: D1Database, rows: StoredSupportAttachment[]) {
  return rows.map((row) => db.prepare(
    `INSERT INTO support_attachments
     (id,conversation_id,message_id,object_key,filename,content_type,size_bytes,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(
    row.id,
    row.conversationId,
    row.messageId,
    row.objectKey,
    row.filename,
    row.contentType,
    row.sizeBytes,
    row.createdAt,
  ));
}

export async function deleteStoredSupportAttachments(
  env: Pick<Bindings, "MEDIA">,
  rows: Array<Pick<StoredSupportAttachment, "objectKey">>,
) {
  if (rows.length) await env.MEDIA.delete(rows.map((row) => row.objectKey));
}

export function supportAttachmentContentDisposition(filename: string) {
  const safe = safeSupportFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
