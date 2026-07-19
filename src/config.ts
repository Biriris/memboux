export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 100;
export const MAX_UPLOAD_TOTAL_SIZE = 100 * 1024 * 1024;
export const MAX_UPLOAD_SELECTION_SIZE = 2 * 1024 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_SIZE = 90 * 1024 * 1024;
export const VIDEO_UPLOADS_ENABLED = false;
export const IMAGE_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const VIDEO_UPLOAD_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
export const ALLOWED_TYPES = new Set<string>([
  ...IMAGE_UPLOAD_TYPES,
  ...(VIDEO_UPLOADS_ENABLED ? VIDEO_UPLOAD_TYPES : []),
]);
export const UPLOAD_ACCEPT = [...ALLOWED_TYPES].join(",");
export const ADMIN_COOKIE = "memboux_admin";
export const TRASH_RETENTION_MS = 30 * 86400000;
