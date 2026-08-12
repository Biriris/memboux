import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0067_event_type_transitions.sql?raw";
import { changeEventType } from "../src/event-type-transitions";

const sqlForD1Exec = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_type_transitions"),
    env.DB.prepare("DROP TABLE IF EXISTS event_vertical_profiles"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY,eventName TEXT NOT NULL,event_type TEXT NOT NULL,updated_at INTEGER)"),
    env.DB.prepare(`CREATE TABLE event_vertical_profiles (
      event_id TEXT PRIMARY KEY,headline TEXT NOT NULL DEFAULT '',host_name TEXT NOT NULL DEFAULT '',
      introduction TEXT NOT NULL DEFAULT '',story TEXT NOT NULL DEFAULT '',schedule_notes TEXT NOT NULL DEFAULT '',
      guest_notes TEXT NOT NULL DEFAULT '',contact_email TEXT NOT NULL DEFAULT '',theme_key TEXT NOT NULL DEFAULT 'signature',
      wizard_step INTEGER NOT NULL DEFAULT 1,wizard_completed_at INTEGER,publish_status TEXT NOT NULL DEFAULT 'draft',
      updated_at INTEGER NOT NULL,custom_fields_json TEXT NOT NULL DEFAULT '{}'
    )`),
    env.DB.prepare("INSERT INTO events VALUES ('event-1','Birthday memories','birthday',1)"),
    env.DB.prepare(`INSERT INTO event_vertical_profiles
      (event_id,headline,host_name,story,theme_key,wizard_step,wizard_completed_at,publish_status,updated_at,custom_fields_json)
      VALUES ('event-1','Thirty together','Alex','Original story','vivid',4,100,'published',100,'{"age":"30"}')`),
  ]);
  await env.DB.exec(sqlForD1Exec(migration));
});

describe("reversible event type transitions", () => {
  it("archives generic setup, preserves it while Wedding is active, and restores it on return", async () => {
    const toWedding = await changeEventType(env.DB, {
      eventId: "event-1", eventName: "Birthday memories", from: "birthday", to: "wedding",
      changedByUserId: "owner-1", now: 200,
    });
    expect(toWedding).toEqual({ changed: true, restored: false });
    expect(await env.DB.prepare("SELECT event_type FROM events WHERE id='event-1'").first()).toEqual({ event_type: "wedding" });
    expect(await env.DB.prepare("SELECT * FROM event_vertical_profiles WHERE event_id='event-1'").first()).toBeNull();

    const backToBirthday = await changeEventType(env.DB, {
      eventId: "event-1", eventName: "Birthday memories", from: "wedding", to: "birthday",
      changedByUserId: "owner-1", now: 300,
    });
    expect(backToBirthday).toEqual({ changed: true, restored: true });
    expect(await env.DB.prepare("SELECT headline,story,theme_key,wizard_step,publish_status,custom_fields_json FROM event_vertical_profiles WHERE event_id='event-1'").first()).toEqual({
      headline: "Thirty together", story: "Original story", theme_key: "vivid", wizard_step: 4,
      publish_status: "published", custom_fields_json: '{"age":"30"}',
    });
    expect((await env.DB.prepare("SELECT from_event_type,to_event_type FROM event_type_transitions ORDER BY changed_at").all()).results).toEqual([
      { from_event_type: "birthday", to_event_type: "wedding" },
      { from_event_type: "wedding", to_event_type: "birthday" },
    ]);
  });
});
