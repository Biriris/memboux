import { describe, expect, it } from "vitest";
import { shareIconButtons } from "../src/views/share";

describe("message sharing", () => {
  it("uses Messenger and Instagram Direct instead of Facebook post sharing", () => {
    const html = shareIconButtons("https://memboux.com/gallery/ABC123", "Summer trip", "en");

    expect(html).toContain('data-message-app="messenger"');
    expect(html).toContain('aria-label="Messenger"');
    expect(html).toContain('data-message-app="instagram"');
    expect(html).toContain('aria-label="Instagram Direct"');
    expect(html).toContain("instagram://direct-inbox");
    expect(html).toContain("fb-messenger://share/");
    expect(html).not.toContain("sharer/sharer.php");
    expect(html).not.toContain('aria-label="Facebook"');
    expect(html).toContain('href="sms:?&body=');
    expect(html).toContain('aria-label="Text message"');
    expect(html).toContain("sm:hidden");
    expect(html.indexOf('href="sms:')).toBeLessThan(html.indexOf('href="viber:'));
  });

  it("copies the private link before opening a message app and keeps native fallback", () => {
    const html = shareIconButtons("https://memboux.com/gallery/ABC123", "Summer trip", "el");
    expect(html).toContain("navigator.clipboard.writeText(button.dataset.text)");
    expect(html).toContain("navigator.share(payload)");
  });
});
