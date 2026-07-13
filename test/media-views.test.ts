import { describe, expect, it } from "vitest";
import type { MediaRow } from "../src/domain";
import { cards, galleryFilterControls, galleryFilterScript, lightboxMarkup } from "../src/views/media";

const media = (overrides: Partial<MediaRow> = {}): MediaRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  event_id: "event-1",
  object_key: "events/event-1/media.jpg",
  media_type: "image",
  content_type: "image/jpeg",
  uploaded_by: "Guest",
  uploaded_at: 1_700_000_000_000,
  captured_at: null,
  content_hash: "hash",
  reported_at: null,
  size_bytes: 1024,
  title: null,
  deleted_at: null,
  purge_at: null,
  ...overrides,
});

describe("media views", () => {
  it("renders image and video cards with media-type metadata", () => {
    const html = cards([
      media(),
      media({ id: "22222222-2222-4222-8222-222222222222", media_type: "video", content_type: "video/mp4" }),
    ], { lightbox: true });

    expect(html).toContain('data-media-type="image"');
    expect(html).toContain('data-media-type="video"');
    expect(html).toContain('data-type="image"');
    expect(html).toContain('data-type="video"');
  });

  it("renders deferred full-card selection and download metadata", () => {
    const html = cards([media()], { selectable: true, deferredSelection: true });

    expect(html).toContain("media-selector");
    expect(html).toContain("media-select sr-only");
    expect(html).toContain("?download=1");
  });

  it("shows localized filter labels with accurate counts", () => {
    const items = [media(), media({ id: "video", media_type: "video", content_type: "video/mp4" })];

    expect(galleryFilterControls(items, "owner", "el")).toContain("Εικόνες (1)");
    expect(galleryFilterControls(items, "guest", "en")).toContain("Images (1)");
    expect(galleryFilterControls(items, "guest", "en")).toContain("Videos (1)");
    expect(galleryFilterScript(items, "guest")).toContain("apply('image')");
  });

  it("keeps keyboard, backdrop close, and touch-following swipe behavior", () => {
    const html = lightboxMarkup("en");

    expect(html).toContain("touchmove");
    expect(html).toContain("translateX('+dx+'px)");
    expect(html).toContain("if(e.target===dialog||e.target===stage)dialog.close()");
    expect(html).toContain("ArrowLeft");
    expect(html).toContain("ArrowRight");
  });
});
