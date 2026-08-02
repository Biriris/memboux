import { describe, expect, it } from "vitest";
import { FAST_UPLOAD_MAX_SIZE, MAX_UPLOAD_BATCH_SIZE, MAX_UPLOAD_FILES, MAX_UPLOAD_SELECTION_SIZE } from "../src/config";
import { additiveFileSelectionScript, multiUploadScript, photoUploadMarkup, uploadLimitsCopy, uploadQueueScript } from "../src/views/upload";

describe("multi-file upload view", () => {
  it("supports one hundred photos or videos and a twenty-gigabyte selection", () => {
    expect(MAX_UPLOAD_FILES).toBe(100);
    expect(MAX_UPLOAD_SELECTION_SIZE).toBe(20 * 1024 * 1024 * 1024);
    expect(FAST_UPLOAD_MAX_SIZE).toBe(20 * 1024 * 1024);
    expect(MAX_UPLOAD_BATCH_SIZE).toBeLessThan(100 * 1024 * 1024);
    expect(uploadLimitsCopy("en")).toContain("Up to 100 photos");
    expect(uploadLimitsCopy("en")).toContain("videos");
    expect(uploadLimitsCopy("en")).toContain("20 GB");
    expect(uploadLimitsCopy("el")).toContain("Έως 100");
    expect(uploadLimitsCopy("el")).toContain("Η μεταφόρτωση συνεχίζεται");
    expect(uploadLimitsCopy("el")).not.toMatch(/\buploads?\b/i);
    expect(uploadLimitsCopy("fr")).toContain("100 photos ou vidéos");
    expect(uploadLimitsCopy("de")).toContain("100 Fotos oder Videos");
    expect(uploadLimitsCopy("es")).toContain("100 fotos o vídeos");
    expect(uploadLimitsCopy("it")).toContain("100 foto o video");
  });

  it("uses localized resumable R2 parts with retry and saved progress", () => {
    for (const [locale, label] of [
      ["en", "Upload complete."],
      ["el", "Η μεταφόρτωση ολοκληρώθηκε."],
      ["fr", "Ajout terminé."],
      ["de", "Upload abgeschlossen."],
      ["es", "Subida completada."],
      ["it", "Caricamento completato."],
    ] as const) {
      const script = multiUploadScript(locale);
      expect(script).toContain(label);
      if (locale === "el") {
        expect(script).not.toContain("Το upload");
        expect(script).not.toContain("Η σύνδεση διακόπηκε. Το upload");
      }
      expect(script).toContain("form[data-multi-upload]");
      expect(script).toContain("Part-Fingerprint");
      expect(script).toContain("totalParts");
      expect(script).toContain("waitForOnline");
      expect(script).toContain("localStorage.setItem");
      expect(script).toContain("'/complete'");
      expect(script).toContain("progressByFile");
      expect(script).toContain("maxFileConcurrency=constrained?2:coarse?4:6");
      expect(script).toContain("Math.min(maxFileConcurrency,files.length)");
      expect(script).toContain("partBytes=await blob.arrayBuffer()");
      expect(script).toContain("body:partBytes");
      expect(script).toContain("file.size<=limits.fastFileBytes");
      expect(script).toContain("endpoint.replace(/\\/multipart$/,'/fast')");
      expect(script).toContain("'Upload-Content-SHA256':contentHash");
      expect(script).not.toContain("imageVariants(file)");
      expect(script).toContain("/variants/thumb");
      expect(script).toContain("videoPoster(file)");
      expect(script).toContain("data-upload-count");
      expect(script).toContain("data-upload-cancel");
      expect(script).toContain("new AbortController()");
      expect(script).toContain("controller.abort()");
      expect(script).toContain("method:'DELETE'");
      expect(script).toContain("completedFiles+' / '+totalFiles");
      expect(script).toContain("if(session.duplicate)");
      expect(script).toContain("beforeunload");
      expect(script).toContain("memboux-upload-return");
      expect(script).toContain("window.location.reload()");
      const source = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it("returns to the refreshed album without rendering a per-file queue", () => {
    for (const locale of ["en", "el", "fr", "de", "es", "it"] as const) {
      const script = uploadQueueScript(locale);
      expect(script).toContain("memboux-upload-return");
      expect(script).toContain("#guest-moments");
      expect(script).not.toContain("data-queue-index");
      expect(script).not.toContain("data-queue-items");
      const source = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it("adds files across repeated picker selections and keeps the selection compact", () => {
    for (const [locale, hint] of [
      ["en", "open the picker again to add more"],
      ["el", "Επίλεξε πολλά αρχεία"],
      ["fr", "rouvrez le sélecteur"],
      ["de", "öffne die Auswahl erneut"],
      ["es", "abre de nuevo el selector"],
      ["it", "riapri la scelta"],
    ] as const) {
      const script = additiveFileSelectionScript(locale);
      expect(script).toContain(hint);
      expect(script).toContain("new DataTransfer()");
      expect(script).toContain("selected.push(file)");
      expect(script).toContain("data-selected-files-count");
      expect(script).toContain("data-clear-selected-files");
      expect(script).not.toContain("data-queue-index");
      expect(script).toContain("memboux:multi-file-selection");
      const source = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
      expect(() => new Function(source)).not.toThrow();
    }
  });

  it("keeps video choices and enables resumable Studio uploads", () => {
    const legacy = '<h2>Upload official media</h2><input accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime">';
    const html = photoUploadMarkup(legacy, "en");
    expect(html).toContain("Upload official media");
    expect(html).toContain("video/mp4");
    const studio = photoUploadMarkup('<form action="/studio/events/ABC123/upload"></form>', "en");
    expect(studio).toContain('data-upload-origin="official"');
    expect(studio).toContain('data-resumable-endpoint="/api/upload/ABC123/multipart"');
    expect(photoUploadMarkup("<p>Select photos.</p>", "fr")).toContain("Sélectionnez des photos ou vidéos.");
  });
});
