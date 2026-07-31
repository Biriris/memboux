import { describe, expect, it } from "vitest";
import { adminShell } from "../src/views/admin";
import type { AdminIdentity } from "../src/admin-rbac";

const actor = (role: AdminIdentity["role"]): AdminIdentity => ({
  memberId: `member-${role}`,
  userId: `user-${role}`,
  name: "Test Admin",
  email: `${role}@memboux.com`,
  role,
});

describe("role-scoped admin navigation", () => {
  it("shows the complete security navigation only to the Platform Owner", () => {
    const html = adminShell("Admin", "<main></main>", "el", actor("owner"));
    expect(html).toContain("Platform Owner / Superadmin");
    expect(html).toContain('href="/admin/profile"');
    expect(html).toContain('href="/admin/team"');
    expect(html).toContain('href="/admin/readiness"');
  });

  it("keeps support staff inside the support and read-only context they need", () => {
    const html = adminShell("Support", "<main></main>", "el", actor("support"));
    expect(html).toContain('href="/admin/support"');
    expect(html).toContain('href="/admin/profile"');
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('href="/admin/events"');
    expect(html).not.toContain('href="/admin/team"');
    expect(html).not.toContain('href="/admin/accounts"');
    expect(html).not.toContain('href="/admin/readiness"');
  });

  it("gives finance its assigned-ticket queue without team or moderation access", () => {
    const html = adminShell("Finance", "<main></main>", "en", actor("finance"));
    expect(html).toContain('href="/admin/accounts"');
    expect(html).toContain('href="/admin/support"');
    expect(html).toContain('href="/admin/profile"');
    expect(html).not.toContain('href="/admin/team"');
    expect(html).not.toContain('href="/admin/reported"');
  });

  it("gives Trust & Safety both its assigned queue and moderation tools", () => {
    const html = adminShell("Trust", "<main></main>", "en", actor("moderator"));
    expect(html).toContain('href="/admin/support"');
    expect(html).toContain('href="/admin/profile"');
    expect(html).toContain('href="/admin/reported"');
    expect(html).not.toContain('href="/admin/team"');
    expect(html).not.toContain('href="/admin/accounts"');
  });
});
