import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migration from "../migrations/0061_wedding_guest_planning.sql?raw";

function sqlForD1Exec(sql: string) {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("0061 wedding guest planning migration", () => {
  it("creates event-scoped guest, seating, price snapshot, and RSVP relationships", async () => {
    await env.DB.exec(sqlForD1Exec(`
      CREATE TABLE events (id TEXT PRIMARY KEY);
      CREATE TABLE event_rsvps (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        UNIQUE(event_id,email)
      );
    `));
    await env.DB.exec(sqlForD1Exec(migration));

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO events (id) VALUES ('wedding-event')"),
      env.DB.prepare("INSERT INTO event_wedding_guest_groups (id,event_id,name,created_at,updated_at) VALUES ('group','wedding-event','Friends',?,?)").bind(now, now),
      env.DB.prepare(`INSERT INTO event_wedding_guests
        (id,event_id,group_id,first_name,email,created_at,updated_at)
        VALUES ('guest','wedding-event','group','Jamie','jamie@example.com',?,?)`).bind(now, now),
      env.DB.prepare(`INSERT INTO event_wedding_tables
        (id,event_id,name,capacity,created_at,updated_at)
        VALUES ('table','wedding-event','Table 1',10,?,?)`).bind(now, now),
      env.DB.prepare("INSERT INTO event_wedding_seat_assignments (guest_id,table_id,assigned_at) VALUES ('guest','table',?)").bind(now),
      env.DB.prepare(`INSERT INTO event_wedding_price_snapshots
        (event_id,item_key,item_type,price_minor,currency,catalog_version,locked_at,locked_until)
        VALUES ('wedding-event','base','base',3900,'EUR','wedding-v1',?,?)`).bind(now, now + 86_400_000),
      env.DB.prepare("INSERT INTO event_rsvps (id,event_id,email,wedding_guest_id) VALUES ('rsvp','wedding-event','jamie@example.com','guest')"),
    ]);

    expect(await env.DB.prepare("SELECT table_id FROM event_wedding_seat_assignments WHERE guest_id='guest'").first())
      .toEqual({ table_id: "table" });
    expect(await env.DB.prepare("SELECT wedding_guest_id FROM event_rsvps WHERE id='rsvp'").first())
      .toEqual({ wedding_guest_id: "guest" });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
