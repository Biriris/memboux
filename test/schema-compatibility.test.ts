import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migration from "../migrations/0060_expand_event_types_and_locales.sql?raw";
import { eventTypes } from "../src/event-types";
import { supportedLocales } from "../src/i18n";

const preMigrationSchema = `
  CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    couple TEXT NOT NULL,
    admin_token_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    notes TEXT NOT NULL DEFAULT '',
    updated_at INTEGER,
    default_locale TEXT NOT NULL DEFAULT 'el' CHECK (default_locale IN ('el', 'en')),
    eventName TEXT,
    event_start_date TEXT,
    event_end_date TEXT,
    deleted_at INTEGER,
    purge_at INTEGER,
    gallery_pin_hash TEXT,
    location TEXT,
    location_place_id TEXT,
    location_lat REAL,
    location_lng REAL,
    location_provider TEXT,
    event_type TEXT NOT NULL DEFAULT 'other' CHECK (event_type IN (
      'wedding', 'engagement', 'birthday', 'party', 'baptism', 'baby',
      'graduation', 'corporate', 'trip', 'reunion', 'community', 'memorial', 'other'
    ))
  );

  CREATE INDEX idx_events_code ON events(code);
  CREATE INDEX idx_events_status_created ON events(status, created_at DESC);
  CREATE INDEX idx_events_event_name ON events(eventName);
  CREATE INDEX idx_events_deleted_purge ON events(deleted_at, purge_at);
  CREATE INDEX idx_events_location_coordinates ON events(location_lat, location_lng);
  CREATE INDEX idx_events_event_type ON events(event_type);

  CREATE TABLE event_members (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, user_id)
  );

  CREATE TABLE cloud_oauth_states (
    state_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'dropbox')),
    locale TEXT NOT NULL CHECK (locale IN ('el', 'en')),
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX idx_cloud_oauth_states_expiry ON cloud_oauth_states(expires_at);
`;

function sqlForD1Exec(sql: string) {
  return sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("0060 application and D1 schema compatibility migration", () => {
  it("preserves existing relationships and accepts all application values", async () => {
    const now = Date.now();
    await env.DB.exec(sqlForD1Exec(preMigrationSchema));
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind("schema-cloud-user", "Schema Cloud User", "schema-cloud@example.com", now, now),
      env.DB.prepare(
        `INSERT INTO events (
          id, code, couple, admin_token_hash, created_at, expires_at,
          default_locale, eventName, event_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "existing-event", "SCOLD1", "Existing event", "existing-token",
        now, now + 86_400_000, "el", "Existing event", "party",
      ),
      env.DB.prepare(
        "INSERT INTO event_members (event_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
      ).bind("existing-event", "schema-cloud-user", now),
      env.DB.prepare(
        `INSERT INTO cloud_oauth_states (
          state_hash, user_id, provider, locale, expires_at, created_at
        ) VALUES (?, ?, 'google_drive', 'en', ?, ?)`,
      ).bind("existing-state", "schema-cloud-user", now + 600_000, now),
    ]);

    await env.DB.exec(sqlForD1Exec(migration));

    const eventStatements = eventTypes.flatMap((eventType, eventIndex) =>
      supportedLocales.map((locale, localeIndex) => {
        const position = eventIndex * supportedLocales.length + localeIndex;
        return env.DB.prepare(
          `INSERT INTO events (
            id, code, couple, admin_token_hash, created_at, expires_at,
            default_locale, eventName, event_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `schema-event-${position}`,
          `SC${position.toString().padStart(4, "0")}`,
          `Schema event ${position}`,
          `schema-token-${position}`,
          now + position + 1,
          now + 86_400_000,
          locale,
          `Schema event ${position}`,
          eventType,
        );
      }),
    );
    await env.DB.batch(eventStatements);

    const providers = ["google_drive", "dropbox"] as const;
    await env.DB.batch(providers.flatMap((provider) =>
      supportedLocales.map((locale) => env.DB.prepare(
        `INSERT INTO cloud_oauth_states (
          state_hash, user_id, provider, locale, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`${provider}-${locale}`, "schema-cloud-user", provider, locale, now + 600_000, now)),
    ));

    const events = await env.DB.prepare(
      "SELECT event_type, default_locale FROM events WHERE id LIKE 'schema-event-%'",
    ).all<{ event_type: string; default_locale: string }>();
    const oauthStates = await env.DB.prepare(
      "SELECT provider, locale FROM cloud_oauth_states WHERE user_id=? AND state_hash!='existing-state'",
    ).bind("schema-cloud-user").all<{ provider: string; locale: string }>();
    const preservedMember = await env.DB.prepare(
      "SELECT role FROM event_members WHERE event_id='existing-event' AND user_id='schema-cloud-user'",
    ).first<{ role: string }>();
    const foreignKeyViolations = await env.DB.prepare("PRAGMA foreign_key_check").all();

    expect(events.results).toHaveLength(eventTypes.length * supportedLocales.length);
    expect(new Set(events.results.map((row) => row.event_type))).toEqual(new Set(eventTypes));
    expect(new Set(events.results.map((row) => row.default_locale))).toEqual(new Set(supportedLocales));
    expect(oauthStates.results).toHaveLength(providers.length * supportedLocales.length);
    for (const provider of providers) {
      expect(new Set(
        oauthStates.results.filter((row) => row.provider === provider).map((row) => row.locale),
      )).toEqual(new Set(supportedLocales));
    }
    expect(preservedMember).toEqual({ role: "owner" });
    expect(foreignKeyViolations.results).toEqual([]);
  });
});
