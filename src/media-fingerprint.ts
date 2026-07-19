import { sha256, sha256Bytes } from "./utils";

type ByteRange = readonly [start: number, end: number];

async function hashRanges(prefix: string, bytes: ArrayBuffer, ranges: ByteRange[]) {
  const parts = await Promise.all(
    ranges.map(async ([start, end]) => `${end - start}:${await sha256Bytes(bytes.slice(start, end))}`),
  );
  return sha256(`${prefix}\0${parts.join("\0")}`);
}

async function canonicalJpegHash(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  if (view.length < 4 || view[0] !== 0xff || view[1] !== 0xd8) return null;
  const ranges: ByteRange[] = [[0, 2]];
  let offset = 2;

  while (offset < view.length) {
    const markerStart = offset;
    if (view[offset] !== 0xff) return null;
    while (offset < view.length && view[offset] === 0xff) offset += 1;
    if (offset >= view.length) return null;
    const marker = view[offset++];

    if (marker === 0xda) {
      ranges.push([markerStart, view.length]);
      return hashRanges("memboux-jpeg-v1", bytes, ranges);
    }

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      ranges.push([markerStart, offset]);
      if (marker === 0xd9) return hashRanges("memboux-jpeg-v1", bytes, ranges);
      continue;
    }

    if (offset + 2 > view.length) return null;
    const length = (view[offset] << 8) | view[offset + 1];
    if (length < 2 || offset + length > view.length) return null;
    const segmentEnd = offset + length;
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) ranges.push([markerStart, segmentEnd]);
    offset = segmentEnd;
  }
  return null;
}

async function canonicalPngHash(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (view.length < 12 || !signature.every((value, index) => view[index] === value)) return null;
  const ranges: ByteRange[] = [[0, 8]];
  let offset = 8;
  while (offset + 12 <= view.length) {
    const length = ((view[offset] << 24) | (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3]) >>> 0;
    const end = offset + 12 + length;
    if (end > view.length) return null;
    const critical = (view[offset + 4] & 0x20) === 0;
    if (critical) ranges.push([offset, end]);
    const isEnd = String.fromCharCode(...view.subarray(offset + 4, offset + 8)) === "IEND";
    offset = end;
    if (isEnd) return hashRanges("memboux-png-v1", bytes, ranges);
  }
  return null;
}

async function canonicalWebpHash(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  const ascii = (start: number, end: number) => String.fromCharCode(...view.subarray(start, end));
  if (view.length < 12 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  const ranges: ByteRange[] = [[8, 12]];
  let offset = 12;
  while (offset + 8 <= view.length) {
    const type = ascii(offset, offset + 4);
    const length = view[offset + 4] | (view[offset + 5] << 8) | (view[offset + 6] << 16) | (view[offset + 7] << 24);
    const paddedLength = length + (length % 2);
    const end = offset + 8 + paddedLength;
    if (length < 0 || end > view.length) return null;
    if (type !== "EXIF" && type !== "XMP " && type !== "ICCP") ranges.push([offset, end]);
    offset = end;
  }
  return ranges.length > 1 ? hashRanges("memboux-webp-v1", bytes, ranges) : null;
}

export async function mediaCanonicalHash(bytes: ArrayBuffer, contentType: string, exactHash?: string) {
  const type = contentType.toLowerCase().split(";", 1)[0];
  const canonical = type === "image/jpeg" || type === "image/jpg"
    ? await canonicalJpegHash(bytes)
    : type === "image/png"
      ? await canonicalPngHash(bytes)
      : type === "image/webp"
        ? await canonicalWebpHash(bytes)
        : null;
  return canonical ?? exactHash ?? sha256Bytes(bytes);
}

export function isCanonicalDuplicateConstraint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed:\s*media\.event_id,\s*media\.canonical_hash/i.test(message)
    || /idx_media_event_canonical_hash/i.test(message);
}
