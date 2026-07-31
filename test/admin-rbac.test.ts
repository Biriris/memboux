import { describe, expect, it } from "vitest";
import {
  adminCan,
  adminHomeForRole,
  adminRoleProfiles,
  isAdminRole,
  permissionForAdminRequest,
  rolePermissions,
} from "../src/admin-rbac";

describe("admin RBAC", () => {
  it("keeps team management exclusive to owners", () => {
    expect(adminCan("owner", "team.manage")).toBe(true);
    expect(adminCan("administrator", "team.manage")).toBe(false);
    expect(adminCan("support", "team.manage")).toBe(false);
  });

  it("applies least privilege to specialist roles", () => {
    expect(rolePermissions.support).toContain("support.write");
    expect(rolePermissions.support).not.toContain("billing.write");
    expect(rolePermissions.finance).toContain("billing.write");
    expect(rolePermissions.finance).toContain("support.write");
    expect(rolePermissions.analyst).not.toContain("users.write");
    expect(rolePermissions.moderator).toContain("moderation.write");
    expect(rolePermissions.moderator).toContain("support.write");
  });

  it("maps routes and destructive actions to permissions", () => {
    expect(permissionForAdminRequest("/admin/team", "GET")).toBe("team.manage");
    expect(permissionForAdminRequest("/admin/profile", "GET")).toBe("support.read");
    expect(permissionForAdminRequest("/admin/profile", "POST")).toBe("support.read");
    expect(permissionForAdminRequest("/admin/profile/test-notification", "POST")).toBe("support.read");
    expect(permissionForAdminRequest("/admin/support/123/reply", "POST")).toBe("support.write");
    expect(permissionForAdminRequest("/admin/accounts/user", "POST")).toBe("billing.write");
    expect(permissionForAdminRequest("/admin/users/user-1/delete", "POST")).toBe("users.delete");
    expect(permissionForAdminRequest("/admin/events/ABC/delete", "POST")).toBe("events.delete");
    expect(permissionForAdminRequest("/admin/readiness/test-email", "POST")).toBe("system.read");
  });

  it("rejects unknown roles", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("superadmin")).toBe(false);
    expect(isAdminRole("admin")).toBe(false);
  });

  it("uses a clear hierarchy and sends specialists to their own workspace", () => {
    expect(adminRoleProfiles.owner.level).toBeGreaterThan(adminRoleProfiles.administrator.level);
    expect(adminRoleProfiles.administrator.level).toBeGreaterThan(adminRoleProfiles.support.level);
    expect(adminRoleProfiles.owner.label.el).toContain("Superadmin");
    expect(adminHomeForRole("support")).toBe("/admin/support");
    expect(adminHomeForRole("finance")).toBe("/admin/accounts");
    expect(adminHomeForRole("moderator")).toBe("/admin/reported");
    expect(adminHomeForRole("owner")).toBe("/admin/users");
  });
});
