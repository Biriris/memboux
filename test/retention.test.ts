import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { purgeExpiredOperationalRecords } from "../src/repositories";

const DAY = 86_400_000;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS session"), env.DB.prepare("DROP TABLE IF EXISTS verification"),
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"), env.DB.prepare("DROP TABLE IF EXISTS media_removal_requests"),
    env.DB.prepare("DROP TABLE IF EXISTS privacy_requests"),
    env.DB.prepare("CREATE TABLE session (id TEXT PRIMARY KEY,expiresAt INTEGER)"),
    env.DB.prepare("CREATE TABLE verification (id TEXT PRIMARY KEY,expiresAt INTEGER)"),
    env.DB.prepare("CREATE TABLE event_invitations (id TEXT PRIMARY KEY,accepted_at INTEGER,expires_at INTEGER)"),
    env.DB.prepare("CREATE TABLE media_removal_requests (id TEXT PRIMARY KEY,status TEXT,resolved_at INTEGER)"),
    env.DB.prepare("CREATE TABLE privacy_requests (id TEXT PRIMARY KEY,status TEXT,resolved_at INTEGER)"),
  ]);
});

describe("operational retention", () => {
  it("purges only records beyond their documented retention", async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO session VALUES (?,?)").bind("expired",now-1),
      env.DB.prepare("INSERT INTO session VALUES (?,?)").bind("active",now+DAY),
      env.DB.prepare("INSERT INTO verification VALUES (?,?)").bind("expired",now-1),
      env.DB.prepare("INSERT INTO event_invitations VALUES (?,?,?)").bind("expired",null,now-1),
      env.DB.prepare("INSERT INTO event_invitations VALUES (?,?,?)").bind("accepted-recent",now-30*DAY,now-60*DAY),
      env.DB.prepare("INSERT INTO media_removal_requests VALUES (?,?,?)").bind("old","resolved",now-366*DAY),
      env.DB.prepare("INSERT INTO media_removal_requests VALUES (?,?,?)").bind("pending","pending",null),
      env.DB.prepare("INSERT INTO privacy_requests VALUES (?,?,?)").bind("old","resolved",now-3*365*DAY-1),
      env.DB.prepare("INSERT INTO privacy_requests VALUES (?,?,?)").bind("recent","resolved",now-30*DAY),
    ]);
    expect(await purgeExpiredOperationalRecords(env.DB,now)).toBe(5);
    expect((await env.DB.prepare("SELECT id FROM session ORDER BY id").all()).results).toEqual([{id:"active"}]);
    expect((await env.DB.prepare("SELECT id FROM event_invitations").all()).results).toEqual([{id:"accepted-recent"}]);
    expect((await env.DB.prepare("SELECT id FROM media_removal_requests").all()).results).toEqual([{id:"pending"}]);
    expect((await env.DB.prepare("SELECT id FROM privacy_requests ORDER BY id").all()).results).toEqual([{id:"recent"}]);
  });
});
