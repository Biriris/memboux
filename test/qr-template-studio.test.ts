import { describe, expect, it } from "vitest";
import { normalizeQrDesignConfig } from "../src/qr-template-designs";
import {
  qrTemplateCopyPresets,
  qrTemplateFamilies,
  qrTemplateFormats,
  renderQrTemplateStudio,
} from "../src/views/qr-template-studio";

describe("QR template studio", () => {
  it("normalizes persisted design data and rejects unsafe keys or colors", () => {
    const config = normalizeQrDesignConfig({
      family: "minimal",
      format: "a4",
      copy: "remember",
      destination: "album_photobooth",
      title: "Welcome".repeat(20),
      heading: "Share the moment",
      subtitle: "Upload your photos",
      background: "#ffffff",
      accent: "#7c3aed",
      ink: "#111111",
    });
    expect(config).not.toBeNull();
    expect(config?.title).toHaveLength(70);
    expect(normalizeQrDesignConfig({ ...config, family: "../unsafe" })).toBeNull();
    expect(normalizeQrDesignConfig({ ...config, accent: "red" })).toBeNull();
  });

  it("offers more than 180 editable design combinations", () => {
    expect(qrTemplateFamilies).toHaveLength(12);
    expect(qrTemplateFormats).toHaveLength(6);
    expect(qrTemplateCopyPresets).toHaveLength(3);
    expect(qrTemplateFamilies.length * qrTemplateFormats.length * qrTemplateCopyPresets.length).toBe(216);
    expect(new Set(qrTemplateFamilies.map((family) => family.key)).size).toBe(qrTemplateFamilies.length);
  });

  it("renders destinations, live editing and all export controls", () => {
    const html = renderQrTemplateStudio({
      locale: "el",
      eventCode: "EVT901",
      eventName: "Μαρία & Νίκος",
      eventDate: "13 Αυγούστου 2026",
      headerHtml: "<header>Account</header>",
      backUrl: "/dashboard/EVT901?lang=el",
      destinations: [
        { key: "guest_gallery", label: "Gallery καλεσμένων", url: "https://memboux.com/gallery/EVT901", qrSvg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>' },
        { key: "album_1", label: "Photobooth", url: "https://memboux.com/gallery/EVT901/albums/photobooth", qrSvg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>' },
      ],
      initialDestination: "album_1",
      defaultBackground: "#fffdf8",
      defaultAccent: "#7c3aed",
      defaultInk: "#2b174d",
    });

    expect(html).toContain("216+ επεξεργάσιμοι συνδυασμοί");
    expect(html).toContain("Photobooth");
    expect(html).toContain('value="album_1" selected');
    expect(html).toContain('id="qr-preview"');
    expect(html).toContain('id="qr-svg"');
    expect(html).toContain('id="qr-png"');
    expect(html).toContain('id="qr-print"');
    expect(html).toContain("qr-template-activity");
    expect(html).toContain('id="qr-saved-list"');
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(1);
    expect(() => new Function(scripts.at(-1)?.[1] ?? "")).not.toThrow();
  });

  it("escapes HTML and script boundaries in event-owned content", () => {
    const html = renderQrTemplateStudio({
      locale: "en",
      eventCode: "SAFE01",
      eventName: "</script><script>alert(1)</script>",
      eventDate: "2026-08-13",
      headerHtml: "",
      backUrl: "/dashboard/SAFE01",
      destinations: [{ key: "gallery", label: "<Gallery>", url: "https://memboux.com/gallery/SAFE01", qrSvg: '<svg viewBox="0 0 1 1"></svg>' }],
      defaultBackground: "#ffffff",
      defaultAccent: "#7c3aed",
      defaultInk: "#111111",
    });

    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>");
    expect(html).toContain("&lt;Gallery&gt;");
  });
});
