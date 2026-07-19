import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { normalizeSupportMessage, validSupportEmail } from "../src/routes/support";
import { privacySupportWidgets } from "../src/views/privacy-support";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS support_messages"),
    env.DB.prepare("DROP TABLE IF EXISTS support_conversations"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS request_rate_limits (
      rate_key TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,request_count INTEGER NOT NULL,expires_at INTEGER NOT NULL
    )`),
    env.DB.prepare("DELETE FROM request_rate_limits"),
    env.DB.prepare(`CREATE TABLE support_conversations (
      id TEXT PRIMARY KEY,user_id TEXT,visitor_token_hash TEXT,visitor_name TEXT NOT NULL DEFAULT '',visitor_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',admin_read_at INTEGER,user_read_at INTEGER,
      last_message_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE support_messages (
      id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,sender_type TEXT NOT NULL,sender_user_id TEXT,body TEXT NOT NULL,created_at INTEGER NOT NULL
    )`),
  ]);
});

describe("support validation and widgets", () => {
  it("normalizes messages and validates email", () => {
    expect(normalizeSupportMessage("  hello\r\nworld  ")).toBe("hello\nworld");
    expect(validSupportEmail("TEST@Example.COM")).toBe("test@example.com");
    expect(validSupportEmail("not-an-email")).toBeNull();
  });

  it("renders consent and support controls in every supported locale", () => {
    for (const locale of ["en", "el", "fr", "de", "es", "it"] as const) {
      const html = privacySupportWidgets(locale);
      expect(html).toContain("data-consent-banner");
      expect(html).toContain("data-cookie-analytics");
      expect(html).toContain("data-support-open");
      expect(html).toContain("/api/support/conversation");
    }
  });
});

describe("guest support conversation API", () => {
  it("creates and restores a persistent guest conversation", async () => {
    const created = await SELF.fetch("https://memboux.com/api/support/conversation", {
      method: "POST",
      headers: { Origin: "https://memboux.com", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guest", email: "guest@example.com", subject: "Technical problem", message: "The gallery does not open." }),
    });
    expect(created.status).toBe(201);
    const cookie = created.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("memboux_support=");
    expect(cookie).toContain("HttpOnly");
    const payload = await created.json<{ conversation: { id: string; status: string }; messages: Array<{ body: string }> }>();
    expect(payload.conversation.status).toBe("open");
    expect(payload.messages[0].body).toBe("The gallery does not open.");

    const response = await SELF.fetch("https://memboux.com/api/support/conversation", { headers: { Cookie: cookie.split(";")[0] } });
    expect(response.status).toBe(200);
    const restored = await response.json<{ conversation: { id: string }; messages: Array<{ body: string }> }>();
    expect(restored.conversation.id).toBe(payload.conversation.id);
    expect(restored.messages).toHaveLength(1);
  });
});
