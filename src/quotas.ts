export type AccountEntitlement = {
  userId: string;
  planKey: "beta" | "pro" | "studio" | "custom";
  storageLimitBytes: number;
  usedBytes: number;
  eventLimit: number;
  memberLimit: number;
};

export const DEFAULT_ENTITLEMENT = {
  planKey: "beta" as const,
  storageLimitBytes: 20 * 1024 * 1024 * 1024,
  eventLimit: 25,
  memberLimit: 25,
};

export async function getUserEntitlement(db: D1Database, userId: string): Promise<AccountEntitlement> {
  const row = await db.prepare(`SELECT ae.plan_key,ae.storage_limit_bytes,ae.event_limit,ae.member_limit,COALESCE(su.used_bytes,0) used_bytes
    FROM (SELECT ? user_id) u
    LEFT JOIN account_entitlements ae ON ae.user_id=u.user_id
    LEFT JOIN account_storage_usage su ON su.user_id=u.user_id`).bind(userId).first<{plan_key:string|null;storage_limit_bytes:number|null;event_limit:number|null;member_limit:number|null;used_bytes:number}>();
  return {
    userId,
    planKey: (row?.plan_key ?? DEFAULT_ENTITLEMENT.planKey) as AccountEntitlement["planKey"],
    storageLimitBytes: Number(row?.storage_limit_bytes ?? DEFAULT_ENTITLEMENT.storageLimitBytes),
    usedBytes: Number(row?.used_bytes ?? 0),
    eventLimit: Number(row?.event_limit ?? DEFAULT_ENTITLEMENT.eventLimit),
    memberLimit: Number(row?.member_limit ?? DEFAULT_ENTITLEMENT.memberLimit),
  };
}

export async function getEventOwnerEntitlement(db: D1Database, eventId: string) {
  const owner = await db.prepare("SELECT user_id FROM event_members WHERE event_id=? AND role='owner' LIMIT 1").bind(eventId).first<{user_id:string}>();
  return owner ? getUserEntitlement(db,owner.user_id) : null;
}

export async function canCreateOwnedEvent(db: D1Database, userId: string) {
  const [entitlement,count] = await Promise.all([
    getUserEntitlement(db,userId),
    db.prepare("SELECT COUNT(*) total FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=? AND em.role='owner' AND e.deleted_at IS NULL").bind(userId).first<{total:number}>(),
  ]);
  return { allowed: Number(count?.total ?? 0) < entitlement.eventLimit, entitlement, used: Number(count?.total ?? 0) };
}

export async function canStoreForEvent(db: D1Database, eventId: string, additionalBytes: number) {
  const entitlement = await getEventOwnerEntitlement(db,eventId);
  return { allowed: !entitlement || entitlement.usedBytes + additionalBytes <= entitlement.storageLimitBytes, entitlement };
}

export async function canInviteToEvent(db: D1Database, eventId: string) {
  const entitlement = await getEventOwnerEntitlement(db,eventId);
  if (!entitlement) return { allowed:true,entitlement:null,used:0 };
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM event_members WHERE event_id=? AND role!='owner')+
    (SELECT COUNT(*) FROM event_invitations WHERE event_id=? AND accepted_at IS NULL AND expires_at>?) total`).bind(eventId,eventId,Date.now()).first<{total:number}>();
  const used=Number(row?.total??0);
  return { allowed:used<entitlement.memberLimit,entitlement,used };
}

export const isQuotaDatabaseError = (error: unknown, kind: "storage" | "event" | "collaborator") =>
  error instanceof Error && error.message.includes(`${kind}_quota_exceeded`);

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units=["KB","MB","GB","TB"];
  let value=bytes/1024,index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++;}
  return `${value>=10?value.toFixed(0):value.toFixed(1)} ${units[index]}`;
}
