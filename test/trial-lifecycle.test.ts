import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcileEventTrials } from "../src/trial-lifecycle";

const DAY_MS = 86_400_000;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS account_notifications"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("DROP TABLE IF EXISTS event_access"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY,deleted_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT)"),
    env.DB.prepare(`CREATE TABLE event_access (
      event_id TEXT PRIMARY KEY,access_state TEXT,enforcement_state TEXT,
      trial_ends_at INTEGER,guest_access_enabled INTEGER,guest_uploads_enabled INTEGER,
      original_downloads_enabled INTEGER,expires_at INTEGER,updated_at INTEGER
    )`),
    env.DB.prepare(`CREATE TABLE account_notifications (
      id TEXT PRIMARY KEY,user_id TEXT,event_id TEXT,invitation_id TEXT,
      actor_user_id TEXT,actor_name TEXT,type TEXT,item_count INTEGER,
      created_at INTEGER,read_at INTEGER
    )`),
    env.DB.prepare(`CREATE UNIQUE INDEX idx_test_trial_notification_once
      ON account_notifications(user_id,event_id,type)
      WHERE type IN ('trial_ending_3d','trial_ending_1d','trial_expired')`),
  ]);
});

describe("trial lifecycle reconciliation", () => {
  it("notifies the owner at three days, one day and expiry exactly once", async () => {
    const now = 1_000_000_000;
    const endsAt = now + 2.5 * DAY_MS;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO events VALUES ('event-1',NULL)"),
      env.DB.prepare("INSERT INTO event_members VALUES ('event-1','owner-1','owner')"),
      env.DB.prepare(`INSERT INTO event_access VALUES
        ('event-1','trial','enforced',?,1,1,0,NULL,?)`).bind(endsAt, now),
    ]);

    expect(await reconcileEventTrials(env, now)).toEqual({
      processed: 1,
      expired: 0,
      notifications: 1,
    });
    expect((await reconcileEventTrials(env, now)).notifications).toBe(0);

    expect((await reconcileEventTrials(env, endsAt - DAY_MS / 2)).notifications).toBe(1);
    expect((await reconcileEventTrials(env, endsAt - DAY_MS / 2)).notifications).toBe(0);

    const expired = await reconcileEventTrials(env, endsAt + 1);
    expect(expired).toEqual({ processed: 1, expired: 1, notifications: 1 });
    expect(await env.DB.prepare(
      "SELECT access_state,guest_access_enabled,guest_uploads_enabled,original_downloads_enabled,expires_at FROM event_access WHERE event_id='event-1'",
    ).first()).toEqual({
      access_state: "expired",
      guest_access_enabled: 0,
      guest_uploads_enabled: 0,
      original_downloads_enabled: 0,
      expires_at: endsAt,
    });
    expect((await env.DB.prepare(
      "SELECT type FROM account_notifications ORDER BY created_at,type",
    ).all()).results).toEqual([
      { type: "trial_ending_3d" },
      { type: "trial_ending_1d" },
      { type: "trial_expired" },
    ]);
    expect(await reconcileEventTrials(env, endsAt + DAY_MS)).toEqual({
      processed: 0,
      expired: 0,
      notifications: 0,
    });
  });

  it("ignores deleted, unlocked and distant events", async () => {
    const now = 2_000_000_000;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO events VALUES ('deleted',?)").bind(now),
      env.DB.prepare("INSERT INTO events VALUES ('unlocked',NULL)"),
      env.DB.prepare("INSERT INTO events VALUES ('distant',NULL)"),
      env.DB.prepare("INSERT INTO event_members VALUES ('deleted','owner','owner')"),
      env.DB.prepare("INSERT INTO event_members VALUES ('unlocked','owner','owner')"),
      env.DB.prepare("INSERT INTO event_members VALUES ('distant','owner','owner')"),
      env.DB.prepare("INSERT INTO event_access VALUES ('deleted','trial','enforced',?,1,1,0,NULL,?)").bind(now, now),
      env.DB.prepare("INSERT INTO event_access VALUES ('unlocked','unlocked','enforced',?,1,1,1,NULL,?)").bind(now, now),
      env.DB.prepare("INSERT INTO event_access VALUES ('distant','trial','enforced',?,1,1,0,NULL,?)").bind(now + 4 * DAY_MS, now),
    ]);
    expect(await reconcileEventTrials(env, now)).toEqual({
      processed: 0,
      expired: 0,
      notifications: 0,
    });
  });
});
