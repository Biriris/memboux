import { describe, expect, it } from "vitest";
import {
  decryptDriveRefreshToken,
  driveExportFilename,
  encryptDriveRefreshToken,
  GOOGLE_DRIVE_REDIRECT_URI,
  GOOGLE_DRIVE_SCOPE,
  googleDriveAuthorizationUrl,
  sanitizeDriveFolderName,
} from "../src/google-drive";

describe("Google Drive connection security", () => {
  it("encrypts refresh tokens and binds them to the owning user", async () => {
    const encrypted = await encryptDriveRefreshToken("a-long-production-secret", "user-1", "refresh-token-value");

    expect(encrypted.encryptedToken).not.toContain("refresh-token-value");
    expect(encrypted.iv).not.toHaveLength(0);
    await expect(decryptDriveRefreshToken(
      "a-long-production-secret",
      "user-1",
      encrypted.encryptedToken,
      encrypted.iv,
    )).resolves.toBe("refresh-token-value");
    await expect(decryptDriveRefreshToken(
      "a-long-production-secret",
      "user-2",
      encrypted.encryptedToken,
      encrypted.iv,
    )).rejects.toBeTruthy();
  });

  it("requests only the app-specific Drive scope and offline access", () => {
    const authorization = new URL(googleDriveAuthorizationUrl("client-id", "csrf-state"));

    expect(authorization.origin).toBe("https://accounts.google.com");
    expect(authorization.searchParams.get("scope")).toBe(GOOGLE_DRIVE_SCOPE);
    expect(authorization.searchParams.get("redirect_uri")).toBe(GOOGLE_DRIVE_REDIRECT_URI);
    expect(authorization.searchParams.get("access_type")).toBe("offline");
    expect(authorization.searchParams.get("state")).toBe("csrf-state");
  });
});

describe("Google Drive export names", () => {
  it("uses chronological sequence numbers and MIME-derived extensions", () => {
    expect(driveExportFilename(1, "image/jpeg", "media/no-extension")).toBe("0001.jpg");
    expect(driveExportFilename(23, "video/quicktime", "media/video.bin")).toBe("0023.mov");
    expect(driveExportFilename(4, "application/octet-stream", "media/file.custom")).toBe("0004.custom");
  });

  it("removes control characters from event folder names", () => {
    expect(sanitizeDriveFolderName("  Summer\u0000   trip  ")).toBe("Summer trip");
    expect(sanitizeDriveFolderName("\u0000\n")).toBe("Memboux event");
  });
});
