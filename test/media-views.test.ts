import { describe, expect, it } from "vitest";
import type { MediaRow } from "../src/domain";
import { brickwallScript, bulkSelectionScript, cards, galleryFilterControls, galleryFilterScript, galleryProgressiveControls, galleryProgressiveScript, lightboxMarkup, mediaLikesScript, mediaUploaderOverlay } from "../src/views/media";

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
  origin: "guest",
  uploaded_by_user_id: null,
  reported_at: null,
  size_bytes: 1024,
  title: null,
  deleted_at: null,
  purge_at: null,
  ...overrides,
});

describe("media views", () => {
  it("uses lightweight previews while preserving original download URLs", () => {
    const item = media();
    const html = cards([item], { lightbox: true, selectable: true, deferredSelection: true });
    expect(html).toContain(`/media/${item.id}?variant=thumb`);
    expect(html).toContain(`/media/${item.id}?variant=preview`);
    expect(html).toContain(`data-full="/media/${item.id}"`);
    expect(html).toContain(`data-original="/media/${item.id}?download=1"`);
    expect(html).toContain(`data-download="/media/${item.id}?download=1"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("memboux-media-card");
    expect(html).toContain("h-auto w-full object-contain");
    expect(html).not.toContain("aspect-square");
    expect(html).not.toContain("object-cover");
  });

  it("renders image and video cards with media-type metadata", () => {
    const html = cards([
      media(),
      media({ id: "22222222-2222-4222-8222-222222222222", media_type: "video", content_type: "video/mp4" }),
    ], { lightbox: true });

    expect(html).toContain('data-media-type="image"');
    expect(html).toContain('data-media-type="video"');
    expect(html).toContain('data-type="image"');
    expect(html).toContain('data-type="video"');
    expect(html).toContain('data-media-uploaded="1700000000000"');
    expect(html).toContain('data-media-rating="0"');
  });

  it("renders deferred full-card selection and download metadata", () => {
    const html = cards([media()], { selectable: true, deferredSelection: true });

    expect(html).toContain("media-selector");
    expect(html).toContain("media-select sr-only");
    expect(html).toContain("?download=1");
  });

  it("renders persisted photo likes on cards and in the lightbox", () => {
    const html = cards([{ ...media(), like_count: 7, viewer_liked: 1 }], {
      lightbox: true,
      likes: true,
      locale: "en",
    });
    const video = cards([{ ...media(), media_type: "video", like_count: 3 }], { likes: true });

    expect(html).toContain("data-media-like");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("data-like-count>7</span>");
    expect(html).toContain('data-liked="true"');
    expect(video).not.toContain("data-media-like");
    expect(lightboxMarkup("en", true)).toContain('id="lightbox-like"');
    expect(mediaLikesScript("ABC123", "en")).toContain("/api/gallery/ABC123/media/");
  });

  it("renders an executable, guarded bulk-selection script", () => {
    const html = bulkSelectionScript({
      selectButtonId: "select-media",
      cardSelector: ".selectable-media",
      selectorSelector: ".media-selector",
      checkboxSelector: ".media-select",
      tickSelector: ".selection-tick",
      selectText: "Select",
      cancelText: "Cancel",
      actions: [{ buttonId: "download-selected", label: "Download selected", kind: "download" }],
    });

    expect(html.endsWith("</script>")).toBe(true);
    expect(html).toContain("if(!selectButton)return");
    expect(html).toContain("aria-selected");
    expect(html).toContain("navigator.canShare");
    expect(html).toContain("form.requestSubmit?form.requestSubmit():form.submit()");
    expect(html).toContain("[data-media-like]");
  });

  it("shows a separate localized photo count and keeps sorting", () => {
    const items = [media(), media({ id: "video", media_type: "video", content_type: "video/mp4" })];

    const greek = galleryFilterControls(items, "owner", "el");
    const english = galleryFilterControls(items, "guest", "en");
    const script = galleryFilterScript(items, "guest");
    expect(greek).toContain("1 φωτογραφία");
    expect(english).toContain("1 photo");
    expect(english).toContain('data-gallery-photo-count="1"');
    expect(english).not.toContain("All");
    expect(english).not.toContain("Photos");
    expect(english).not.toContain("Videos");
    expect(english).not.toContain("data-gallery-filter");
    expect(english).toContain('data-gallery-sort="guest"');
    expect(english).toContain("Most liked");
    expect(script).toContain("mediaRating");
    expect(script).toContain("mediaUploaded");
    expect(script).not.toContain("type='all'");
    expect(script).not.toContain("aria-pressed");
  });

  it("uses a compact counter instead of gallery type tabs", () => {
    const html = galleryFilterControls([media()], "photos-only", "en");

    expect(html).toContain("1 photo");
    expect(html).toContain('data-gallery-photo-count="1"');
    expect(html).not.toContain("data-gallery-filter");
    expect(html).toContain('data-gallery-sort="photos-only"');
  });

  it("defers gallery media beyond the first page and reveals it in batches", () => {
    const items = Array.from({ length: 14 }, (_, index) => media({ id: `photo-${index}` }));
    const html = cards(items, { lightbox: true, deferAfter: 12 });
    const controls = galleryProgressiveControls(items.length, "guest-gallery", "en");
    const script = galleryProgressiveScript("guest-gallery");

    expect(html.match(/data-gallery-deferred="true"/g)).toHaveLength(2);
    expect(html).toContain('data-deferred-src="/media/photo-12?variant=thumb"');
    expect(html).not.toContain('<img src="/media/photo-12?variant=thumb"');
    expect(controls).toContain('data-gallery-more="guest-gallery"');
    expect(controls).toContain("2 remaining");
    expect(script).toContain("data-deferred-src");
    expect(script).toContain("memboux:gallery-sorted");
    expect(script).toContain("visible+=12");
  });

  it("offers the owner a per-photo cover control", () => {
    const inactive = cards([media()], {
      lightbox: true,
      coverControl: { eventCode: "ABC123", locale: "en", activeMediaId: null },
    });
    const active = cards([media()], {
      lightbox: true,
      coverControl: { eventCode: "ABC123", locale: "en", activeMediaId: media().id },
    });

    expect(inactive).toContain("data-media-cover");
    expect(inactive).toContain('/api/account/events/ABC123/cover');
    expect(inactive).toContain('name="mediaId"');
    expect(inactive).toContain("Set as cover");
    expect(inactive).toContain("absolute right-2 top-2");
    expect(active).toContain('aria-pressed="true"');
    expect(active).toContain("Album cover");
    expect(cards([media()], { lightbox: true })).not.toContain("data-media-cover");
  });

  it("keeps reactions interactive in an authenticated lightbox", () => {
    const html = cards([{ ...media(), like_count: 12, viewer_liked: 0 }], { lightbox: true });
    expect(html).toContain("data-media-like");
    expect(html).toContain("data-like-count>12</span>");
  });

  it("shows the uploader on gallery cards and in the open-photo overlay", () => {
    const html = cards([media({ uploaded_by: "Nina Guest" })], { lightbox: true });
    expect(html).toContain("Nina Guest");
    expect(html).toContain('data-uploader="Nina Guest"');
    expect(mediaUploaderOverlay("en")).toContain("Uploaded by");
    expect(mediaUploaderOverlay("en")).toContain("lightbox-uploader");
  });

  it("keeps keyboard, backdrop close, and touch-following swipe behavior", () => {
    const html = lightboxMarkup("en");

    expect(html).toContain("touchmove");
    expect(html).toContain("translateX('+dx+'px)");
    expect(html).toContain("native-save-image");
    expect(html).toContain('draggable="true"');
    expect(html).toContain("if(e.target===dialog||e.target===stage)dialog.close()");
    expect(html).toContain("ArrowLeft");
    expect(html).toContain("ArrowRight");
  });

  it("likes an open photo with a mobile double tap", () => {
    const html = lightboxMarkup("en", true);

    expect(html).toContain('id="lightbox-double-heart"');
    expect(html).toContain("now-lastTapAt<340");
    expect(html).toContain("item.dataset.liked!=='true'");
    expect(html).toContain("likeButton.click()");
    expect(html).toContain("lightbox-heart-pop");
    expect(html).toContain("{passive:false}");
    expect(html).toContain("full=item.dataset.full||src");
    expect(html).toContain("visibleImage.dataset.fullResolution='true'");
  });

  it("packs cards into a responsive two-column brickwall", () => {
    const html = brickwallScript();

    expect(html).toContain("__membouxBrickwall");
    expect(html).toContain("getComputedStyle(grid).columnGap");
    expect(html).toContain("columnWidth=(width-gap)/2");
    expect(html).toContain("heights[0]<=heights[1]?0:1");
    expect(html).toContain("translate3d(");
    expect(html).toContain("ResizeObserver");
    expect(html).toContain("MutationObserver");
    expect(html).toContain("brickwallReady='true'");
  });
});
