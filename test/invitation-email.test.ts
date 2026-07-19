import { describe, expect, it } from "vitest";
import { eventInvitationInstruction } from "../src/routes/events";

describe("event invitation email copy", () => {
  it("asks registered recipients to sign in", () => {
    expect(eventInvitationInstruction(true, "en")).toBe("Sign in and accept the invitation.");
    expect(eventInvitationInstruction(true, "el")).toBe("Συνδέσου και αποδέξου την πρόσκληση.");
  });

  it("asks new recipients to register with the invited email", () => {
    expect(eventInvitationInstruction(false, "en")).toContain("Create an account with this email");
    expect(eventInvitationInstruction(false, "el")).toContain("Δημιούργησε λογαριασμό με αυτό το email");
  });
});
