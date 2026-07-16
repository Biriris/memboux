import { describe, expect, it } from "vitest";
import { formatSubscriptionMoney, subscriptionBadge } from "../src/routes/admin-users";

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
