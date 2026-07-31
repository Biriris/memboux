import { describe, expect, it } from "vitest";
import { supportFirstResponseDueAt, supportPriority, supportSlaState } from "../src/support-sla";

describe("support SLA policy", () => {
  it("prioritizes privacy and safety ahead of ordinary requests", () => {
    expect(supportPriority("privacy")).toBe("urgent");
    expect(supportPriority("moderation")).toBe("urgent");
    expect(supportPriority("billing")).toBe("high");
    expect(supportPriority("technical")).toBe("normal");
  });

  it("tracks overdue, at-risk and met first responses", () => {
    const now = 1_000_000;
    expect(supportSlaState(now - 1, null, now)).toBe("overdue");
    expect(supportSlaState(now + 30 * 60_000, null, now)).toBe("at_risk");
    expect(supportSlaState(now + 2 * 60 * 60_000, null, now)).toBe("on_track");
    expect(supportSlaState(now - 1, now - 2, now)).toBe("met");
    expect(supportFirstResponseDueAt("privacy", now).dueAt).toBe(now + 60 * 60_000);
  });
});
