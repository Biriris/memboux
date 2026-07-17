import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { permanentlyDeleteUserAsAdmin } from "../src/admin-user-deletion";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS account_subscriptions"),
    env.DB.prepare("DROP TABLE IF EXISTS event_invitations"),
    env.DB.prepare("DROP TABLE IF EXISTS verification"),
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare("DROP TABLE IF EXISTS event_members"),
    env.DB.prepare("DROP TABLE IF EXISTS account_storage_usage"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare(
      'CREATE TABLE "user" (id TEXT PRIMARY KEY,email TEXT NOT NULL)',
    ),
    env.DB.prepare(
      "CREATE TABLE account_subscriptions (user_id TEXT PRIMARY KEY,billing_provider TEXT,status TEXT)",
    ),
    env.DB.prepare(
      "CREATE TABLE events (id TEXT PRIMARY KEY,code TEXT,eventName TEXT,created_at INTEGER,expires_at INTEGER)",
    ),
    env.DB.prepare(
      "CREATE TABLE event_members (event_id TEXT,user_id TEXT,role TEXT)",
    ),
    env.DB.prepare(
      "CREATE TABLE media (id TEXT PRIMARY KEY,event_id TEXT,object_key TEXT,size_bytes INTEGER)",
    ),
    env.DB.prepare(
      "CREATE TABLE account_storage_usage (user_id TEXT PRIMARY KEY,used_bytes INTEGER,updated_at INTEGER)",
    ),
    env.DB.prepare(
      "CREATE TABLE event_invitations (id TEXT PRIMARY KEY,email TEXT)",
    ),
    env.DB.prepare(
      "CREATE TABLE verification (id TEXT PRIMARY KEY,identifier TEXT)",
    ),
  ]);
});

async function seedOwnedEvent() {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO "user" (id,email) VALUES (?,?)').bind(
      "user-delete",
      "owner@example.com",
    ),
    env.DB.prepare(
      "INSERT INTO events (id,code,eventName,created_at,expires_at) VALUES (?,?,?,?,?)",
    ).bind("event-delete", "DELETE", "Delete me", 1, 2),
    env.DB.prepare(
      "INSERT INTO event_members (event_id,user_id,role) VALUES (?,?,?)",
    ).bind("event-delete", "user-delete", "owner"),
    env.DB.prepare(
      "INSERT INTO media (id,event_id,object_key,size_bytes) VALUES (?,?,?,?)",
    ).bind("media-delete", "event-delete", "delete/photo.jpg", 3),
    env.DB.prepare(
      "INSERT INTO account_storage_usage (user_id,used_bytes,updated_at) VALUES (?,?,?)",
    ).bind("user-delete", 3, 1),
    env.DB.prepare(
      "INSERT INTO event_invitations (id,email) VALUES (?,?)",
    ).bind("invite-delete", "OWNER@example.com"),
    env.DB.prepare(
      "INSERT INTO verification (id,identifier) VALUES (?,?)",
    ).bind("verification-delete", "owner@example.com"),
  ]);
  await env.MEDIA.put("delete/photo.jpg", new Uint8Array([1, 2, 3]));
}

describe("permanentlyDeleteUserAsAdmin", () => {
  it("requires an exact email confirmation", async () => {
    await seedOwnedEvent();

    const result = await permanentlyDeleteUserAsAdmin(
      env,
      "user-delete",
      "wrong@example.com",
    );

    expect(result.status).toBe("confirmation_mismatch");
    expect(
      await env.DB.prepare('SELECT id FROM "user" WHERE id=?')
        .bind("user-delete")
        .first(),
    ).not.toBeNull();
  });

  it("removes the account, owned events, database records and R2 objects", async () => {
    await seedOwnedEvent();

    const result = await permanentlyDeleteUserAsAdmin(
      env,
      "user-delete",
      "OWNER@example.com",
    );

    expect(result).toEqual({ status: "deleted", deletedEvents: 1 });
    expect(
      await env.DB.prepare('SELECT id FROM "user" WHERE id=?')
        .bind("user-delete")
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM events WHERE id=?")
        .bind("event-delete")
        .first(),
    ).toBeNull();
    expect(await env.MEDIA.get("delete/photo.jpg")).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM event_invitations WHERE id=?")
        .bind("invite-delete")
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM verification WHERE id=?")
        .bind("verification-delete")
        .first(),
    ).toBeNull();
  });

  it("blocks deletion while Stripe can still bill the user", async () => {
    await seedOwnedEvent();
    await env.DB.prepare(
      "INSERT INTO account_subscriptions (user_id,billing_provider,status) VALUES (?,?,?)",
    )
      .bind("user-delete", "stripe", "active")
      .run();

    const result = await permanentlyDeleteUserAsAdmin(
      env,
      "user-delete",
      "owner@example.com",
    );

    expect(result.status).toBe("active_stripe_subscription");
    expect(await env.MEDIA.get("delete/photo.jpg")).not.toBeNull();
  });
});
