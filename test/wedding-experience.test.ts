import { describe, expect, it } from "vitest";
import type { LikeableMediaRow } from "../src/media-likes";
import { renderWeddingExperience } from "../src/views/wedding-experience";

const photo = (id: string, origin: "guest" | "official"): LikeableMediaRow => ({
  id,
  event_id: "event-1",
  object_key: `${id}.jpg`,
  media_type: "image",
  content_type: "image/jpeg",
  uploaded_by: origin === "guest" ? "Guest Maria" : "Studio",
  uploaded_at: 10,
  captured_at: 9,
  content_hash: id,
  canonical_hash: id,
  reported_at: null,
  size_bytes: 10,
  title: null,
  deleted_at: null,
  purge_at: null,
  upload_consent_at: 10,
  upload_policy_version: "v1",
  origin,
  uploaded_by_user_id: null,
  like_count: 2,
  viewer_liked: 0,
});

describe("integrated wedding guest experience", () => {
  it("renders uploads, sharing, gallery, RSVP, guestbook, official album and live", () => {
    const result = renderWeddingExperience({
      code: "ABC123",
      eventName: "Alex & Sam",
      locale: "en",
      guestUrl: "https://memboux.com/wedding/ABC123",
      guestQrSvg: '<svg data-test="guest-qr"></svg>',
      guestItems: [photo("guest-1", "guest")],
      officialItems: [photo("official-1", "official")],
      guestbookEntries: [{ author_name: "Nina", message: "Beautiful day", created_at: 10 }],
      settings: { rsvp_enabled: 1, guestbook_enabled: 1, comments_enabled: 1, slideshow_enabled: 1 },
      curatorName: "North Studio",
    });
    expect(result.html).toContain('id="guest-upload"');
    expect(result.html).toContain('id="guest-moments"');
    expect(result.html).toContain('id="participate"');
    expect(result.html).toContain('id="official-album"');
    expect(result.html).toContain('id="live"');
    expect(result.html).toContain('data-test="guest-qr"');
    expect(result.html).toContain("North Studio");
    expect(result.html).toContain("Guest Maria");
    expect(result.scripts).toContain("slideshow-feed");
    expect(result.scripts).toContain("wedding-select-media");
  });

  it("progressively reveals large guest galleries", () => {
    const result = renderWeddingExperience({
      code: "ABC123",
      eventName: "Alex & Sam",
      locale: "en",
      guestUrl: "https://memboux.com/wedding/ABC123",
      guestQrSvg: "<svg></svg>",
      guestItems: Array.from({ length: 14 }, (_, index) => photo(`guest-${index}`, "guest")),
      officialItems: [],
      guestbookEntries: [],
      settings: { rsvp_enabled: 0, guestbook_enabled: 0, comments_enabled: 0, slideshow_enabled: 0 },
      curatorName: "Memboux Studio",
    });
    expect(result.html).toContain('data-gallery-more="wedding-guest-gallery"');
    expect(result.html).toContain("2 remaining");
    expect(result.html).toContain('data-gallery-deferred="true"');
    expect(result.scripts).toContain('data-gallery-grid="wedding-guest-gallery"');
  });
});
