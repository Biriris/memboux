import { describe, expect, it } from "vitest";
import { mediaCanonicalHash, multipartMediaContentHash } from "../src/media-fingerprint";
import { sha256Bytes } from "../src/utils";

const jpeg = (metadata: number[]) => new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, metadata.length + 2, ...metadata,
  0xff, 0xdb, 0x00, 0x04, 0x11, 0x22,
  0xff, 0xda, 0x00, 0x04, 0x33, 0x44,
  0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9,
]).buffer;

describe("media canonical fingerprints", () => {
  it("ignores JPEG metadata while preserving the encoded image payload", async () => {
    const first = jpeg([1, 2]);
    const second = jpeg([9, 8, 7, 6]);
    expect(await sha256Bytes(first)).not.toBe(await sha256Bytes(second));
    expect(await mediaCanonicalHash(first, "image/jpeg")).toBe(await mediaCanonicalHash(second, "image/jpeg"));
  });

  it("does not merge different JPEG image payloads", async () => {
    const first = new Uint8Array(jpeg([1, 2]));
    const second = new Uint8Array(jpeg([1, 2]));
    second[second.length - 3] ^= 1;
    expect(await mediaCanonicalHash(first.buffer, "image/jpeg")).not.toBe(await mediaCanonicalHash(second.buffer, "image/jpeg"));
  });

  it("builds deterministic multipart hashes from the actual part fingerprints", async () => {
    const parts = [
      { partNumber: 1, sizeBytes: 6, hash: "a".repeat(64) },
      { partNumber: 2, sizeBytes: 2, hash: "b".repeat(64) },
    ];
    const first = await multipartMediaContentHash(8, 6, parts);
    const repeated = await multipartMediaContentHash(8, 6, parts.map((part) => ({ ...part })));
    const changed = await multipartMediaContentHash(8, 6, [parts[0], { ...parts[1], hash: "c".repeat(64) }]);
    expect(repeated).toBe(first);
    expect(changed).not.toBe(first);
  });
});
