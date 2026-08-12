import type { EventType } from "./event-types";

type VerticalProfileSnapshot = {
  headline: string;
  host_name: string;
  introduction: string;
  story: string;
  schedule_notes: string;
  guest_notes: string;
  contact_email: string;
  theme_key: "signature" | "vivid" | "editorial" | "minimal";
  wizard_step: number;
  wizard_completed_at: number | null;
  publish_status: "draft" | "published";
  custom_fields_json: string;
};

function validSnapshot(value: unknown): VerticalProfileSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const theme = ["signature", "vivid", "editorial", "minimal"].includes(String(row.theme_key))
    ? String(row.theme_key) as VerticalProfileSnapshot["theme_key"]
    : "signature";
  const publish = row.publish_status === "published" ? "published" : "draft";
  const wizardStep = Math.max(1, Math.min(4, Math.floor(Number(row.wizard_step) || 1)));
  const text = (key: string, max: number) => String(row[key] ?? "").slice(0, max);
  return {
    headline: text("headline", 120),
    host_name: text("host_name", 120),
    introduction: text("introduction", 600),
    story: text("story", 2_000),
    schedule_notes: text("schedule_notes", 2_000),
    guest_notes: text("guest_notes", 2_000),
    contact_email: text("contact_email", 254),
    theme_key: theme,
    wizard_step: wizardStep,
    wizard_completed_at: Number.isSafeInteger(row.wizard_completed_at) ? Number(row.wizard_completed_at) : null,
    publish_status: publish,
    custom_fields_json: text("custom_fields_json", 20_000) || "{}",
  };
}

export async function changeEventType(db: D1Database, input: {
  eventId: string;
  eventName: string;
  from: EventType;
  to: EventType;
  changedByUserId: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const transitionId = crypto.randomUUID();
  const activeProfile = input.from === "wedding"
    ? null
    : await db.prepare("SELECT * FROM event_vertical_profiles WHERE event_id=?")
      .bind(input.eventId).first<Record<string, unknown>>();
  const restoreRow = input.to === "wedding"
    ? null
    : await db.prepare(`SELECT vertical_profile_json FROM event_type_transitions
        WHERE event_id=? AND from_event_type=? AND vertical_profile_json IS NOT NULL
        ORDER BY changed_at DESC LIMIT 1`)
      .bind(input.eventId, input.to)
      .first<{ vertical_profile_json: string }>();
  let restored: VerticalProfileSnapshot | null = null;
  if (restoreRow?.vertical_profile_json) {
    try {
      restored = validSnapshot(JSON.parse(restoreRow.vertical_profile_json));
    } catch {
      restored = null;
    }
  }

  const statements = [
    db.prepare(`INSERT INTO event_type_transitions
      (id,event_id,from_event_type,to_event_type,vertical_profile_json,changed_by_user_id,changed_at)
      SELECT ?,?,?,?,?,?,? FROM events WHERE id=? AND event_type=?`)
      .bind(
        transitionId,
        input.eventId,
        input.from,
        input.to,
        activeProfile ? JSON.stringify(activeProfile) : null,
        input.changedByUserId,
        now,
        input.eventId,
        input.from,
      ),
    db.prepare(`UPDATE events SET event_type=?,updated_at=?
      WHERE id=? AND event_type=? AND EXISTS (SELECT 1 FROM event_type_transitions WHERE id=?)`)
      .bind(input.to, now, input.eventId, input.from, transitionId),
    db.prepare(`DELETE FROM event_vertical_profiles
      WHERE event_id=? AND EXISTS (SELECT 1 FROM event_type_transitions WHERE id=?)`)
      .bind(input.eventId, transitionId),
  ];

  if (input.to !== "wedding") {
    const profile = restored ?? {
      headline: input.eventName,
      host_name: input.eventName,
      introduction: "",
      story: "",
      schedule_notes: "",
      guest_notes: "",
      contact_email: "",
      theme_key: "signature" as const,
      wizard_step: 1,
      wizard_completed_at: null,
      publish_status: "draft" as const,
      custom_fields_json: "{}",
    };
    statements.push(db.prepare(`INSERT INTO event_vertical_profiles
      (event_id,headline,host_name,introduction,story,schedule_notes,guest_notes,contact_email,
       theme_key,wizard_step,wizard_completed_at,publish_status,updated_at,custom_fields_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?
      WHERE EXISTS (SELECT 1 FROM event_type_transitions WHERE id=?)`)
      .bind(
        input.eventId, profile.headline, profile.host_name, profile.introduction, profile.story,
        profile.schedule_notes, profile.guest_notes, profile.contact_email, profile.theme_key,
        profile.wizard_step, profile.wizard_completed_at, profile.publish_status, now,
        profile.custom_fields_json,
        transitionId,
      ));
  }

  const results = await db.batch(statements);
  return { changed: Number(results[1]?.meta.changes ?? 0) === 1, restored: Boolean(restored) };
}
