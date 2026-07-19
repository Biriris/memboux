import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BATCH_SIZE, MAX_UPLOAD_FILES, MAX_UPLOAD_SELECTION_SIZE } from "../src/config";
import { multiUploadScript, photoUploadMarkup, uploadLimitsCopy } from "../src/views/upload";

describe("multi-file upload view", () => {
  it("supports one hundred photos and a two-gigabyte browser selection", () => {
    expect(MAX_UPLOAD_FILES).toBe(100);
    expect(MAX_UPLOAD_SELECTION_SIZE).toBe(2 * 1024 * 1024 * 1024);
    expect(MAX_UPLOAD_BATCH_SIZE).toBeLessThan(100 * 1024 * 1024);
    expect(uploadLimitsCopy("en")).toContain("Up to 100 photos");
    expect(uploadLimitsCopy("en")).not.toContain("video");
    expect(uploadLimitsCopy("en")).toContain("2 GB");
    expect(uploadLimitsCopy("el")).toContain("Έως 100");
  });

  it("splits the selection and uploads batches sequentially", () => {
    const script = multiUploadScript("en");
    expect(script).toContain("form[data-multi-upload]");
    expect(script).toContain("bytes+file.size>limits.batchBytes");
    expect(script).toContain("for(let index=0;index<batches.length;index++)");
    expect(script).toContain("headers:{Accept:'application/json'}");
    expect(script).toContain("window.location.reload()");
  });

  it("removes video choices from legacy admin and Studio upload markup", () => {
    const legacy = '<h2>Upload official media</h2><input accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime">';
    const html = photoUploadMarkup(legacy, "en");
    expect(html).toContain("Upload official photos");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/gif"');
    expect(html).not.toContain("video/mp4");
  });
});
