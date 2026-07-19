import { describe, expect, it } from "vitest";
import { safeWeddingMenuFilename, validateWeddingMenuFile, weddingMenuBytesMatch } from "../src/wedding-menu";

describe("wedding menu uploads", () => {
  it("accepts bounded images and PDFs", () => {
    expect(validateWeddingMenuFile(new File([new Uint8Array([0xff, 0xd8, 0xff])], "menu.jpg", { type: "image/jpeg" }))).toMatchObject({ ok: true, extension: "jpg" });
    expect(validateWeddingMenuFile(new File(["<svg></svg>"], "menu.svg", { type: "image/svg+xml" }))).toEqual({ ok: false, reason: "type" });
  });

  it("checks signatures instead of trusting the browser MIME type", () => {
    expect(weddingMenuBytesMatch("application/pdf", new TextEncoder().encode("%PDF-1.7").buffer)).toBe(true);
    expect(weddingMenuBytesMatch("application/pdf", new TextEncoder().encode("not a pdf").buffer)).toBe(false);
  });

  it("sanitizes filenames used in response metadata", () => {
    expect(safeWeddingMenuFilename(' dinner\r\n"menu.pdf ')).toBe("dinner menu.pdf");
  });
});
