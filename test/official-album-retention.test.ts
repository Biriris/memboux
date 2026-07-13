import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("official album retention", () => {
  it("preserves the album item when the contributing professional deletes their account", async () => {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY)'),
      env.DB.prepare('CREATE TABLE events (id TEXT PRIMARY KEY)'),
      env.DB.prepare('CREATE TABLE media (id TEXT PRIMARY KEY,event_id TEXT REFERENCES events(id) ON DELETE CASCADE)'),
      env.DB.prepare(`CREATE TABLE official_album_items (
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        added_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
        PRIMARY KEY (event_id,media_id)
      )`),
      env.DB.prepare('INSERT INTO "user" VALUES (?)').bind('professional-1'),
      env.DB.prepare('INSERT INTO events VALUES (?)').bind('event-1'),
      env.DB.prepare('INSERT INTO media VALUES (?,?)').bind('media-1','event-1'),
      env.DB.prepare('INSERT INTO official_album_items VALUES (?,?,?,?,?)').bind('event-1','media-1','professional-1',0,1),
    ]);

    await env.DB.prepare('DELETE FROM "user" WHERE id=?').bind('professional-1').run();

    const item = await env.DB.prepare(
      'SELECT event_id,media_id,added_by FROM official_album_items',
    ).first<{ event_id: string; media_id: string; added_by: string | null }>();
    expect(item).toEqual({ event_id: 'event-1', media_id: 'media-1', added_by: null });
  });
});
