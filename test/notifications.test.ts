import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccountNotification, notifyEventMembersAboutUpload } from "../src/notifications";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS account_notifications"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT,created_at INTEGER)"),
    env.DB.prepare(`CREATE TABLE account_notifications (
      id TEXT PRIMARY KEY,user_id TEXT,event_id TEXT,invitation_id TEXT,
      actor_user_id TEXT,actor_name TEXT,type TEXT,item_count INTEGER,
      created_at INTEGER,read_at INTEGER
    )`),
    env.DB.prepare("INSERT INTO event_members VALUES ('event-1','owner','owner',1)"),
    env.DB.prepare("INSERT INTO event_members VALUES ('event-1','friend','editor',1)"),
  ]);
});

describe("account notifications", () => {
  it("records upload activity for every event member, including the uploader", async () => {
    await notifyEventMembersAboutUpload(env.DB, {
      eventId: "event-1",
      actorUserId: "friend",
      actorName: "Alex",
      itemCount: 4,
      createdAt: 100,
    });
    const rows = await env.DB.prepare("SELECT user_id,type,item_count FROM account_notifications ORDER BY user_id DESC").all();
    expect(rows.results).toEqual([
      { user_id: "owner", type: "media_uploaded", item_count: 4 },
      { user_id: "friend", type: "media_uploaded", item_count: 4 },
    ]);
  });

  it("stores direct invitation activity as unread", async () => {
    await createAccountNotification(env.DB, {
      userId: "owner",
      eventId: "event-1",
      actorName: "Maria",
      type: "invitation_accepted",
      createdAt: 200,
    });
    expect(await env.DB.prepare("SELECT actor_name,type,read_at FROM account_notifications").first()).toEqual({
      actor_name: "Maria",
      type: "invitation_accepted",
      read_at: null,
    });
  });
});
