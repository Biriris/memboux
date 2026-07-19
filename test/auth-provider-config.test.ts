import { describe, expect, it } from "vitest";
import { facebookAuthEnabled } from "../src/auth";

describe("Facebook authentication rollout", () => {
  it("requires both credentials before enabling the provider", () => {
    expect(facebookAuthEnabled({})).toBe(false);
    expect(facebookAuthEnabled({ FACEBOOK_CLIENT_ID: "app-id" })).toBe(false);
    expect(facebookAuthEnabled({ FACEBOOK_CLIENT_SECRET: "secret" })).toBe(false);
    expect(facebookAuthEnabled({ FACEBOOK_CLIENT_ID: "  ", FACEBOOK_CLIENT_SECRET: "secret" })).toBe(false);
    expect(facebookAuthEnabled({ FACEBOOK_CLIENT_ID: "app-id", FACEBOOK_CLIENT_SECRET: "secret" })).toBe(true);
  });
});
