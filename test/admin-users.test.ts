import { describe, expect, it } from "vitest";
import {
  adminUserOrderBy,
  editableAdminEventRole,
  formatSubscriptionMoney,
  normalizeAdminUserPage,
  normalizeAdminUserPageSize,
  subscriptionBadge,
} from "../src/routes/admin-users";

describe("admin user billing presentation", () => {
  it("formats subscription amounts in the requested locale", () => {
    expect(formatSubscriptionMoney(2900, "EUR", "en")).toContain("29.00");
    expect(formatSubscriptionMoney(2900, "EUR", "el")).toContain("29,00");
  });

  it("distinguishes active billing from no subscription", () => {
    expect(subscriptionBadge("active", "en")).toContain("Active");
    expect(subscriptionBadge("active", "el")).toContain("Ενεργή");
    expect(subscriptionBadge("none", "en")).toContain("No subscription");
  });

  it("does not crash on an unknown currency code", () => {
    expect(formatSubscriptionMoney(1200, "INVALID", "en")).toBe("12.00 INVALID");
  });
});

describe("admin user list controls", () => {
  it("normalizes pagination without allowing unbounded page sizes", () => {
    expect(normalizeAdminUserPage("3")).toBe(3);
    expect(normalizeAdminUserPage("-2")).toBe(1);
    expect(normalizeAdminUserPageSize("50")).toBe(50);
    expect(normalizeAdminUserPageSize("5000")).toBe(25);
  });

  it("uses a fixed sorting whitelist", () => {
    expect(adminUserOrderBy("storage_desc")).toContain("used_bytes DESC");
    expect(adminUserOrderBy("DROP TABLE user")).toBe("u.createdAt DESC");
  });

  it("only allows non-owner membership roles in the quick control", () => {
    expect(editableAdminEventRole("editor")).toBe("editor");
    expect(editableAdminEventRole("viewer")).toBe("viewer");
    expect(editableAdminEventRole("owner")).toBeNull();
  });
});
