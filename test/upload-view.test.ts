import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BATCH_SIZE, MAX_UPLOAD_FILES, MAX_UPLOAD_SELECTION_SIZE } from "../src/config";
import { multiUploadScript, photoUploadMarkup, uploadLimitsCopy } from "../src/views/upload";

describe("multi-file upload view", () => {
  it("supports one hundred photos or videos and a twenty-gigabyte selection", () => {
    expect(MAX_UPLOAD_FILES).toBe(100);
    expect(MAX_UPLOAD_SELECTION_SIZE).toBe(20 * 1024 * 1024 * 1024);
    expect(MAX_UPLOAD_BATCH_SIZE).toBeLessThan(100 * 1024 * 1024);
    expect(uploadLimitsCopy("en")).toContain("Up to 100 photos");
    expect(uploadLimitsCopy("en")).toContain("videos");
    expect(uploadLimitsCopy("en")).toContain("20 GB");
    expect(uploadLimitsCopy("el")).toContain("Έως 100");
  });

  it("uses resumable R2 parts with retry and saved progress", () => {
    const script = multiUploadScript("en");
    expect(script).toContain("form[data-multi-upload]");
    expect(script).toContain("Part-Fingerprint");
    expect(script).toContain("totalParts");
    expect(script).toContain("waitForOnline");
    expect(script).toContain("localStorage.setItem");
    expect(script).toContain("'/complete'");
    expect(script).toContain("window.location.reload()");
    const source = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
    expect(() => new Function(source)).not.toThrow();
  });

  it("keeps video choices and enables resumable Studio uploads", () => {
    const legacy = '<h2>Upload official media</h2><input accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime">';
    const html = photoUploadMarkup(legacy, "en");
    expect(html).toContain("Upload official media");
    expect(html).toContain("video/mp4");
    const studio = photoUploadMarkup('<form action="/studio/events/ABC123/upload"></form>', "en");
    expect(studio).toContain('data-upload-origin="official"');
    expect(studio).toContain('data-resumable-endpoint="/api/upload/ABC123/multipart"');
  });
});
