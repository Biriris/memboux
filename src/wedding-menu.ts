export const WEDDING_MENU_MAX_BYTES = 15 * 1024 * 1024;

const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type WeddingMenuRow = {
  event_id: string;
  object_key: string;
  content_type: string;
  original_filename: string;
  size_bytes: number;
  updated_by: string;
  updated_at: number;
};

export function validateWeddingMenuFile(file: File) {
  const contentType = file.type.toLowerCase();
  const extension = allowedTypes[contentType];
  if (!extension) return { ok: false as const, reason: "type" as const };
  if (file.size < 1 || file.size > WEDDING_MENU_MAX_BYTES) return { ok: false as const, reason: "size" as const };
  return { ok: true as const, contentType, extension };
}

export function weddingMenuBytesMatch(contentType: string, bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
  if (contentType === "image/jpeg") return view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff;
  if (contentType === "image/png") return view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47 && view[4] === 0x0d && view[5] === 0x0a && view[6] === 0x1a && view[7] === 0x0a;
  if (contentType === "image/webp") return String.fromCharCode(...view.slice(0, 4)) === "RIFF" && String.fromCharCode(...view.slice(8, 12)) === "WEBP";
  if (contentType === "application/pdf") return String.fromCharCode(...view.slice(0, 5)) === "%PDF-";
  return false;
}

export function safeWeddingMenuFilename(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[\r\n"\\/]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "wedding-menu").slice(0, 160);
}
