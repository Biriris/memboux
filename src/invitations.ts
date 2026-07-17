import type { EventInvitationRow } from "./domain";
import { sha256 } from "./utils";

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
  tokenHash: string;
};

export type InvitationDetails = EventInvitationRow & {
  event_id: string;
  event_code: string;
  event_name: string;
  inviter_name: string;
  accepted_at: number | null;
  declined_at: number | null;
};

export function createInvitationToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export const hashInvitationToken = (token: string) => sha256(`memboux-invitation:${token}`);

export async function createOrReplaceInvitation(db: D1Database, invitation: CreateInvitationInput) {
  await db.prepare(`INSERT INTO event_invitations (id,event_id,email,role,invited_by,created_at,expires_at,accepted_at,token_hash,declined_at)
    VALUES (?,?,?,?,?,?,?,NULL,?,NULL)
    ON CONFLICT(event_id,email) DO UPDATE SET
      id=excluded.id,
      role=excluded.role,
      invited_by=excluded.invited_by,
      created_at=excluded.created_at,
      expires_at=excluded.expires_at,
      accepted_at=NULL,
      token_hash=excluded.token_hash,
      declined_at=NULL`)
    .bind(
      invitation.id,
      invitation.eventId,
      invitation.email.toLowerCase(),
      invitation.role,
      invitation.invitedBy,
      invitation.createdAt,
      invitation.expiresAt,
      invitation.tokenHash,
    )
    .run();
}

export async function listPendingInvitations(
  db: D1Database,
  user: { email: string },
  now = Date.now(),
) {
  const normalizedEmail = user.email.toLowerCase();
  return (await db.prepare(`SELECT ei.id,ei.event_id,ei.email,ei.role,ei.created_at,ei.expires_at,
      ei.accepted_at,ei.declined_at,e.code event_code,e.eventName event_name,u.name inviter_name
    FROM event_invitations ei
    JOIN events e ON e.id=ei.event_id
    JOIN "user" u ON u.id=ei.invited_by
    WHERE lower(ei.email)=? AND ei.accepted_at IS NULL AND ei.declined_at IS NULL
      AND ei.expires_at>? AND e.deleted_at IS NULL
    ORDER BY ei.created_at DESC`)
    .bind(normalizedEmail, now)
    .all<InvitationDetails>()).results;
}

export async function getInvitationByToken(db: D1Database, token: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const tokenHash = await hashInvitationToken(token);
  return db.prepare(`SELECT ei.id,ei.event_id,ei.email,ei.role,ei.created_at,ei.expires_at,
      ei.accepted_at,ei.declined_at,e.code event_code,e.eventName event_name,u.name inviter_name
    FROM event_invitations ei
    JOIN events e ON e.id=ei.event_id
    JOIN "user" u ON u.id=ei.invited_by
    WHERE ei.token_hash=? AND e.deleted_at IS NULL`)
    .bind(tokenHash)
    .first<InvitationDetails>();
}

export type InvitationResponse =
  | { status: "accepted"; eventCode: string }
  | { status: "declined"; eventCode: string }
  | { status: "not_found" | "forbidden" | "expired" | "already_resolved" };

export async function respondToInvitation(
  db: D1Database,
  invitationId: string,
  user: { id: string; email: string },
  action: "accept" | "decline",
  now = Date.now(),
): Promise<InvitationResponse> {
  const invitation = await db.prepare(`SELECT ei.id,ei.event_id,ei.email,ei.role,ei.expires_at,
      ei.accepted_at,ei.declined_at,e.code event_code
    FROM event_invitations ei JOIN events e ON e.id=ei.event_id
    WHERE ei.id=? AND e.deleted_at IS NULL`)
    .bind(invitationId)
    .first<{
      id: string;
      event_id: string;
      email: string;
      role: InviteRole;
      expires_at: number;
      accepted_at: number | null;
      declined_at: number | null;
      event_code: string;
    }>();
  if (!invitation) return { status: "not_found" };
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) return { status: "forbidden" };
  if (invitation.accepted_at !== null || invitation.declined_at !== null) return { status: "already_resolved" };
  if (invitation.expires_at <= now) return { status: "expired" };

  if (action === "decline") {
    const result = await db.prepare(`UPDATE event_invitations SET declined_at=?
      WHERE id=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?`)
      .bind(now, invitation.id, now)
      .run();
    return result.meta.changes
      ? { status: "declined", eventCode: invitation.event_code }
      : { status: "already_resolved" };
  }

  const results = await db.batch([
    db.prepare(`INSERT INTO event_members (event_id,user_id,role,created_at)
      SELECT event_id,?,role,? FROM event_invitations
      WHERE id=? AND lower(email)=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?
      ON CONFLICT(event_id,user_id) DO UPDATE SET role=excluded.role
      WHERE event_members.role!='owner'`)
      .bind(user.id, now, invitation.id, user.email.toLowerCase(), now),
    db.prepare(`UPDATE event_invitations SET accepted_at=?
      WHERE id=? AND lower(email)=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?`)
      .bind(now, invitation.id, user.email.toLowerCase(), now),
  ]);
  return results[1].meta.changes
    ? { status: "accepted", eventCode: invitation.event_code }
    : { status: "already_resolved" };
}
