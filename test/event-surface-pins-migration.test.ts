import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migration from "../migrations/0064_event_surface_pins.sql?raw";

const sqlForD1Exec = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

describe("0064 event surface PIN migration", () => {
  it("preserves an existing shared PIN across all three protected surfaces", async () => {
    await env.DB.exec(sqlForD1Exec(`
      CREATE TABLE events (id TEXT PRIMARY KEY, gallery_pin_hash TEXT);
      INSERT INTO events (id,gallery_pin_hash) VALUES ('protected','existing-hash'),('public',NULL);
    `));
    await env.DB.exec(sqlForD1Exec(migration));

    expect(await env.DB.prepare(`SELECT website_pin_hash,guest_gallery_pin_hash,official_album_pin_hash
      FROM events WHERE id='protected'`).first()).toEqual({
      website_pin_hash: "existing-hash",
      guest_gallery_pin_hash: "existing-hash",
      official_album_pin_hash: "existing-hash",
    });
    expect(await env.DB.prepare(`SELECT website_pin_hash,guest_gallery_pin_hash,official_album_pin_hash
      FROM events WHERE id='public'`).first()).toEqual({
      website_pin_hash: null,
      guest_gallery_pin_hash: null,
      official_album_pin_hash: null,
    });
  });
});
