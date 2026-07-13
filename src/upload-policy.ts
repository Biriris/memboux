import { ALLOWED_TYPES, MAX_FILE_SIZE, MAX_UPLOAD_FILES, MAX_UPLOAD_TOTAL_SIZE } from "./config";
import type { Locale } from "./i18n";

export type UploadValidationError = "empty" | "too_many" | "unsupported_type" | "file_too_large" | "total_too_large";
export type UploadFileDescriptor = Pick<File, "name" | "size" | "type">;

export function validateUploadFiles(files: readonly UploadFileDescriptor[]): UploadValidationError | null {
  if (!files.length) return "empty";
  if (files.length > MAX_UPLOAD_FILES) return "too_many";
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) return "unsupported_type";
  if (files.some((file) => file.size > MAX_FILE_SIZE)) return "file_too_large";
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_TOTAL_SIZE) return "total_too_large";
  return null;
}

export function safeFileExtension(filename: string) {
  if (!filename.includes(".")) return "bin";
  const extension = filename.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8);
  return extension || "bin";
}

export function uploadValidationDetails(error: UploadValidationError, locale: Locale) {
  const messages: Record<UploadValidationError, { en: string; el: string; status: number }> = {
    empty: { en: "No files were selected.", el: "Δεν επιλέχθηκαν αρχεία.", status: 400 },
    too_many: { en: `You can upload up to ${MAX_UPLOAD_FILES} files at once.`, el: `Μπορείς να ανεβάσεις έως ${MAX_UPLOAD_FILES} αρχεία μαζί.`, status: 413 },
    unsupported_type: { en: "One or more files have an unsupported type.", el: "Κάποιο αρχείο έχει μη υποστηριζόμενο τύπο.", status: 415 },
    file_too_large: { en: "Each file must be no larger than 50 MB.", el: "Κάθε αρχείο πρέπει να είναι έως 50 MB.", status: 413 },
    total_too_large: { en: "The total selection must be no larger than 95 MB.", el: "Η συνολική επιλογή πρέπει να είναι έως 95 MB.", status: 413 },
  };
  const detail = messages[error];
  return { message: detail[locale], status: detail.status };
}
