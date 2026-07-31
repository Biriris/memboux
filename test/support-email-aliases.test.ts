import { describe, expect, it } from "vitest";
import { supportAliasTestAddress } from "../src/routes/admin";

describe("professional email alias tests", () => {
  it("allows only the two owned Memboux support aliases", () => {
    expect(supportAliasTestAddress("support")).toBe("support@memboux.com");
    expect(supportAliasTestAddress("info")).toBe("info@memboux.com");
    expect(supportAliasTestAddress("owner@example.com")).toBeNull();
    expect(supportAliasTestAddress("support@memboux.com")).toBeNull();
    expect(supportAliasTestAddress("__proto__")).toBeNull();
  });
});
