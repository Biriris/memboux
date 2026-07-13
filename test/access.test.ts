import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getEventRole, roleCan, type EventCapability } from "../src/access";
import type { EventRole } from "../src/domain";

const matrix: Record<EventRole, Record<EventCapability, boolean>> = {
  owner: { view: true, manage_media: true, manage_event: true, manage_members: true },
  editor: { view: true, manage_media: true, manage_event: false, manage_members: false },
  viewer: { view: true, manage_media: false, manage_event: false, manage_members: false },
};

describe("event role policy", () => {
  it("grants exactly the documented capabilities to every role", () => {
    for (const [role, capabilities] of Object.entries(matrix) as [EventRole, Record<EventCapability, boolean>][]) {
      for (const [capability, expected] of Object.entries(capabilities) as [EventCapability, boolean][]) {
        expect(roleCan(role, capability), `${role} → ${capability}`).toBe(expected);
      }
    }
  });

  it("denies every capability when no membership exists", () => {
    expect(roleCan(null, "view")).toBe(false);
    expect(roleCan(null, "manage_media")).toBe(false);
    expect(roleCan(null, "manage_event")).toBe(false);
    expect(roleCan(null, "manage_members")).toBe(false);
  });
});

describe("event membership repository", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DROP TABLE IF EXISTS event_members"),
      env.DB.prepare(`CREATE TABLE event_members (
        event_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (event_id,user_id)
      )`),
    ]);
  });

  it("returns the stored event role", async () => {
    await env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)")
      .bind("event-1", "user-1", "editor", Date.now())
      .run();

    expect(await getEventRole(env.DB, "event-1", "user-1")).toBe("editor");
  });

  it("does not confuse memberships between users or events", async () => {
    await env.DB.prepare("INSERT INTO event_members (event_id,user_id,role,created_at) VALUES (?,?,?,?)")
      .bind("event-1", "owner-1", "owner", Date.now())
      .run();

    expect(await getEventRole(env.DB, "event-1", "other-user")).toBeNull();
    expect(await getEventRole(env.DB, "other-event", "owner-1")).toBeNull();
  });
});
