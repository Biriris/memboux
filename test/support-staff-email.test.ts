import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  supportNotificationEmailInUse,
  supportStaffForSender,
} from "../src/support-staff-email";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS admin_members"),
    env.DB.prepare('DROP TABLE IF EXISTS "user"'),
    env.DB.prepare('CREATE TABLE "user" (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)'),
    env.DB.prepare(`CREATE TABLE admin_members (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,
      notification_email TEXT
    )`),
    env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)').bind("u1", "Agent One", "one@memboux.com"),
    env.DB.prepare('INSERT INTO "user" VALUES (?,?,?)').bind("u2", "Agent Two", "two@memboux.com"),
    env.DB.prepare("INSERT INTO admin_members VALUES (?,?,?,?,?)")
      .bind("m1", "u1", "support", "active", "personal@example.com"),
    env.DB.prepare("INSERT INTO admin_members VALUES (?,?,?,?,?)")
      .bind("m2", "u2", "support", "active", null),
  ]);
});

describe("support staff email identity", () => {
  it("resolves one registered address and detects conflicts before saving", async () => {
    expect(await supportStaffForSender(env.DB, " Personal@Example.com ")).toMatchObject({
      memberId: "m1",
      role: "support",
    });
    expect(await supportNotificationEmailInUse(env.DB, "personal@example.com", "m2")).toBe(true);
    expect(await supportNotificationEmailInUse(env.DB, "personal@example.com", "m1")).toBe(false);
    expect(await supportNotificationEmailInUse(env.DB, "two@memboux.com", "m1")).toBe(true);
  });

  it("fails closed when legacy data maps one address to multiple staff members", async () => {
    await env.DB.prepare("UPDATE admin_members SET notification_email=? WHERE id='m2'")
      .bind("personal@example.com").run();

    expect(await supportStaffForSender(env.DB, "personal@example.com")).toBeNull();
  });
});
