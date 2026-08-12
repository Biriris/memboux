import { describe, expect, it } from "vitest";
import migration from "../migrations/0068_free_plan_and_event_packages.sql?raw";

describe("0068 free plan and event packages migration", () => {
  it("raises enforced preview and free-plan capacity without enabling checkout", () => {
    expect(migration).toContain("MAX(media_limit, 50)");
    expect(migration).toContain("37 * 86400000");
    expect(migration).toContain("name_en='Moments'");
    expect(migration).toContain("name_en='Celebration'");
    expect(migration).toContain("checkout_enabled=0");
  });
});
