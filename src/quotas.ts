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

export async function ensureQuotaRows(db: D1Database, userId: string, now=Date.now()) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at) VALUES (?,'beta',?,?,?,?)").bind(userId,DEFAULT_ENTITLEMENT.storageLimitBytes,DEFAULT_ENTITLEMENT.eventLimit,DEFAULT_ENTITLEMENT.memberLimit,now),
    db.prepare("INSERT OR IGNORE INTO account_storage_usage (user_id,used_bytes,updated_at) VALUES (?,0,?)").bind(userId,now),
    db.prepare("INSERT OR IGNORE INTO account_event_usage (user_id,active_events,updated_at) VALUES (?,0,?)").bind(userId,now),
  ]);
}

export async function getUserEntitlement(db: D1Database, userId: string): Promise<AccountEntitlement> {
  await ensureQuotaRows(db,userId);
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
  const entitlement=await getUserEntitlement(db,userId);
  const usage=await db.prepare("SELECT active_events FROM account_event_usage WHERE user_id=?").bind(userId).first<{active_events:number}>();
  return { allowed:Number(usage?.active_events??0)<entitlement.eventLimit,entitlement,used:Number(usage?.active_events??0) };
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

export async function reserveStorageForEvent(db:D1Database,eventId:string,bytes:number) {
  const owner=await db.prepare("SELECT user_id FROM event_members WHERE event_id=? AND role='owner' LIMIT 1").bind(eventId).first<{user_id:string}>();
  if(!owner)return {allowed:true,ownerId:null};
  await ensureQuotaRows(db,owner.user_id);
  const row=await db.prepare(`UPDATE account_storage_usage SET used_bytes=used_bytes+?,updated_at=? WHERE user_id=? AND used_bytes+?<=COALESCE((SELECT storage_limit_bytes FROM account_entitlements WHERE user_id=?),?) RETURNING used_bytes`).bind(bytes,Date.now(),owner.user_id,bytes,owner.user_id,DEFAULT_ENTITLEMENT.storageLimitBytes).first<{used_bytes:number}>();
  return {allowed:Boolean(row),ownerId:owner.user_id,usedBytes:row?.used_bytes};
}

export async function releaseStorage(db:D1Database,userId:string|null,bytes:number) {
  if(!userId||bytes<=0)return;
  await db.prepare("UPDATE account_storage_usage SET used_bytes=MAX(0,used_bytes-?),updated_at=? WHERE user_id=?").bind(bytes,Date.now(),userId).run();
}

export async function reserveOwnedEvent(db:D1Database,userId:string) {
  await ensureQuotaRows(db,userId);
  const row=await db.prepare(`UPDATE account_event_usage SET active_events=active_events+1,updated_at=? WHERE user_id=? AND active_events+1<=COALESCE((SELECT event_limit FROM account_entitlements WHERE user_id=?),?) RETURNING active_events`).bind(Date.now(),userId,userId,DEFAULT_ENTITLEMENT.eventLimit).first<{active_events:number}>();
  return Boolean(row);
}

export async function releaseOwnedEvent(db:D1Database,userId:string) {
  await db.prepare("UPDATE account_event_usage SET active_events=MAX(0,active_events-1),updated_at=? WHERE user_id=?").bind(Date.now(),userId).run();
}

export async function reconcileQuotaUsage(db:D1Database,now=Date.now()) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO account_entitlements (user_id,plan_key,storage_limit_bytes,event_limit,member_limit,updated_at) SELECT id,'beta',?,?,?,? FROM \"user\"").bind(DEFAULT_ENTITLEMENT.storageLimitBytes,DEFAULT_ENTITLEMENT.eventLimit,DEFAULT_ENTITLEMENT.memberLimit,now),
    db.prepare("INSERT OR IGNORE INTO account_storage_usage (user_id,used_bytes,updated_at) SELECT id,0,? FROM \"user\"").bind(now),
    db.prepare("INSERT OR IGNORE INTO account_event_usage (user_id,active_events,updated_at) SELECT id,0,? FROM \"user\"").bind(now),
    db.prepare(`UPDATE account_storage_usage SET used_bytes=COALESCE((SELECT SUM(m.size_bytes) FROM event_members em JOIN media m ON m.event_id=em.event_id WHERE em.user_id=account_storage_usage.user_id AND em.role='owner'),0),updated_at=?`).bind(now),
    db.prepare(`UPDATE account_event_usage SET active_events=COALESCE((SELECT COUNT(*) FROM event_members em JOIN events e ON e.id=em.event_id WHERE em.user_id=account_event_usage.user_id AND em.role='owner' AND e.deleted_at IS NULL),0),updated_at=?`).bind(now),
  ]);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units=["KB","MB","GB","TB"];
  let value=bytes/1024,index=0;
  while(value>=1024&&index<units.length-1){value/=1024;index++;}
  return `${value>=10?value.toFixed(0):value.toFixed(1)} ${units[index]}`;
}
