import { env } from "cloudflare:test";
import { beforeEach,describe,expect,it } from "vitest";
import { canCreateOwnedEvent,canInviteToEvent,canStoreForEvent,formatBytes,getUserEntitlement,releaseOwnedEvent,releaseStorage,reserveOwnedEvent,reserveStorageForEvent } from "../src/quotas";

beforeEach(async()=>{
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"),env.DB.prepare("DROP TABLE IF EXISTS event_members"),env.DB.prepare("DROP TABLE IF EXISTS events"),env.DB.prepare("DROP TABLE IF EXISTS account_event_usage"),env.DB.prepare("DROP TABLE IF EXISTS account_storage_usage"),env.DB.prepare("DROP TABLE IF EXISTS account_entitlements"),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY,deleted_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT)"),
    env.DB.prepare("CREATE TABLE event_invitations (event_id TEXT,accepted_at INTEGER,expires_at INTEGER)"),
    env.DB.prepare("CREATE TABLE account_entitlements (user_id TEXT PRIMARY KEY,plan_key TEXT,storage_limit_bytes INTEGER,event_limit INTEGER,member_limit INTEGER,updated_at INTEGER)"),
    env.DB.prepare("CREATE TABLE account_storage_usage (user_id TEXT PRIMARY KEY,used_bytes INTEGER,updated_at INTEGER)"),
    env.DB.prepare("CREATE TABLE account_event_usage (user_id TEXT PRIMARY KEY,active_events INTEGER,updated_at INTEGER)"),
  ]);
});

describe("account quotas",()=>{
  it("uses safe beta defaults before an explicit entitlement exists",async()=>{
    expect(await getUserEntitlement(env.DB,"new-user")).toMatchObject({planKey:"beta",usedBytes:0,eventLimit:25,memberLimit:25});
  });

  it("checks storage, owned events and pending collaborators",async()=>{
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO account_entitlements VALUES (?,?,?,?,?,?)").bind("owner","custom",100,1,2,now),
      env.DB.prepare("INSERT INTO account_storage_usage VALUES (?,?,?)").bind("owner",80,now),
      env.DB.prepare("INSERT INTO account_event_usage VALUES (?,?,?)").bind("owner",1,now),
      env.DB.prepare("INSERT INTO events VALUES (?,NULL)").bind("event-1"),
      env.DB.prepare("INSERT INTO event_members VALUES (?,?,?)").bind("event-1","owner","owner"),
      env.DB.prepare("INSERT INTO event_members VALUES (?,?,?)").bind("event-1","member-1","editor"),
      env.DB.prepare("INSERT INTO event_invitations VALUES (?,NULL,?)").bind("event-1",now+1000),
    ]);
    expect((await canStoreForEvent(env.DB,"event-1",20)).allowed).toBe(true);
    expect((await canStoreForEvent(env.DB,"event-1",21)).allowed).toBe(false);
    expect((await canCreateOwnedEvent(env.DB,"owner")).allowed).toBe(false);
    expect((await canInviteToEvent(env.DB,"event-1")).allowed).toBe(false);
  });

  it("formats human-readable capacity",()=>expect(formatBytes(20*1024*1024*1024)).toBe("20 GB"));

  it("atomically reserves and releases storage and event capacity",async()=>{
    const now=Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO account_entitlements VALUES (?,?,?,?,?,?)").bind("owner","custom",100,1,2,now),
      env.DB.prepare("INSERT INTO account_storage_usage VALUES (?,?,?)").bind("owner",80,now),
      env.DB.prepare("INSERT INTO account_event_usage VALUES (?,?,?)").bind("owner",1,now),
      env.DB.prepare("INSERT INTO events VALUES (?,NULL)").bind("event-1"),
      env.DB.prepare("INSERT INTO event_members VALUES (?,?,?)").bind("event-1","owner","owner"),
    ]);
    expect((await reserveStorageForEvent(env.DB,"event-1",20)).allowed).toBe(true);
    expect((await reserveStorageForEvent(env.DB,"event-1",1)).allowed).toBe(false);
    await releaseStorage(env.DB,"owner",20);
    expect((await env.DB.prepare("SELECT used_bytes FROM account_storage_usage WHERE user_id='owner'").first<{used_bytes:number}>())?.used_bytes).toBe(80);
    expect(await reserveOwnedEvent(env.DB,"owner")).toBe(false);
    await releaseOwnedEvent(env.DB,"owner");
    expect(await reserveOwnedEvent(env.DB,"owner")).toBe(true);
  });
});
