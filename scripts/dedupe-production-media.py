#!/usr/bin/env python3
"""Audit active Memboux media and optionally move confirmed duplicates to Trash.

The comparison is scoped to each event. Images are decoded, EXIF orientation is
applied, and every rendered frame/pixel is hashed. Filenames are never used.
The script also backfills the canonical upload fingerprint used by the Worker.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from typing import Any

from PIL import Image, ImageOps, ImageSequence


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NODE = shutil.which("node") or "node"
WRANGLER = os.path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js")
DATABASE = "memboux-db"
BUCKET = "memboux-media"
RETENTION_MS = 30 * 24 * 60 * 60 * 1000


def run_wrangler(*args: str, binary: bool = False) -> bytes | str:
    command = [NODE, WRANGLER, *args]
    result = subprocess.run(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(
            f"Wrangler failed ({result.returncode}): {' '.join(command)}\n"
            + result.stderr.decode("utf-8", errors="replace")
        )
    return result.stdout if binary else result.stdout.decode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_ranges(prefix: str, data: bytes, ranges: list[tuple[int, int]]) -> str:
    parts = [f"{end - start}:{sha256(data[start:end])}" for start, end in ranges]
    return sha256((prefix + "\0" + "\0".join(parts)).encode("utf-8"))


def canonical_jpeg(data: bytes) -> str | None:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    ranges = [(0, 2)]
    offset = 2
    while offset < len(data):
        marker_start = offset
        if data[offset] != 0xFF:
            return None
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            return None
        marker = data[offset]
        offset += 1
        if marker == 0xDA:
            ranges.append((marker_start, len(data)))
            return canonical_ranges("memboux-jpeg-v1", data, ranges)
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            ranges.append((marker_start, offset))
            if marker == 0xD9:
                return canonical_ranges("memboux-jpeg-v1", data, ranges)
            continue
        if offset + 2 > len(data):
            return None
        length = int.from_bytes(data[offset : offset + 2], "big")
        segment_end = offset + length
        if length < 2 or segment_end > len(data):
            return None
        if not (0xE0 <= marker <= 0xEF or marker == 0xFE):
            ranges.append((marker_start, segment_end))
        offset = segment_end
    return None


def canonical_png(data: bytes) -> str | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    ranges = [(0, 8)]
    offset = 8
    while offset + 12 <= len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        end = offset + 12 + length
        if end > len(data):
            return None
        chunk_type = data[offset + 4 : offset + 8]
        if not (chunk_type[0] & 0x20):
            ranges.append((offset, end))
        offset = end
        if chunk_type == b"IEND":
            return canonical_ranges("memboux-png-v1", data, ranges)
    return None


def canonical_webp(data: bytes) -> str | None:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    ranges = [(8, 12)]
    offset = 12
    while offset + 8 <= len(data):
        chunk_type = data[offset : offset + 4]
        length = int.from_bytes(data[offset + 4 : offset + 8], "little")
        end = offset + 8 + length + (length % 2)
        if end > len(data):
            return None
        if chunk_type not in {b"EXIF", b"XMP ", b"ICCP"}:
            ranges.append((offset, end))
        offset = end
    return canonical_ranges("memboux-webp-v1", data, ranges) if len(ranges) > 1 else None


def canonical_hash(data: bytes, content_type: str, exact_hash: str) -> str:
    media_type = content_type.lower().split(";", 1)[0]
    if media_type in {"image/jpeg", "image/jpg"}:
        return canonical_jpeg(data) or exact_hash
    if media_type == "image/png":
        return canonical_png(data) or exact_hash
    if media_type == "image/webp":
        return canonical_webp(data) or exact_hash
    return exact_hash


def rendered_image_hash(data: bytes) -> str:
    digest = hashlib.sha256(b"memboux-rendered-pixels-v1\0")
    with Image.open(io.BytesIO(data)) as source:
        for index, frame in enumerate(ImageSequence.Iterator(source)):
            rendered = ImageOps.exif_transpose(frame).convert("RGBA")
            digest.update(index.to_bytes(4, "big"))
            digest.update(rendered.width.to_bytes(4, "big"))
            digest.update(rendered.height.to_bytes(4, "big"))
            digest.update(rendered.tobytes())
    return digest.hexdigest()


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def load_active_media() -> list[dict[str, Any]]:
    query = """
      SELECT m.id,m.event_id,e.code,m.object_key,m.media_type,m.content_type,
             m.uploaded_at,m.content_hash,m.canonical_hash,m.size_bytes
      FROM media m JOIN events e ON e.id=m.event_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.event_id,m.uploaded_at,m.id
    """
    raw = run_wrangler("d1", "execute", DATABASE, "--remote", "--json", "--command", query)
    payload = json.loads(raw)
    return payload[0]["results"]


def duplicate_sql(duplicate: dict[str, Any], keeper: dict[str, Any], now: int) -> list[str]:
    duplicate_id = sql_literal(duplicate["id"])
    keeper_id = sql_literal(keeper["id"])
    event_id = sql_literal(duplicate["event_id"])
    return [
        f"UPDATE event_covers SET source_media_id={keeper_id} WHERE event_id={event_id} AND source_media_id={duplicate_id}",
        f"INSERT OR IGNORE INTO official_album_items(event_id,media_id,added_by,position,created_at) SELECT event_id,{keeper_id},added_by,position,created_at FROM official_album_items WHERE event_id={event_id} AND media_id={duplicate_id}",
        f"DELETE FROM official_album_items WHERE event_id={event_id} AND media_id={duplicate_id}",
        f"INSERT OR IGNORE INTO media_likes(media_id,actor_key,created_at) SELECT {keeper_id},actor_key,created_at FROM media_likes WHERE media_id={duplicate_id}",
        f"DELETE FROM media_likes WHERE media_id={duplicate_id}",
        f"UPDATE media_comments SET media_id={keeper_id} WHERE event_id={event_id} AND media_id={duplicate_id}",
        f"UPDATE media SET deleted_at={now},purge_at={now + RETENTION_MS},canonical_hash={sql_literal(duplicate['computed_canonical'])} WHERE id={duplicate_id} AND deleted_at IS NULL",
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Move confirmed duplicates to the 30-day Trash and backfill fingerprints")
    args = parser.parse_args()

    rows = load_active_media()
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    failures: list[dict[str, str]] = []
    canonical_mismatches: list[dict[str, str]] = []

    for position, row in enumerate(rows, start=1):
        exact_hash = row.get("content_hash") or ""
        if row["media_type"] == "image":
            try:
                data = run_wrangler("r2", "object", "get", f"{BUCKET}/{row['object_key']}", "--remote", "--pipe", binary=True)
                actual_hash = sha256(data)
                if exact_hash and actual_hash != exact_hash:
                    raise ValueError("R2 bytes do not match the stored content hash")
                exact_hash = actual_hash
                row["computed_canonical"] = canonical_hash(data, row["content_type"], actual_hash)
                row["comparison_hash"] = rendered_image_hash(data)
            except Exception as error:  # keep the file; never dedupe an undecodable image
                failures.append({"id": row["id"], "error": str(error)})
                row["computed_canonical"] = row.get("canonical_hash") or exact_hash
                row["comparison_hash"] = f"unverified:{row['id']}"
        else:
            row["computed_canonical"] = row.get("canonical_hash") or exact_hash
            row["comparison_hash"] = f"exact:{exact_hash}" if exact_hash else f"unverified:{row['id']}"
        if row.get("canonical_hash") and row["computed_canonical"] != row["canonical_hash"]:
            canonical_mismatches.append({
                "id": row["id"],
                "stored": row["canonical_hash"],
                "computed": row["computed_canonical"],
            })
        groups[(row["event_id"], row["comparison_hash"])].append(row)
        print(f"Audited {position}/{len(rows)}", file=sys.stderr)

    duplicate_groups = [sorted(group, key=lambda item: (item["uploaded_at"], item["id"])) for group in groups.values() if len(group) > 1]
    duplicates = [item for group in duplicate_groups for item in group[1:]]
    keepers = [group[0] for group in duplicate_groups]

    if args.apply:
        now = int(time.time() * 1000)
        statements: list[str] = []
        for group in duplicate_groups:
            keeper = group[0]
            for duplicate in group[1:]:
                statements.extend(duplicate_sql(duplicate, keeper, now))
        for row in rows:
            if row not in duplicates and not row.get("canonical_hash") and row.get("computed_canonical"):
                statements.append(
                    f"UPDATE media SET canonical_hash={sql_literal(row['computed_canonical'])} WHERE id={sql_literal(row['id'])} AND deleted_at IS NULL"
                )
        if statements:
            run_wrangler("d1", "execute", DATABASE, "--remote", "--command", ";".join(statements) + ";")

    summary = {
        "mode": "apply" if args.apply else "audit",
        "active_media_audited": len(rows),
        "image_decode_failures": failures,
        "canonical_mismatches": canonical_mismatches,
        "duplicate_groups": [
            {
                "event_code": group[0]["code"],
                "keeper": group[0]["id"],
                "duplicates": [item["id"] for item in group[1:]],
            }
            for group in duplicate_groups
        ],
        "duplicates_moved_to_trash": len(duplicates) if args.apply else 0,
        "fingerprints_backfilled": sum(1 for row in rows if not row.get("canonical_hash")),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if not failures and not canonical_mismatches else 2


if __name__ == "__main__":
    raise SystemExit(main())
