export type QrDesignConfig = {
  family: string;
  format: string;
  copy: string;
  destination: string;
  title: string;
  heading: string;
  subtitle: string;
  background: string;
  accent: string;
  ink: string;
};

export type QrDesignRow = {
  id: string;
  event_id: string;
  name: string;
  config_json: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
};

const colorPattern = /^#[0-9a-f]{6}$/i;
const keyPattern = /^[a-z0-9_-]{1,80}$/i;

function bounded(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeQrDesignConfig(value: unknown): QrDesignConfig | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const config: QrDesignConfig = {
    family: bounded(input.family, 32),
    format: bounded(input.format, 16),
    copy: bounded(input.copy, 32),
    destination: bounded(input.destination, 80),
    title: bounded(input.title, 70),
    heading: bounded(input.heading, 70),
    subtitle: bounded(input.subtitle, 140),
    background: bounded(input.background, 7),
    accent: bounded(input.accent, 7),
    ink: bounded(input.ink, 7),
  };
  if (![config.family, config.format, config.copy, config.destination].every((item) => keyPattern.test(item))) return null;
  if (![config.background, config.accent, config.ink].every((item) => colorPattern.test(item))) return null;
  return config;
}

export async function listQrDesigns(db: D1Database, eventId: string) {
  const result = await db.prepare(`SELECT * FROM event_qr_designs
    WHERE event_id=? ORDER BY updated_at DESC LIMIT 50`).bind(eventId).all<QrDesignRow>();
  return result.results.flatMap((row) => {
    try {
      const config = normalizeQrDesignConfig(JSON.parse(row.config_json));
      return config ? [{ id: row.id, name: row.name, config, updatedAt: row.updated_at }] : [];
    } catch {
      return [];
    }
  });
}
