import { describe, expect, it } from "vitest";
import { getLaunchReadiness } from "../src/launch-readiness";

const technicalEnvironment = {
  BETTER_AUTH_SECRET: "a".repeat(48),
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  RESEND_API_KEY: "resend-key",
  ADMIN_PASSWORD: "a-strong-admin-password",
};

describe("launch readiness", () => {
  it("reports technical readiness without exposing configuration values", () => {
    const result = getLaunchReadiness(technicalEnvironment);
    expect(result.technicalReady).toBe(true);
    expect(result.commercialReady).toBe(false);
    expect(JSON.stringify(result)).not.toContain("google-secret");
    expect(JSON.stringify(result)).not.toContain("resend-key");
  });

  it("keeps commercial launch blocked until identity and billing are complete", () => {
    const result = getLaunchReadiness({
      ...technicalEnvironment,
      BUSINESS_LEGAL_NAME: "Memboux Example Business",
      BUSINESS_POSTAL_ADDRESS: "1 Example Street, Athens",
      PRIVACY_EMAIL: "privacy@memboux.com",
      SUPPORT_EMAIL: "support@memboux.com",
    });
    expect(result.checks.find((check) => check.key === "legal_identity")?.ready).toBe(true);
    expect(result.checks.find((check) => check.key === "billing")?.ready).toBe(false);
    expect(result.commercialReady).toBe(false);
  });

  it("rejects weak or malformed configuration", () => {
    const result = getLaunchReadiness({
      BETTER_AUTH_SECRET: "short",
      ADMIN_PASSWORD: "short",
      PRIVACY_EMAIL: "not-an-email",
    });
    expect(result.technicalReady).toBe(false);
    expect(result.commercialReady).toBe(false);
  });
});
