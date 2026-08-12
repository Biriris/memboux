import { describe, expect, it } from "vitest";
import { normalizeAlbumSlug } from "../src/event-media-hub";
import { createStoredZip, safeZipName } from "../src/zip-stream";

async function collect(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

describe("event media hub", () => {
  it("creates stable URL-safe album slugs", () => {
    expect(normalizeAlbumSlug("  Photo Booth & Friends  ")).toBe("photo-booth-friends");
    expect(normalizeAlbumSlug("../../private\\album")).toBe("private-album");
    expect(normalizeAlbumSlug("---")).toBe("album");
  });

  it("removes path traversal from ZIP entry names", () => {
    expect(safeZipName("../Family/../../photo.jpg")).toBe("Family/photo.jpg");
  });

  it("streams a standards-compatible ZIP envelope without buffering R2 objects", async () => {
    const content = new TextEncoder().encode("memboux");
    const output = await collect(createStoredZip([{
      name: "album/moment.txt",
      size: content.byteLength,
      open: async () => new Blob([content]).stream() as ReadableStream<Uint8Array>,
    }]));
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(output.byteLength - 22, true)).toBe(0x06054b50);
    expect(new TextDecoder().decode(output)).toContain("album/moment.txt");
    expect(new TextDecoder().decode(output)).toContain("memboux");
  });
});
