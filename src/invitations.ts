import type { EventInvitationRow } from "./domain";
import { sha256 } from "./utils";

export type InviteRole = EventInvitationRow["role"];
export type InvitationKind = EventInvitationRow["invitation_kind"];

export const normalizeInviteRole = (value: unknown): InviteRole => value === "viewer" ? "viewer" : "editor";

type CreateInvitationInput = {
  id: string;
  eventId: string;
  email: string;
  role: InviteRole;
  invitationKind?: InvitationKind;
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
  await db.prepare(`INSERT INTO event_invitations (id,event_id,email,role,invited_by,created_at,expires_at,accepted_at,token_hash,declined_at,invitation_kind)
    VALUES (?,?,?,?,?,?,?,NULL,?,NULL,?)
    ON CONFLICT(event_id,email) DO UPDATE SET
      id=excluded.id,
      role=excluded.role,
      invitation_kind=excluded.invitation_kind,
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
      invitation.invitationKind ?? "member",
    )
    .run();
}

export async function listPendingInvitations(
  db: D1Database,
  user: { email: string },
  now = Date.now(),
) {
  const normalizedEmail = user.email.toLowerCase();
  return (await db.prepare(`SELECT ei.id,ei.event_id,ei.email,ei.role,ei.invitation_kind,ei.created_at,ei.expires_at,
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
  return db.prepare(`SELECT ei.id,ei.event_id,ei.email,ei.role,ei.invitation_kind,ei.created_at,ei.expires_at,
      ei.accepted_at,ei.declined_at,e.code event_code,e.eventName event_name,u.name inviter_name
    FROM event_invitations ei
    JOIN events e ON e.id=ei.event_id
    JOIN "user" u ON u.id=ei.invited_by
    WHERE ei.token_hash=? AND e.deleted_at IS NULL`)
    .bind(tokenHash)
    .first<InvitationDetails>();
}

export type InvitationResponse =
  | { status: "accepted"; eventId: string; eventCode: string; professional: boolean }
  | { status: "declined"; eventId: string; eventCode: string }
  | { status: "not_found" | "forbidden" | "expired" | "already_resolved" };

export async function respondToInvitation(
  db: D1Database,
  invitationId: string,
  user: { id: string; email: string; name?: string },
  action: "accept" | "decline",
  now = Date.now(),
): Promise<InvitationResponse> {
  const invitation = await db.prepare(`SELECT ei.id,ei.event_id,ei.email,ei.role,ei.invitation_kind,ei.invited_by,ei.expires_at,
      ei.accepted_at,ei.declined_at,e.code event_code,e.eventName event_name
    FROM event_invitations ei JOIN events e ON e.id=ei.event_id
    WHERE ei.id=? AND e.deleted_at IS NULL`)
    .bind(invitationId)
    .first<{
      id: string;
      event_id: string;
      email: string;
      role: InviteRole;
      invitation_kind: InvitationKind;
      invited_by: string;
      expires_at: number;
      accepted_at: number | null;
      declined_at: number | null;
      event_code: string;
      event_name: string;
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
      ? { status: "declined", eventId: invitation.event_id, eventCode: invitation.event_code }
      : { status: "already_resolved" };
  }

  const professional = invitation.invitation_kind === "professional";
  const accessStatements = professional
    ? [
        db.prepare(`INSERT INTO professional_profiles (user_id,business_name,slug,bio,website,status,created_at,updated_at)
          VALUES (?,?,?,'',NULL,'active',?,?)
          ON CONFLICT(user_id) DO UPDATE SET status='active',updated_at=excluded.updated_at`)
          .bind(user.id, (user.name || user.email.split("@")[0]).slice(0, 100), `professional-${user.id.replace(/[^a-z0-9]/gi, "").slice(0, 20).toLowerCase()}`, now, now),
        db.prepare(`INSERT INTO event_professional_assignments
          (event_id,professional_user_id,assigned_by,status,created_at,accepted_at,updated_at)
          VALUES (?,?,?,'accepted',?,?,?)
          ON CONFLICT(event_id,professional_user_id) DO UPDATE SET
            assigned_by=excluded.assigned_by,status='accepted',accepted_at=excluded.accepted_at,updated_at=excluded.updated_at`)
          .bind(invitation.event_id, user.id, invitation.invited_by, now, now, now),
      ]
    : [
        db.prepare(`INSERT INTO event_members (event_id,user_id,role,created_at)
          SELECT event_id,?,role,? FROM event_invitations
          WHERE id=? AND lower(email)=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?
          ON CONFLICT(event_id,user_id) DO UPDATE SET role=excluded.role
          WHERE event_members.role!='owner'`)
          .bind(user.id, now, invitation.id, user.email.toLowerCase(), now),
      ];
  const results = await db.batch([
    ...accessStatements,
    db.prepare(`UPDATE event_invitations SET accepted_at=?
      WHERE id=? AND lower(email)=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?`)
      .bind(now, invitation.id, user.email.toLowerCase(), now),
  ]);
  const accepted = results[results.length - 1].meta.changes;
  if (accepted) {
    await db.prepare(`INSERT INTO account_notifications
      (id,user_id,event_id,invitation_id,actor_user_id,actor_name,type,item_count,created_at,read_at)
      VALUES (?,?,?,?,?,?, 'invitation_accepted',1,?,NULL)`)
      .bind(crypto.randomUUID(), invitation.invited_by, invitation.event_id, invitation.id, user.id, user.name ?? user.email, now)
      .run();
  }
  return accepted
    ? { status: "accepted", eventId: invitation.event_id, eventCode: invitation.event_code, professional }
    : { status: "already_resolved" };
}
