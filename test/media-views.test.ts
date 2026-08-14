import { describe, expect, it } from "vitest";
import type { MediaRow } from "../src/domain";
import { brickwallScript, bulkSelectionScript, cards, galleryFilterControls, galleryFilterScript, galleryProgressiveControls, galleryProgressiveScript, lightboxMarkup, mediaLikesScript, mediaPreviewFallbackScript, mediaUploaderOverlay } from "../src/views/media";

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
    expect(html).toContain(`data-media-fallback="/media/${item.id}"`);
    expect(html).toContain(`/media/${item.id}?variant=preview`);
    expect(html).toContain(`data-full="/media/${item.id}"`);
    expect(html).toContain(`data-original="/media/${item.id}?download=1"`);
    expect(html).toContain(`data-download="/media/${item.id}?download=1"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("memboux-media-card");
    expect(html).toContain("memboux-media-preview");
    expect(html).toContain('style="aspect-ratio:4/5"');
    expect(html).toContain("absolute inset-0 block h-full w-full object-cover");
    expect(html).not.toContain("aspect-square");
  });

  it("retries a broken thumbnail with the protected media route before showing a clean placeholder", () => {
    const script = mediaPreviewFallbackScript("en");
    expect(script).toContain("dataset.mediaFallback");
    expect(script).toContain("fallbackTried");
    expect(script).toContain("Preview unavailable");
    expect(script).toContain("dataset.mediaUnavailable");
    const source = script.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(() => new Function(source)).not.toThrow();
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
    expect(html).toContain('poster="/media/22222222-2222-4222-8222-222222222222?variant=thumb"');
    expect(html.match(/class="memboux-media-preview/g)).toHaveLength(2);
    expect(html.match(/style="aspect-ratio:4\/5"/g)).toHaveLength(2);
    expect(html.match(/class="absolute inset-0 block h-full w-full object-cover"/g)).toHaveLength(2);
    expect(html).not.toContain('class="block h-auto min-h-36 w-full object-contain"');
    expect(html).toContain("VIDEO</span>");
    expect(html).toContain("#t=0.1");
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
    expect(html).toContain("[data-media-cover],[data-media-trash]");
  });

  it("shows a separate localized photo count and keeps sorting", () => {
    const items = [media(), media({ id: "video", media_type: "video", content_type: "video/mp4" })];

    const greek = galleryFilterControls(items, "owner", "el");
    const english = galleryFilterControls(items, "guest", "en");
    const script = galleryFilterScript(items, "guest");
    expect(greek).toContain("1 φωτογραφία");
    expect(greek).toContain("1 βίντεο");
    expect(greek).toContain("Πιο πρόσφατα");
    expect(greek).toContain("Παλαιότερα");
    expect(greek).not.toMatch(/\buploads?\b/i);
    expect(english).toContain("1 photo");
    expect(english).toContain("1 video");
    expect(english).toContain('data-gallery-photo-count="1"');
    expect(english).not.toContain("All");
    expect(english).not.toContain("Photos");
    expect(english).toContain('data-gallery-video-count="1"');
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
    expect(html.match(/style="display:none"/g)).toHaveLength(2);
    expect(html).toContain('data-deferred-src="/media/photo-12?variant=thumb"');
    expect(html).not.toContain('<img src="/media/photo-12?variant=thumb"');
    expect(controls).toContain('data-gallery-more="guest-gallery"');
    expect(controls).toContain("2 remaining");
    expect(script).toContain("data-deferred-src");
    expect(script).toContain("card.style.display=show?'':'none'");
    expect(script).toContain("memboux:gallery-sorted");
    expect(script).toContain("visible+=12");
  });

  it("supports remote gallery pages and dynamically appended lightbox items", () => {
    const controls = galleryProgressiveControls(75, "remote-gallery", "en", 24, "/api/gallery/ABC123/media-page?lang=en");
    const script = galleryProgressiveScript("remote-gallery", 24, 24);
    const lightbox = lightboxMarkup("en", true);

    expect(controls).toContain('data-gallery-endpoint="/api/gallery/ABC123/media-page?lang=en"');
    expect(controls).toContain('data-gallery-offset="24"');
    expect(controls).toContain("51 remaining");
    expect(script).toContain("fetch(url");
    expect(script).toContain("grid.append(template.content)");
    expect(script).toContain("memboux:gallery-appended");
    expect(lightbox).toContain("const items=()=>[...document.querySelectorAll('.lightbox-item')]");
    expect(lightbox).toContain("event.target.closest?.('.lightbox-item')");
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
    expect(inactive).toContain("h-9 w-9");
    expect(inactive).toContain("sm:w-auto");
    expect(active).toContain('aria-pressed="true"');
    expect(active).toContain("Album cover");
    expect(cards([media()], { lightbox: true })).not.toContain("data-media-cover");
  });

  it("offers a compact per-card trash action only when requested", () => {
    const managed = cards([media()], {
      lightbox: true,
      trashControl: { eventCode: "ABC123", locale: "el" },
    });

    expect(managed).toContain("data-media-trash");
    expect(managed).toContain("/api/account/events/ABC123/media/11111111-1111-4111-8111-111111111111/trash");
    expect(managed).toContain("Μεταφορά στον κάδο");
    expect(managed).toContain("absolute bottom-2 left-2");
    expect(cards([media()], { lightbox: true })).not.toContain("data-media-trash");
  });

  it("keeps reactions interactive in an authenticated lightbox", () => {
    const html = cards([{ ...media(), like_count: 12, viewer_liked: 0 }], { lightbox: true });
    expect(html).toContain("data-media-like");
    expect(html).toContain("data-like-count>12</span>");
  });

  it("renders a direct tile download only when the resolved policy allows it", () => {
    const denied = cards([media()], { lightbox: true, downloads: false });
    const allowed = cards([media()], { lightbox: true, downloads: true });
    expect(denied).not.toContain("data-direct-media-download");
    expect(allowed).toContain("data-direct-media-download");
    expect(allowed).toContain("?download=1");
  });

  it("localizes media interactions and lightbox controls in every supported language", () => {
    for (const [locale, expected] of [
      ["en", ["Like photo", "Report", "Uploaded by", "Download original", "Previous"]],
      ["el", ["Βάλε καρδιά", "Αναφορά", "Ανέβηκε από", "Λήψη πρωτότυπου", "Προηγούμενο"]],
      ["fr", ["Aimer la photo", "Signaler", "Ajouté par", "Télécharger l’original", "Précédent"]],
      ["de", ["Foto liken", "Melden", "Hochgeladen von", "Original herunterladen", "Zurück"]],
      ["es", ["Dar me gusta", "Denunciar", "Subido por", "Descargar original", "Anterior"]],
      ["it", ["Metti Mi piace", "Segnala", "Caricato da", "Scarica originale", "Precedente"]],
    ] as const) {
      const cardHtml = cards([{ ...media(), like_count: 2, viewer_liked: 0 }], {
        lightbox: true,
        likes: true,
        selectable: true,
        reportCode: "ABC123",
        locale,
      });
      const lightbox = lightboxMarkup(locale, true);
      expect(cardHtml).toContain(expected[0]);
      expect(cardHtml).not.toContain(`>${expected[1]}<`);
      expect(mediaUploaderOverlay(locale)).toContain(expected[1]);
      expect(cardHtml).toContain('aria-label="');
      expect(mediaUploaderOverlay(locale)).toContain(expected[2]);
      expect(lightbox).toContain(expected[3]);
      expect(lightbox).toContain(`aria-label="${expected[4]}"`);
      expect(mediaLikesScript("ABC123", locale)).toContain(expected[0]);
      if (locale === "el") {
        expect(lightbox).not.toContain("Λήψη original");
        expect(lightbox).not.toContain("Τα original");
      }
      const sources = [...lightbox.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
      expect(sources.length).toBeGreaterThan(1);
      for (const source of sources) expect(() => new Function(source)).not.toThrow();
    }
  });

  it("keeps uploader identity and reporting inside the open-photo overlay", () => {
    const html = cards([media({ uploaded_by: "Nina Guest" })], { lightbox: true });
    expect(html).toContain('data-uploader="Nina Guest"');
    expect(html.match(/Nina Guest/g)).toHaveLength(1);
    expect(mediaUploaderOverlay("en")).toContain("Uploaded by");
    expect(mediaUploaderOverlay("en")).toContain("lightbox-uploader");
    expect(mediaUploaderOverlay("en")).toContain("lightbox-report");
  });

  it("keeps keyboard, backdrop close, and touch-following swipe behavior", () => {
    const html = lightboxMarkup("en");

    expect(html).toContain("touchmove");
    expect(html).toContain("translateX('+dx+'px)");
    expect(html).toContain("native-save-image");
    expect(html).toContain("image.draggable=false");
    expect(html).toContain('id="lightbox-zoom-controls"');
    expect(html).toContain('id="lightbox-close"');
    expect(html).toContain("closeButton?.addEventListener('click',()=>dialog.close())");
    expect(html).toContain("touchDistance(event.touches)");
    expect(html).toContain("setZoom(pinchZoom");
    expect(html).toContain("fallbackTried");
    expect(html).toContain("if(event.target===dialog||event.target===stage)dialog.close()");
    expect(html).toContain("ArrowLeft");
    expect(html).toContain("ArrowRight");
    expect(html).toContain("dialog.addEventListener('close',stopPlayback)");
    expect(html).toContain("media.pause()");
    expect(html).toContain("media.removeAttribute('src')");
    const sources = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    for (const source of sources) expect(() => new Function(source)).not.toThrow();
  });

  it("likes an open photo with a mobile double tap", () => {
    const html = lightboxMarkup("en", true);

    expect(html).toContain('id="lightbox-double-heart"');
    expect(html).toContain("now-lastTapAt<340");
    expect(html).toContain("item.dataset.liked!=='true'");
    expect(html).toContain("likeButton.click()");
    expect(html).toContain("lightbox-heart-pop");
    expect(html).toContain("{passive:false}");
    expect(html).toContain("original=item.dataset.original||item.dataset.full||src");
    expect(html).toContain('id="lightbox-download"');
    expect(html).not.toContain('id="lightbox-download" aria-label="Download original" class="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur" download');
    expect(html).toContain("new File([blob]");
    expect(html).toContain("navigator.canShare?.({files:[file]})");
    expect(html).not.toContain("headers:{Range:'bytes=0-0'}");
    expect(html).toContain("if(!response.ok)throw new Error");
    expect(html).toContain("memboux:media-download");
    expect(html).not.toContain("fullResolution");
  });

  it("packs cards into a brickwall that follows the gallery's responsive columns", () => {
    const html = brickwallScript();

    expect(html).toContain("__membouxBrickwall");
    expect(html).toContain("getComputedStyle(grid).columnGap");
    expect(html).toContain("breakpoints={sm:640,md:768,lg:1024,xl:1280,'2xl':1536}");
    expect(html).toContain("responsiveColumns");
    expect(html).toContain("responsiveColumns(grid,innerWidth)");
    expect(html).not.toContain("responsiveColumns(grid,width)");
    expect(html).toContain("/^grid-cols-(\\d+)$/");
    expect(html).toContain("/^(sm|md|lg|xl|2xl):grid-cols-(\\d+)$/");
    expect(html).toContain("columnWidth=(width-gap*(columns-1))/columns");
    expect(html).toContain("heights.indexOf(Math.min(...heights))");
    expect(html).toContain("brickwallColumns=String(columns)");
    expect(html).toContain("translate3d(");
    expect(html).toContain("ResizeObserver");
    expect(html).toContain("MutationObserver");
    expect(html).toContain("brickwallReady='true'");
  });
});
