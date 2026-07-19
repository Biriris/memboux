import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/domain";
import { renderWeddingPage, type PublicWeddingProfile } from "../src/views/wedding-page";

const event: EventRow = {
  id: "event-1",
  code: "ABC123",
  eventName: "Summer Wedding",
  admin_token_hash: "hash",
  created_at: 1,
  expires_at: Date.now() + 100_000,
  status: "active",
  notes: "",
  updated_at: null,
  default_locale: "en",
  event_start_date: "2027-06-15",
  event_end_date: "2027-06-15",
  event_type: "wedding",
  gallery_pin_hash: null,
  deleted_at: null,
  purge_at: null,
};

const profile: PublicWeddingProfile = {
  partner_one_name: "Alex",
  partner_two_name: "Sam",
  welcome_message: "Celebrate with us",
  story: "A story worth sharing.",
  ceremony_at: "2027-06-15T17:00",
  ceremony_location: "Athens",
  reception_at: null,
  reception_location: "",
  dress_code: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  travel_notes: "",
  accommodation_notes: "",
  gift_message: "",
  gift_url: "",
  template_key: "nocturne",
  accent_color: "#aabbcc",
};

describe("wedding event page", () => {
  it("renders the selected template, cover and enabled experiences", () => {
    const html = renderWeddingPage({ event, profile, locale: "en", selectedFeatures: ["rsvp", "guestbook"], coverUpdatedAt: 42 });
    expect(html).toContain('data-wedding-theme="nocturne"');
    expect(html).toContain('data-wedding-layout="editorial"');
    expect(html).toContain('data-wedding-font="didot"');
    expect(html).toContain("family=EB+Garamond");
    expect(html).toContain("/gallery/ABC123/cover?v=42");
    expect(html).toContain("Alex &amp; Sam");
    expect(html).toContain("17:00");
    expect(html).not.toContain("5:00 PM");
    expect(html).toContain("RSVP");
    expect(html).toContain("Guestbook");
    expect(html).not.toContain("Travel &amp; transport");
    expect(html).toContain("data-luxury-hero");
    expect(html).toContain('data-wedding-name-scale="standard"');
    expect(html).toContain("--w-monogram:'AS'");
    expect(html).toContain("wedding-theme=\"atelier\"");
    expect(html).toContain("w-title-shine");
    expect(html).toContain("13.5vw");
    expect(html).toContain("display:block!important");
    expect(html).toContain("--w-hero-size:clamp(3rem,7.4vw,6.9rem)");
    expect(html).not.toContain('<header class="w-top">');
    expect(html).toContain('role="navigation"');
  });

  it("reduces the display scale for long names instead of allowing collisions", () => {
    const html = renderWeddingPage({
      event,
      profile: {
        ...profile,
        partner_one_name: "Alexandria Constantine",
        partner_two_name: "Maximilian Christopher",
      },
      locale: "en",
      selectedFeatures: [],
      coverUpdatedAt: null,
    });
    expect(html).toContain('data-wedding-name-scale="long"');
  });

  it("renders each layout family from the selected edition", () => {
    const editions = [
      ["cypress", "centered", "garamond"],
      ["aegean", "split", "noto-serif"],
      ["champagne", "framed", "didot"],
      ["solstice", "poster", "modern"],
    ] as const;
    for (const [template_key, layout, font] of editions) {
      const html = renderWeddingPage({ event, profile: { ...profile, template_key }, locale: "en", selectedFeatures: [], coverUpdatedAt: null });
      expect(html).toContain(`data-wedding-theme="${template_key}"`);
      expect(html).toContain(`data-wedding-layout="${layout}"`);
      expect(html).toContain(`data-wedding-font="${font}"`);
    }
  });

  it("shows an optional wedding menu and uses locked map coordinates", () => {
    const html = renderWeddingPage({
      event,
      profile: { ...profile, ceremony_lat: 37.9838, ceremony_lng: 23.7275 },
      locale: "en",
      selectedFeatures: [],
      coverUpdatedAt: null,
      menu: {
        event_id: event.id,
        object_key: "wedding-menus/event-1/menu.pdf",
        content_type: "application/pdf",
        original_filename: "Dinner menu.pdf",
        size_bytes: 1024,
        updated_by: "user-1",
        updated_at: 1,
      },
    });
    expect(html).toContain('id="menu"');
    expect(html).toContain("View the menu");
    expect(html).toContain("/wedding/ABC123/menu");
    expect(html).toContain("query=37.9838%2C23.7275");
  });

  it("skips empty optional sections", () => {
    const html = renderWeddingPage({ event, profile: { ...profile, welcome_message: "", story: "", ceremony_at: null, ceremony_location: "" }, locale: "el", selectedFeatures: [], coverUpdatedAt: null, preview: true });
    expect(html).not.toContain('id="story"');
    expect(html).not.toContain('id="schedule"');
    expect(html).toContain("Ιδιωτική προεπισκόπηση");
    expect(html).toContain('id="moments"');
  });

  it("places the complete guest experience inside the wedding page", () => {
    const html = renderWeddingPage({
      event,
      profile,
      locale: "en",
      selectedFeatures: ["rsvp", "guestbook", "live_slideshow"],
      coverUpdatedAt: null,
      experienceHtml: '<section id="guest-experience">Integrated guest area</section><section id="official-album">Professional album</section>',
      experienceScripts: '<script data-integrated-experience></script>',
    });
    expect(html).toContain('href="#guest-upload"');
    expect(html).toContain('href="#official-album"');
    expect(html).toContain('href="#live"');
    expect(html.indexOf('id="guest-experience"')).toBeLessThan(html.indexOf('class="w-footer"'));
    expect(html).toContain("data-integrated-experience");
  });
});
