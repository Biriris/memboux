import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import migration from "../migrations/0065_complimentary_event_activations.sql?raw";

const sqlForD1Exec = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

describe("0065 complimentary event activations migration", () => {
  it("creates an auditable, idempotent record for non-payment activation", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS complimentary_event_activations");
    expect(migration).toContain("REFERENCES events(id) ON DELETE CASCADE");
    expect(migration).toContain("REFERENCES commerce_orders(id) ON DELETE RESTRICT");
    expect(migration).toContain("REFERENCES commerce_products(product_key) ON DELETE RESTRICT");
    expect(migration).toContain('REFERENCES "user"(id) ON DELETE RESTRICT');
    expect(migration).toContain("UNIQUE (event_id,order_id,entitlement_snapshot,activation_reason)");
    expect(migration).toContain("idx_complimentary_event_activations_event");
  });

  it("executes successfully on D1", async () => {
    await env.DB.prepare("DROP TABLE IF EXISTS complimentary_event_activations").run();
    await env.DB.exec(sqlForD1Exec(migration));

    const columns = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('complimentary_event_activations') ORDER BY cid",
    ).all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id",
      "event_id",
      "order_id",
      "product_key",
      "activated_by_user_id",
      "entitlement_snapshot",
      "granted_media_limit",
      "granted_expires_at",
      "activation_reason",
      "created_at",
    ]);
  });
});
