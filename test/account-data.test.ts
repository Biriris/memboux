import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAccountExport, countActiveOwnedEvents } from "../src/account-data";

describe("account data rights", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DROP TABLE IF EXISTS official_album_items'), env.DB.prepare('DROP TABLE IF EXISTS media'),
      env.DB.prepare('DROP TABLE IF EXISTS event_professional_assignments'), env.DB.prepare('DROP TABLE IF EXISTS professional_profiles'),
      env.DB.prepare('DROP TABLE IF EXISTS event_invitations'), env.DB.prepare('DROP TABLE IF EXISTS event_members'),
      env.DB.prepare('DROP TABLE IF EXISTS events'), env.DB.prepare('DROP TABLE IF EXISTS account'),
      env.DB.prepare('DROP TABLE IF EXISTS session'), env.DB.prepare('DROP TABLE IF EXISTS "user"'),
      env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,name TEXT,email TEXT,emailVerified INTEGER,image TEXT,createdAt INTEGER,updatedAt INTEGER)'),
      env.DB.prepare('CREATE TABLE session (id TEXT PRIMARY KEY,createdAt INTEGER,updatedAt INTEGER,expiresAt INTEGER,ipAddress TEXT,userAgent TEXT,userId TEXT)'),
      env.DB.prepare('CREATE TABLE account (id TEXT PRIMARY KEY,providerId TEXT,createdAt INTEGER,updatedAt INTEGER,userId TEXT,accessToken TEXT,password TEXT)'),
      env.DB.prepare('CREATE TABLE events (id TEXT PRIMARY KEY,code TEXT,eventName TEXT,created_at INTEGER,updated_at INTEGER,expires_at INTEGER,status TEXT,default_locale TEXT,event_start_date TEXT,event_end_date TEXT,deleted_at INTEGER,purge_at INTEGER)'),
      env.DB.prepare('CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT,created_at INTEGER)'),
      env.DB.prepare('CREATE TABLE event_invitations (id TEXT,event_id TEXT,email TEXT,role TEXT,invited_by TEXT,created_at INTEGER,expires_at INTEGER,accepted_at INTEGER)'),
      env.DB.prepare('CREATE TABLE professional_profiles (user_id TEXT PRIMARY KEY,business_name TEXT,slug TEXT,bio TEXT,website TEXT,status TEXT,created_at INTEGER,updated_at INTEGER)'),
      env.DB.prepare('CREATE TABLE event_professional_assignments (event_id TEXT,professional_user_id TEXT,status TEXT,created_at INTEGER,accepted_at INTEGER,updated_at INTEGER)'),
      env.DB.prepare('CREATE TABLE media (id TEXT PRIMARY KEY,event_id TEXT,media_type TEXT,content_type TEXT,uploaded_at INTEGER,captured_at INTEGER,size_bytes INTEGER,deleted_at INTEGER,purge_at INTEGER,uploaded_by_user_id TEXT)'),
      env.DB.prepare('CREATE TABLE official_album_items (event_id TEXT,media_id TEXT,added_by TEXT,position INTEGER,created_at INTEGER)'),
    ]);
    await env.DB.prepare('INSERT INTO "user" VALUES (?,?,?,?,?,?,?)').bind('u1','User One','one@example.com',1,null,1,2).run();
    await env.DB.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL)').bind('e1','ABC123','Private event',1,2,3,'active','en','2026-07-13','2026-07-14').run();
    await env.DB.prepare('INSERT INTO event_members VALUES (?,?,?,?)').bind('e1','u1','owner',1).run();
    await env.DB.prepare('INSERT INTO account VALUES (?,?,?,?,?,?,?)').bind('a1','google',1,2,'u1','secret-token','secret-password').run();
    await env.DB.prepare('INSERT INTO professional_profiles VALUES (?,?,?,?,?,?,?,?)').bind('u1','Studio One','studio-one','Bio',null,'active',1,2).run();
    await env.DB.prepare('INSERT INTO event_professional_assignments VALUES (?,?,?,?,?,?)').bind('e1','u1','accepted',3,4,5).run();
    await env.DB.prepare('INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?,?)').bind('m1','e1','image','image/jpeg',6,5,1024,null,null,'u1').run();
    await env.DB.prepare('INSERT INTO official_album_items VALUES (?,?,?,?,?)').bind('e1','m1','u1',0,7).run();
  });

  it("blocks deletion while the user owns an active event", async () => {
    expect(await countActiveOwnedEvents(env.DB, 'u1')).toBe(1);
    await env.DB.prepare('UPDATE events SET deleted_at=? WHERE id=?').bind(Date.now(),'e1').run();
    expect(await countActiveOwnedEvents(env.DB, 'u1')).toBe(0);
  });

  it("exports self-service account data without provider secrets", async () => {
    const data = await buildAccountExport(env.DB, 'u1');
    expect(data.account).toMatchObject({ id: 'u1', email: 'one@example.com' });
    expect(data.eventMemberships).toHaveLength(1);
    expect(data.signInProviders).toEqual([{ providerId: 'google', createdAt: 1, updatedAt: 2 }]);
    expect(data.exportVersion).toBe('memboux-account-export-2');
    expect(data.professionalProfile).toMatchObject({ business_name: 'Studio One', slug: 'studio-one' });
    expect(data.professionalAssignments).toHaveLength(1);
    expect(data.officialUploads).toHaveLength(1);
    expect(data.officialAlbumContributions).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain('secret-token');
    expect(JSON.stringify(data)).not.toContain('secret-password');
  });
});
