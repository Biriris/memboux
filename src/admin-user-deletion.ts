import type { Bindings } from "./domain";
import { permanentlyDeleteEvent } from "./repositories";

export type AdminUserDeletionResult =
  | { status: "deleted"; deletedEvents: number }
  | { status: "not_found" }
  | { status: "confirmation_mismatch" }
  | { status: "active_stripe_subscription" };

export async function permanentlyDeleteUserAsAdmin(
  env: Pick<Bindings, "DB" | "MEDIA">,
  userId: string,
  confirmationEmail: string,
): Promise<AdminUserDeletionResult> {
  const user = await env.DB.prepare(
    'SELECT id,email FROM "user" WHERE id=?',
  )
    .bind(userId)
    .first<{ id: string; email: string }>();
  if (!user) return { status: "not_found" };

  if (
    confirmationEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    return { status: "confirmation_mismatch" };
  }

  const billedSubscription = await env.DB.prepare(
    `SELECT 1 FROM account_subscriptions
     WHERE user_id=? AND billing_provider='stripe'
       AND status IN ('trialing','active','past_due') LIMIT 1`,
  )
    .bind(user.id)
    .first();
  if (billedSubscription) return { status: "active_stripe_subscription" };

  const ownedEvents = await env.DB.prepare(
    "SELECT event_id FROM event_members WHERE user_id=? AND role='owner'",
  )
    .bind(user.id)
    .all<{ event_id: string }>();

  for (const event of ownedEvents.results) {
    await permanentlyDeleteEvent(env, event.event_id);
  }

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM event_invitations WHERE lower(email)=lower(?)",
    ).bind(user.email),
    env.DB.prepare("DELETE FROM verification WHERE identifier=?").bind(
      user.email,
    ),
    env.DB.prepare('DELETE FROM "user" WHERE id=?').bind(user.id),
  ]);

  return { status: "deleted", deletedEvents: ownedEvents.results.length };
}
