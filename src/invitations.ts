import type { EventInvitationRow } from "./domain";

export type InviteRole = EventInvitationRow["role"];

export const normalizeInviteRole = (value: unknown): InviteRole => value === "viewer" ? "viewer" : "editor";

type CreateInvitationInput = {
  id: string;
  eventId: string;
  email: string;
  role: InviteRole;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
};

export async function createOrReplaceInvitation(db: D1Database, invitation: CreateInvitationInput) {
  await db.prepare(`INSERT INTO event_invitations (id,event_id,email,role,invited_by,created_at,expires_at,accepted_at)
    VALUES (?,?,?,?,?,?,?,NULL)
    ON CONFLICT(event_id,email) DO UPDATE SET
      id=excluded.id,
      role=excluded.role,
      invited_by=excluded.invited_by,
      created_at=excluded.created_at,
      expires_at=excluded.expires_at,
      accepted_at=NULL`)
    .bind(
      invitation.id,
      invitation.eventId,
      invitation.email.toLowerCase(),
      invitation.role,
      invitation.invitedBy,
      invitation.createdAt,
      invitation.expiresAt,
    )
    .run();
}

export async function acceptPendingInvitations(db: D1Database, user: { id: string; email: string }, now = Date.now()) {
  const normalizedEmail = user.email.toLowerCase();
  return db.batch([
    db.prepare(`INSERT INTO event_members (event_id,user_id,role,created_at)
      SELECT event_id,?,role,? FROM event_invitations
      WHERE lower(email)=? AND accepted_at IS NULL AND expires_at>?
      ON CONFLICT(event_id,user_id) DO UPDATE SET role=excluded.role
      WHERE event_members.role!='owner'`)
      .bind(user.id, now, normalizedEmail, now),
    db.prepare(`UPDATE event_invitations SET accepted_at=?
      WHERE lower(email)=? AND accepted_at IS NULL AND expires_at>?`)
      .bind(now, normalizedEmail, now),
  ]);
}
