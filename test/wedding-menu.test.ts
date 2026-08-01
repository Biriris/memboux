import { describe, expect, it } from "vitest";
import { safeWeddingMenuFilename, validateWeddingMenuFile, weddingMenuBytesMatch } from "../src/wedding-menu";
import { groupWeddingMenuCourses, type WeddingMenuCourseRow } from "../src/wedding-menu-courses";

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

  it("keeps populated menu categories in the canonical reception order", () => {
    const course = (id: string, courseType: WeddingMenuCourseRow["course_type"], sortOrder: number): WeddingMenuCourseRow => ({
      id,
      event_id: "event-1",
      course_type: courseType,
      title: `${courseType} title`,
      description: `${courseType} description`,
      sort_order: sortOrder,
      created_at: 1,
      updated_at: 1,
    });
    const groups = groupWeddingMenuCourses([
      course("drink", "drinks", 0),
      course("starter-b", "starter", 8),
      course("welcome", "welcome", 99),
      course("starter-a", "starter", 2),
    ]);

    expect(groups.map((group) => group.type)).toEqual(["welcome", "starter", "drinks"]);
    expect(groups[1].courses.map((item) => item.id)).toEqual(["starter-a", "starter-b"]);
    expect(groups.some((group) => group.type === "dessert")).toBe(false);
  });
});
