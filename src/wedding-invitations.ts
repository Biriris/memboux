import { sendEmail, type AuthEnv } from "./auth";
import type { EventRow } from "./domain";
import type { Locale } from "./i18n";
import { esc, sha256 } from "./utils";

export type ReservedWeddingInvitation = {
  guestId: string;
  guestName: string;
  email: string;
  token: string;
  tokenHash: string;
};

export async function reserveWeddingInvitationBatch(db: D1Database, eventId: string, now: number, limit = 200) {
  const staleBefore = now - 10 * 60_000;
  const candidates = await db.prepare(`SELECT id,first_name,last_name,email
    FROM event_wedding_guests
    WHERE event_id=? AND email!='' AND (
      invitation_delivery_status IN ('not_sent','failed') OR
      (invitation_delivery_status='sending' AND COALESCE(invitation_delivery_attempted_at,0)<?)
    ) ORDER BY last_name,first_name,id LIMIT ?`)
    .bind(eventId, staleBefore, limit).all<{ id: string; first_name: string; last_name: string; email: string }>();
  const pending = await Promise.all(candidates.results.map(async (guest): Promise<ReservedWeddingInvitation> => {
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    return {
      guestId: guest.id,
      guestName: `${guest.first_name} ${guest.last_name}`.trim(),
      email: guest.email,
      token,
      tokenHash: await sha256(token),
    };
  }));
  const reserved: ReservedWeddingInvitation[] = [];
  for (let offset = 0; offset < pending.length; offset += 50) {
    const invitationBatch = pending.slice(offset, offset + 50);
    const results = await db.batch(invitationBatch.map((invitation) => db.prepare(`UPDATE event_wedding_guests
      SET invitation_token_hash=?,invitation_created_at=?,invitation_delivery_status='sending',
        invitation_delivery_attempted_at=?,updated_at=?
      WHERE id=? AND event_id=? AND (
        invitation_delivery_status IN ('not_sent','failed') OR
        (invitation_delivery_status='sending' AND COALESCE(invitation_delivery_attempted_at,0)<?)
      )`).bind(invitation.tokenHash, now, now, now, invitation.guestId, eventId, staleBefore)));
    results.forEach((result, index) => {
      if (result.meta.changes === 1 && invitationBatch[index]) reserved.push(invitationBatch[index]!);
    });
  }
  return reserved;
}

function invitationCopy(locale: Locale, guestName: string, eventName: string, invitationUrl: string) {
  if (locale === "el") return {
    subject: `Η προσωπική σου πρόσκληση για το ${eventName}`,
    title: `Γεια σου ${guestName || ""}`.trim(),
    intro: `Η προσωπική σου πρόσκληση για το «${eventName}» είναι έτοιμη. Από τον ασφαλή σύνδεσμο μπορείς να δεις τις πληροφορίες του γάμου και να απαντήσεις στο RSVP.`,
    action: "Άνοιγμα πρόσκλησης",
    note: "Ο σύνδεσμος είναι προσωπικός. Μην τον προωθήσεις σε άλλον καλεσμένο.",
    text: `Η προσωπική σου πρόσκληση για το «${eventName}» είναι έτοιμη. Άνοιξέ την και απάντησε στο RSVP: ${invitationUrl}\n\nΟ σύνδεσμος είναι προσωπικός.`,
  };
  return {
    subject: `Your personal invitation to ${eventName}`,
    title: `Hello ${guestName || ""}`.trim(),
    intro: `Your personal invitation to “${eventName}” is ready. Use the secure link to view the wedding details and reply to the RSVP.`,
    action: "Open invitation",
    note: "This link is personal. Please do not forward it to another guest.",
    text: `Your personal invitation to “${eventName}” is ready. Open it and reply to the RSVP: ${invitationUrl}\n\nThis link is personal.`,
  };
}

export async function deliverWeddingInvitation(
  env: AuthEnv,
  event: EventRow,
  locale: Locale,
  origin: string,
  invitation: ReservedWeddingInvitation,
) {
  const invitationUrl = `${origin}/wedding/${encodeURIComponent(event.code)}/invite/${encodeURIComponent(invitation.token)}?lang=${locale}`;
  const copy = invitationCopy(locale, invitation.guestName, event.eventName, invitationUrl);
  await sendEmail(env, {
    to: invitation.email,
    purpose: "event_invitation",
    subject: copy.subject,
    text: copy.text,
    html: `<!doctype html><html><body style="margin:0;background:#f8f5ff;color:#2b174d;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #ece5f4;border-radius:20px"><tr><td style="padding:34px"><div style="font-size:22px;font-weight:700">Memboux</div><div style="margin-top:4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8b5cf6">Collecting moments</div><h1 style="margin:32px 0 12px;font-size:28px">${esc(copy.title)}</h1><p style="color:#675a72;font-size:16px;line-height:1.7">${esc(copy.intro)}</p><p style="margin:28px 0"><a href="${esc(invitationUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">${esc(copy.action)}</a></p><p style="color:#6f657c;font-size:13px;line-height:1.6">${esc(copy.note)}</p><p style="word-break:break-all;color:#8b5cf6;font-size:12px"><a href="${esc(invitationUrl)}" style="color:#8b5cf6">${esc(invitationUrl)}</a></p></td></tr></table></td></tr></table></body></html>`,
  });
}

export async function deliverWeddingInvitationBatch(
  env: AuthEnv,
  event: EventRow,
  locale: Locale,
  origin: string,
  invitations: ReservedWeddingInvitation[],
  deliver: typeof deliverWeddingInvitation = deliverWeddingInvitation,
) {
  const workerCount = Math.min(5, invitations.length);
  let cursor = 0;
  const deliverNext = async () => {
    while (cursor < invitations.length) {
      const invitation = invitations[cursor++];
      if (!invitation) return;
      try {
        await deliver(env, event, locale, origin, invitation);
        await env.DB.prepare(`UPDATE event_wedding_guests
          SET invitation_delivery_status='sent',invitation_emailed_at=?,updated_at=?
          WHERE id=? AND event_id=? AND invitation_delivery_status='sending' AND invitation_token_hash=?`)
          .bind(Date.now(), Date.now(), invitation.guestId, event.id, invitation.tokenHash).run();
      } catch (error) {
        await env.DB.prepare(`UPDATE event_wedding_guests
          SET invitation_delivery_status='failed',updated_at=?
          WHERE id=? AND event_id=? AND invitation_delivery_status='sending' AND invitation_token_hash=?`)
          .bind(Date.now(), invitation.guestId, event.id, invitation.tokenHash).run();
        console.error(JSON.stringify({
          event: "wedding_guest_invitation_failed",
          event_id: event.id,
          guest_id: invitation.guestId,
          error: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        }));
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, deliverNext));
}
