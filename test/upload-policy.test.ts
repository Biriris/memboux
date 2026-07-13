import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE, MAX_UPLOAD_FILES, MAX_UPLOAD_TOTAL_SIZE } from "../src/config";
import { safeFileExtension, uploadValidationDetails, validateUploadFiles, type UploadFileDescriptor } from "../src/upload-policy";

const file = (overrides: Partial<UploadFileDescriptor> = {}): UploadFileDescriptor => ({
  name: "photo.jpg",
  type: "image/jpeg",
  size: 1_024,
  ...overrides,
});

describe("upload validation", () => {
  it("accepts all supported image and video MIME types", () => {
    const supported = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
    expect(validateUploadFiles(supported.map((type) => file({ type })))).toBeNull();
  });

  it("rejects empty selections and unsupported MIME types", () => {
    expect(validateUploadFiles([])).toBe("empty");
    expect(validateUploadFiles([file({ type: "image/svg+xml" })])).toBe("unsupported_type");
    expect(validateUploadFiles([file({ type: "application/x-msdownload" })])).toBe("unsupported_type");
  });

  it("enforces the number of files at the exact boundary", () => {
    expect(validateUploadFiles(Array.from({ length: MAX_UPLOAD_FILES }, () => file()))).toBeNull();
    expect(validateUploadFiles(Array.from({ length: MAX_UPLOAD_FILES + 1 }, () => file()))).toBe("too_many");
  });

  it("enforces per-file and total byte limits at exact boundaries", () => {
    expect(validateUploadFiles([file({ size: MAX_FILE_SIZE })])).toBeNull();
    expect(validateUploadFiles([file({ size: MAX_FILE_SIZE + 1 })])).toBe("file_too_large");
    const maximumSelection = Array.from({ length: MAX_UPLOAD_TOTAL_SIZE / MAX_FILE_SIZE }, () => file({ size: MAX_FILE_SIZE }));
    expect(validateUploadFiles(maximumSelection)).toBeNull();
    expect(validateUploadFiles([...maximumSelection, file({ size: 1 })])).toBe("total_too_large");
  });

  it("returns localized errors with their HTTP status", () => {
    expect(uploadValidationDetails("unsupported_type", "en")).toEqual({
      message: "One or more files have an unsupported type.", status: 415,
    });
    expect(uploadValidationDetails("too_many", "el")).toEqual({
      message: `Μπορείς να ανεβάσεις έως ${MAX_UPLOAD_FILES} αρχεία μαζί.`, status: 413,
    });
  });
});

describe("safe file extensions", () => {
  it("normalizes safe extensions and strips path or punctuation characters", () => {
    expect(safeFileExtension("PHOTO.JPEG")).toBe("jpeg");
    expect(safeFileExtension("holiday.final.jp*g")).toBe("jpg");
    expect(safeFileExtension("archive.verylongextension")).toBe("verylong");
  });

  it("falls back to bin when no safe extension exists", () => {
    expect(safeFileExtension("filename")).toBe("bin");
    expect(safeFileExtension("filename.***")).toBe("bin");
  });
});
