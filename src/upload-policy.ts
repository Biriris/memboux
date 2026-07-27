import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  MAX_LEGACY_FILE_SIZE,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_TOTAL_SIZE,
} from "./config";
import type { Locale } from "./i18n";

export type UploadValidationError = "empty" | "too_many" | "unsupported_type" | "file_too_large" | "total_too_large";
export type UploadFileDescriptor = Pick<File, "name" | "size" | "type">;

export function validateUploadFiles(
  files: readonly UploadFileDescriptor[],
  options: { resumable?: boolean } = {},
): UploadValidationError | null {
  if (!files.length) return "empty";
  if (files.length > MAX_UPLOAD_FILES) return "too_many";
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) return "unsupported_type";
  const maxFileSize = options.resumable ? MAX_FILE_SIZE : MAX_LEGACY_FILE_SIZE;
  if (files.some((file) => file.size > maxFileSize)) return "file_too_large";
  if (!options.resumable && files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_TOTAL_SIZE)
    return "total_too_large";
  return null;
}

export function safeFileExtension(filename: string) {
  if (!filename.includes(".")) return "bin";
  const extension = filename.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8);
  return extension || "bin";
}

export function uploadValidationDetails(error: UploadValidationError, locale: Locale) {
  const messages: Record<UploadValidationError, { en: string; el: string; status: number }> = {
    empty: { en: "No photos were selected.", el: "Δεν επιλέχθηκαν φωτογραφίες.", status: 400 },
    too_many: { en: `You can upload up to ${MAX_UPLOAD_FILES} files at once.`, el: `Μπορείς να ανεβάσεις έως ${MAX_UPLOAD_FILES} αρχεία μαζί.`, status: 413 },
    unsupported_type: { en: "Supported formats: JPEG, PNG, WebP, GIF, MP4, WebM, and MOV.", el: "Υποστηρίζονται JPEG, PNG, WebP, GIF, MP4, WebM και MOV.", status: 415 },
    file_too_large: { en: "This file is larger than the allowed limit.", el: "Το αρχείο ξεπερνά το επιτρεπόμενο όριο.", status: 413 },
    total_too_large: { en: "The total legacy upload must be no larger than 100 MB.", el: "Το παλιό upload πρέπει να είναι έως 100 MB συνολικά.", status: 413 },
  };
  const detail = messages[error];
  return { message: locale === "el" ? detail.el : detail.en, status: detail.status };
}
