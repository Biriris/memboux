import { describe, expect, it } from "vitest";
import { adminCanAccessSupportConversation, roleCanReceiveSupportWork } from "../src/support-access";

const admin = (memberId: string, role: "owner" | "administrator" | "support" | "finance" | "moderator") => ({
  memberId,
  role,
});

describe("support conversation access", () => {
  it("lets owners and operations administrators oversee every queue", () => {
    const assignedElsewhere = { assigned_admin_member_id: "other", required_role: "finance" };
    expect(adminCanAccessSupportConversation(admin("owner-1", "owner"), assignedElsewhere)).toBe(true);
    expect(adminCanAccessSupportConversation(admin("admin-1", "administrator"), assignedElsewhere)).toBe(true);
  });

  it("allows a specialist to claim an unassigned ticket for their role", () => {
    const unassigned = { assigned_admin_member_id: null, required_role: "finance" };
    expect(adminCanAccessSupportConversation(admin("finance-1", "finance"), unassigned)).toBe(true);
    expect(adminCanAccessSupportConversation(admin("support-1", "support"), unassigned)).toBe(false);
  });

  it("prevents coworkers in the same department from opening each other's assigned ticket", () => {
    const assigned = { assigned_admin_member_id: "finance-1", required_role: "finance" };
    expect(adminCanAccessSupportConversation(admin("finance-1", "finance"), assigned)).toBe(true);
    expect(adminCanAccessSupportConversation(admin("finance-2", "finance"), assigned)).toBe(false);
  });

  it("aligns departmental roles with the queues that can receive work", () => {
    expect(roleCanReceiveSupportWork("finance")).toBe(true);
    expect(roleCanReceiveSupportWork("moderator")).toBe(true);
    expect(roleCanReceiveSupportWork("support")).toBe(true);
    expect(roleCanReceiveSupportWork("analyst")).toBe(false);
  });
});
