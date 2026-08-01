import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migration from "../migrations/0062_wedding_guest_invitation_delivery.sql?raw";

describe("0062 wedding guest invitation delivery migration", () => {
  it("adds retryable invitation delivery state", async () => {
    await env.DB.exec("DROP TABLE IF EXISTS event_wedding_guests; CREATE TABLE event_wedding_guests (id TEXT PRIMARY KEY,event_id TEXT NOT NULL,email TEXT NOT NULL DEFAULT '');");
    await env.DB.exec(migration.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim());
    await env.DB.prepare("INSERT INTO event_wedding_guests (id,event_id,email) VALUES ('g1','e1','guest@example.com')").run();
    expect(await env.DB.prepare("SELECT invitation_delivery_status,invitation_delivery_attempted_at,invitation_emailed_at FROM event_wedding_guests WHERE id='g1'").first())
      .toEqual({ invitation_delivery_status: "not_sent", invitation_delivery_attempted_at: null, invitation_emailed_at: null });
    await expect(env.DB.prepare("UPDATE event_wedding_guests SET invitation_delivery_status='unknown' WHERE id='g1'").run()).rejects.toThrow();
  });
});
