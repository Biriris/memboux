import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0073_permanent_free_event_plan.sql?raw";
import uploadWindowMigration from "../migrations/0074_event_upload_windows_and_no_downgrade.sql?raw";

const sqlForD1Exec = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DROP TABLE IF EXISTS multipart_upload_sessions"),
    env.DB.prepare("DROP TABLE IF EXISTS event_wedding_media"),
    env.DB.prepare("DROP TABLE IF EXISTS media"),
    env.DB.prepare("DROP TABLE IF EXISTS event_access"),
    env.DB.prepare("DROP TABLE IF EXISTS commerce_products"),
    env.DB.prepare("DROP TABLE IF EXISTS events"),
    env.DB.prepare("CREATE TABLE events (id TEXT PRIMARY KEY)"),
    env.DB.prepare(`CREATE TABLE commerce_products (
      product_key TEXT PRIMARY KEY,scope TEXT NOT NULL,billing_model TEXT NOT NULL,
      name_en TEXT NOT NULL,name_el TEXT NOT NULL,name_fr TEXT NOT NULL,name_de TEXT NOT NULL,name_es TEXT NOT NULL,name_it TEXT NOT NULL,
      description_en TEXT NOT NULL,description_el TEXT NOT NULL,description_fr TEXT NOT NULL,description_de TEXT NOT NULL,description_es TEXT NOT NULL,description_it TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,media_limit INTEGER,event_duration_days INTEGER,
      guest_access_enabled INTEGER NOT NULL,original_downloads_enabled INTEGER NOT NULL,
      active INTEGER NOT NULL,checkout_enabled INTEGER NOT NULL,sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE event_access (
      event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      access_state TEXT NOT NULL CHECK(access_state IN ('preview','trial','unlocked','expired')),
      enforcement_state TEXT NOT NULL,media_limit INTEGER NOT NULL,
      media_uploads_consumed INTEGER NOT NULL DEFAULT 0,
      guest_access_enabled INTEGER NOT NULL,guest_uploads_enabled INTEGER NOT NULL,
      original_downloads_enabled INTEGER NOT NULL,trial_started_at INTEGER,trial_ends_at INTEGER,
      unlocked_at INTEGER,expires_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE TABLE media (id TEXT PRIMARY KEY,event_id TEXT NOT NULL,deleted_at INTEGER)"),
    env.DB.prepare("CREATE TABLE event_wedding_media (id TEXT PRIMARY KEY,event_id TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE multipart_upload_sessions (id TEXT PRIMARY KEY,event_id TEXT NOT NULL,status TEXT NOT NULL,expires_at INTEGER NOT NULL)"),
    env.DB.prepare("INSERT INTO events VALUES ('trial-event'),('expired-event'),('preview-event')"),
    env.DB.prepare(`INSERT INTO event_access VALUES
      ('trial-event','trial','enforced',20,3,1,1,0,10,20,NULL,NULL,1,1),
      ('expired-event','expired','enforced',20,2,0,0,0,10,20,NULL,20,1,1),
      ('preview-event','preview','enforced',20,0,0,0,0,NULL,NULL,NULL,NULL,1,1)`),
  ]);
});

describe("0073 permanent Free event plan migration", () => {
  it("converts old trials without losing access and removes trial timestamps", async () => {
    await env.DB.exec(sqlForD1Exec(migration));

    expect(await env.DB.prepare(
      `SELECT access_state,plan_key,media_limit,guest_access_enabled,guest_uploads_enabled,
              original_downloads_enabled,expires_at
       FROM event_access WHERE event_id='trial-event'`,
    ).first()).toEqual({
      access_state: "free",
      plan_key: "event_free",
      media_limit: 50,
      guest_access_enabled: 1,
      guest_uploads_enabled: 1,
      original_downloads_enabled: 1,
      expires_at: null,
    });
    expect(await env.DB.prepare(
      "SELECT access_state,plan_key,expires_at FROM event_access WHERE event_id='expired-event'",
    ).first()).toEqual({ access_state: "free", plan_key: "event_free", expires_at: null });
    expect(await env.DB.prepare(
      "SELECT access_state,media_limit,guest_access_enabled FROM event_access WHERE event_id='preview-event'",
    ).first()).toEqual({ access_state: "preview", media_limit: 50, guest_access_enabled: 0 });

    const columns = await env.DB.prepare("SELECT name FROM pragma_table_info('event_access') ORDER BY cid")
      .all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).not.toContain("trial_started_at");
    expect(columns.results.map((column) => column.name)).not.toContain("trial_ends_at");
    expect(await env.DB.prepare(
      "SELECT amount_minor,media_limit,event_duration_days FROM commerce_products WHERE product_key='event_free'",
    ).first()).toEqual({ amount_minor: 0, media_limit: 50, event_duration_days: null });
  });

  it("enforces the lifetime media limit atomically", async () => {
    await env.DB.exec(sqlForD1Exec(migration));
    await env.DB.prepare(
      "UPDATE event_access SET access_state='free',plan_key='event_free',media_uploads_consumed=50 WHERE event_id='preview-event'",
    ).run();
    await expect(env.DB.prepare(
      "INSERT INTO media (id,event_id,deleted_at) VALUES ('blocked','preview-event',NULL)",
    ).run()).rejects.toThrow("event_media_limit_reached");
  });
});

describe("0074 upload windows and premium downgrade protection", () => {
  it("starts the Free window on first upload and blocks uploads after it closes", async () => {
    await env.DB.exec(sqlForD1Exec(migration));
    await env.DB.exec(sqlForD1Exec(uploadWindowMigration));

    expect(await env.DB.prepare(
      "SELECT upload_window_days,upload_window_started_at,upload_window_ends_at FROM event_access WHERE event_id='trial-event'",
    ).first()).toEqual({ upload_window_days: 14, upload_window_started_at: null, upload_window_ends_at: null });

    await env.DB.prepare("INSERT INTO media (id,event_id,deleted_at) VALUES ('first','trial-event',NULL)").run();
    const started = await env.DB.prepare(
      "SELECT upload_window_started_at,upload_window_ends_at FROM event_access WHERE event_id='trial-event'",
    ).first<{ upload_window_started_at: number; upload_window_ends_at: number }>();
    expect(started!.upload_window_ends_at - started!.upload_window_started_at).toBe(14 * 86_400_000);

    await env.DB.prepare("UPDATE event_access SET upload_window_ends_at=1 WHERE event_id='trial-event'").run();
    await expect(env.DB.prepare(
      "INSERT INTO media (id,event_id,deleted_at) VALUES ('late','trial-event',NULL)",
    ).run()).rejects.toThrow("event_upload_window_closed");
  });

  it("prevents a premium event from ever returning to Free", async () => {
    await env.DB.exec(sqlForD1Exec(migration));
    await env.DB.prepare(`INSERT INTO commerce_products (
      product_key,scope,billing_model,name_en,name_el,name_fr,name_de,name_es,name_it,
      description_en,description_el,description_fr,description_de,description_es,description_it,
      amount_minor,currency,media_limit,event_duration_days,guest_access_enabled,
      original_downloads_enabled,active,checkout_enabled,sort_order,created_at,updated_at
    ) VALUES ('event_pass','event','one_time','Moments','Moments','Moments','Moments','Moments','Moments',
      'Paid','Paid','Paid','Paid','Paid','Paid',3900,'EUR',5000,365,1,1,1,0,10,1,1)`).run();
    await env.DB.exec(sqlForD1Exec(uploadWindowMigration));
    await env.DB.prepare(`UPDATE event_access SET access_state='unlocked',plan_key='event_pass',
      upload_window_days=45,premium_activated_at=100 WHERE event_id='preview-event'`).run();

    await expect(env.DB.prepare(`UPDATE event_access SET access_state='free',plan_key='event_free'
      WHERE event_id='preview-event'`).run()).rejects.toThrow("premium_event_cannot_downgrade_to_free");
    await expect(env.DB.prepare(`UPDATE event_access SET premium_activated_at=NULL
      WHERE event_id='preview-event'`).run()).rejects.toThrow("premium_event_cannot_downgrade_to_free");
  });
});
