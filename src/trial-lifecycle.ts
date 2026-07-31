import type { Bindings } from "./domain";
import type { AccountNotificationType } from "./notifications";

const DAY_MS = 86_400_000;

type TrialLifecycleRow = {
  event_id: string;
  trial_ends_at: number;
  owner_user_id: string;
};

export type TrialLifecycleResult = {
  processed: number;
  expired: number;
  notifications: number;
};

function lifecycleNotificationType(endsAt: number, now: number): AccountNotificationType | null {
  const remaining = endsAt - now;
  if (remaining <= 0) return "trial_expired";
  if (remaining <= DAY_MS) return "trial_ending_1d";
  if (remaining <= 3 * DAY_MS) return "trial_ending_3d";
  return null;
}

export async function reconcileEventTrials(
  env: Pick<Bindings, "DB">,
  now = Date.now(),
): Promise<TrialLifecycleResult> {
  const trials = await env.DB.prepare(`SELECT a.event_id,a.trial_ends_at,em.user_id owner_user_id
    FROM event_access a
    JOIN event_members em ON em.event_id=a.event_id AND em.role='owner'
    JOIN events e ON e.id=a.event_id
    WHERE a.access_state='trial' AND a.enforcement_state='enforced'
      AND a.trial_ends_at IS NOT NULL AND a.trial_ends_at<=?
      AND e.deleted_at IS NULL`)
    .bind(now + 3 * DAY_MS)
    .all<TrialLifecycleRow>();

  let expired = 0;
  let notifications = 0;
  for (const trial of trials.results) {
    const type = lifecycleNotificationType(trial.trial_ends_at, now);
    if (!type) continue;
    const statements: D1PreparedStatement[] = [];
    if (type === "trial_expired") {
      statements.push(env.DB.prepare(`UPDATE event_access SET
          access_state='expired',guest_access_enabled=0,guest_uploads_enabled=0,
          original_downloads_enabled=0,expires_at=COALESCE(expires_at,trial_ends_at),updated_at=?
        WHERE event_id=? AND access_state='trial' AND enforcement_state='enforced'`)
        .bind(now, trial.event_id));
    }
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO account_notifications
      (id,user_id,event_id,invitation_id,actor_user_id,actor_name,type,item_count,created_at,read_at)
      VALUES (?,?,?,NULL,NULL,NULL,?,1,?,NULL)`)
      .bind(crypto.randomUUID(), trial.owner_user_id, trial.event_id, type, now));
    const results = await env.DB.batch(statements);
    if (type === "trial_expired" && Number(results[0]?.meta.changes ?? 0) > 0) expired += 1;
    const notificationResult = results[results.length - 1];
    if (Number(notificationResult?.meta.changes ?? 0) > 0) notifications += 1;
  }
  return { processed: trials.results.length, expired, notifications };
}
