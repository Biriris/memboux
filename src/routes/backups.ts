import { Hono } from "hono";
import type { Bindings, CloudConnectionRow, EventBackupRow } from "../domain";
import {
  decryptDropboxRefreshToken,
  DROPBOX_SCOPE,
  dropboxAuthorizationUrl,
  encryptDropboxRefreshToken,
  exchangeDropboxCode,
  exchangeDropboxRefreshToken,
  queueAllDropboxBackupsForUser,
  queueDropboxBackupForEvent,
} from "../dropbox";
import {
  decryptDriveRefreshToken,
  encryptDriveRefreshToken,
  exchangeGoogleDriveCode,
  GOOGLE_DRIVE_SCOPE,
  googleDriveAuthorizationUrl,
  queueAllGoogleDriveBackupsForUser,
  queueGoogleDriveBackupForEvent,
  randomOAuthState,
} from "../google-drive";
import { normalizeLocale, type Locale } from "../i18n";
import { formatBytes } from "../quotas";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { esc, formatEventDates, sha256 } from "../utils";
import { accountHeader, googleIcon, logoutScript, page } from "../views/shared";

export const backupRoutes = new Hono<{ Bindings: Bindings }>();

type BackupEventRow = {
  id: string;
  code: string;
  eventName: string;
  event_start_date: string | null;
  event_end_date: string | null;
  media_count: number;
  media_bytes: number;
  backup_id: string | null;
  backup_status: EventBackupRow["status"] | null;
  completed_items: number | null;
  total_items: number | null;
  completed_bytes: number | null;
  backup_created_at: number | null;
  provider_folder_id: string | null;
  error_message: string | null;
};

const labels = (locale: Locale) => locale === "el" ? {
  title: "Αντίγραφα ασφαλείας",
  eyebrow: "Cloud archive",
  intro: "Σύνδεσε το προσωπικό σου Google Drive και το Memboux θα συγχρονίζει αυτόματα κάθε νέο αρχείο των event σου.",
  connected: "Το αυτόματο Google Drive backup είναι ενεργό",
  disconnected: "Σύνδεσε το Google Drive",
  connectHelp: "Το Memboux χρησιμοποιεί μόνο την περιορισμένη άδεια drive.file και διαχειρίζεται αποκλειστικά τα αρχεία και τους φακέλους που δημιουργεί το ίδιο.",
  connect: "Σύνδεση Google Drive",
  disconnect: "Αποσύνδεση",
  events: "Τα event μου",
  backup: "Συγχρονισμός τώρα",
  again: "Συγχρονισμός τώρα",
  queued: "Σε αναμονή",
  running: "Αντιγραφή σε εξέλιξη",
  completed: "Ολοκληρώθηκε",
  failed: "Χρειάζεται προσοχή",
  empty: "Δεν υπάρχουν ενεργά αρχεία σε αυτό το event.",
  openDrive: "Άνοιγμα στο Drive",
  privacy: "Τα πρωτότυπα παραμένουν ασφαλή στο Memboux. Το Drive λειτουργεί ως δεύτερο, αυτόματο προσωπικό αντίγραφο και η αποσύνδεση σταματά τους νέους συγχρονισμούς.",
} : {
  title: "Cloud backups",
  eyebrow: "Cloud archive",
  intro: "Connect your personal Google Drive and Memboux will automatically sync every new file from your events.",
  connected: "Automatic Google Drive backup is on",
  disconnected: "Connect Google Drive",
  connectHelp: "Memboux uses the limited drive.file permission and can only manage files and folders it creates itself.",
  connect: "Connect Google Drive",
  disconnect: "Disconnect",
  events: "My events",
  backup: "Sync now",
  again: "Sync now",
  queued: "Queued",
  running: "Backup in progress",
  completed: "Completed",
  failed: "Needs attention",
  empty: "This event has no active files.",
  openDrive: "Open in Drive",
  privacy: "Originals remain safely stored in Memboux. Drive is a second, automatic personal copy; disconnecting stops future syncs.",
};

const dropboxIcon = () => `<svg aria-hidden="true" viewBox="0 0 24 24" class="h-6 w-6" fill="#0061ff"><path d="M6 2 0 6l6 4 6-4-6-4Zm12 0-6 4 6 4 6-4-6-4ZM0 14l6 4 6-4-6-4-6 4Zm18-4-6 4 6 4 6-4-6-4Zm-12 9.3 6 3.7 6-3.7-6-3.8-6 3.8Z"/></svg>`;

function backupStatusMarkup(event: BackupEventRow, locale: Locale) {
  if (!event.backup_id || !event.backup_status) return "";
  const copy = labels(locale);
  const statusLabel = copy[event.backup_status];
  const percent = event.total_items
    ? Math.min(100, Math.round(((event.completed_items ?? 0) / event.total_items) * 100))
    : event.backup_status === "completed" ? 100 : 0;
  const active = event.backup_status === "queued" || event.backup_status === "running";
  const tone = event.backup_status === "completed"
    ? "bg-emerald-50 text-emerald-800"
    : event.backup_status === "failed"
      ? "bg-red-50 text-red-800"
      : "bg-indigo-50 text-indigo-800";
  return `<div class="mt-4 rounded-2xl ${tone} p-4" data-backup-status="${event.backup_id}"${active ? " data-active=\"true\"" : ""}>
    <div class="flex items-center justify-between gap-3"><strong data-status-label>${statusLabel}</strong><span class="text-sm" data-status-count>${event.completed_items ?? 0}/${event.total_items ?? 0}</span></div>
    <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/70"><div data-status-progress class="h-full rounded-full bg-current transition-all" style="width:${percent}%"></div></div>
    ${event.error_message ? `<p class="mt-2 text-xs" data-status-error>${esc(event.error_message)}</p>` : `<p class="mt-2 hidden text-xs" data-status-error></p>`}
    ${event.provider_folder_id ? `<a data-drive-link href="https://drive.google.com/drive/folders/${encodeURIComponent(event.provider_folder_id)}" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex text-sm font-semibold underline">${copy.openDrive}</a>` : `<a data-drive-link class="mt-3 hidden text-sm font-semibold underline" target="_blank" rel="noopener noreferrer">${copy.openDrive}</a>`}
  </div>`;
}

backupRoutes.get("/:locale{el|en}/backups", async (c) => {
  const locale = normalizeLocale(c.req.param("locale"));
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const connection = await c.env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='google_drive'",
  ).bind(user.id).first<CloudConnectionRow>();
  const dropboxConnection = await c.env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
  ).bind(user.id).first<CloudConnectionRow>();
  const dropboxConfigured = Boolean(c.env.DROPBOX_APP_KEY && c.env.DROPBOX_APP_SECRET);
  const events = await c.env.DB.prepare(
    `SELECT e.id,e.code,e.eventName,e.event_start_date,e.event_end_date,
      COUNT(m.id) media_count,COALESCE(SUM(m.size_bytes),0) media_bytes,
      b.id backup_id,b.status backup_status,b.completed_items,b.total_items,b.completed_bytes,
      b.created_at backup_created_at,b.provider_folder_id,b.error_message
     FROM event_members em
     JOIN events e ON e.id=em.event_id
     LEFT JOIN media m ON m.event_id=e.id AND m.deleted_at IS NULL AND m.reported_at IS NULL
     LEFT JOIN event_backups b ON b.id=(
       SELECT latest.id FROM event_backups latest
       WHERE latest.event_id=e.id AND latest.user_id=em.user_id AND latest.provider='google_drive'
       ORDER BY latest.created_at DESC LIMIT 1
     )
     WHERE em.user_id=? AND e.deleted_at IS NULL
     GROUP BY e.id,b.id
     ORDER BY COALESCE(e.event_start_date,'0000') DESC,e.created_at DESC`,
  ).bind(user.id).all<BackupEventRow>();
  const copy = labels(locale);
  const eventCards = events.results.map((event) => {
    const active = event.backup_status === "queued" || event.backup_status === "running";
    return `<article class="rounded-3xl border border-[#dfe5f1] bg-white p-5 shadow-sm sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0"><h2 class="truncate text-2xl">${esc(event.eventName)}</h2><p class="mt-1 text-sm text-[#64748b]">${esc(formatEventDates(event, locale))}</p><p class="mt-2 text-sm">${event.media_count} files · ${formatBytes(Number(event.media_bytes))}</p></div>
        <div class="flex flex-wrap gap-2">
          ${connection ? `<form action="/api/account/events/${encodeURIComponent(event.code)}/backups/google" method="post"><input type="hidden" name="locale" value="${locale}"><button ${active ? "disabled" : ""} class="rounded-xl bg-[#4f46e5] px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">Google · ${event.backup_id ? copy.again : copy.backup}</button></form>` : ""}
          ${dropboxConnection ? `<form action="/api/account/events/${encodeURIComponent(event.code)}/backups/dropbox" method="post"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border border-[#0061ff]/25 bg-[#0061ff]/10 px-4 py-3 text-sm font-semibold text-[#0054db]">Dropbox · ${copy.backup}</button></form>` : ""}
        </div>
      </div>
      ${event.media_count === 0 ? `<p class="mt-4 rounded-xl bg-[#f8faff] p-3 text-sm text-[#64748b]">${copy.empty}</p>` : ""}
      ${backupStatusMarkup(event, locale)}
    </article>`;
  }).join("");

  const connected = c.req.query("connected") === "1";
  const oauthError = c.req.query("error") === "oauth";
  return c.html(page(copy.title, `${accountHeader(locale, user)}<main class="mx-auto max-w-5xl p-5 md:p-10">
    <section class="overflow-hidden rounded-[2rem] bg-[#172033] p-6 text-white shadow-xl sm:p-9">
      <p class="text-xs font-semibold uppercase tracking-[.22em] text-[#a5b4fc]">${copy.eyebrow}</p>
      <h1 class="mt-3 text-4xl sm:text-5xl">${copy.title}</h1><p class="mt-4 max-w-2xl text-white/70">${copy.intro}</p>
      ${connected ? `<p class="mt-5 rounded-xl bg-emerald-400/15 p-3 text-sm text-emerald-100">${copy.connected}</p>` : ""}
      ${oauthError ? `<p class="mt-5 rounded-xl bg-red-400/15 p-3 text-sm text-red-100">${locale === "el" ? "Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά." : "The connection could not be completed. Please try again."}</p>` : ""}
    </section>
    <section class="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
      <div class="flex flex-wrap items-center justify-between gap-5"><div class="flex items-center gap-4"><span class="flex h-14 w-14 items-center justify-center rounded-2xl border bg-white shadow-sm">${googleIcon()}</span><div><h2 class="text-2xl">${connection ? copy.connected : copy.disconnected}</h2><p class="mt-1 max-w-xl text-sm text-[#64748b]">${copy.connectHelp}</p></div></div>
      ${connection ? `<form action="/api/cloud/google/disconnect" method="post" onsubmit="return confirm('${locale === "el" ? "Αποσύνδεση του Google Drive;" : "Disconnect Google Drive?"}')"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">${copy.disconnect}</button></form>` : `<a href="/api/cloud/google/connect?locale=${locale}" class="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-5 py-3 font-semibold text-white">${googleIcon()} ${copy.connect}</a>`}
      </div><p class="mt-5 rounded-xl bg-[#f8faff] p-4 text-sm text-[#64748b]">${copy.privacy}</p>
    </section>
    <section class="mt-4 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
      <div class="flex flex-wrap items-center justify-between gap-5"><div class="flex items-center gap-4"><span class="flex h-14 w-14 items-center justify-center rounded-2xl border bg-white shadow-sm">${dropboxIcon()}</span><div><h2 class="text-2xl">${dropboxConnection ? (locale === "el" ? "Το αυτόματο Dropbox backup είναι ενεργό" : "Automatic Dropbox backup is on") : (locale === "el" ? "Σύνδεση Dropbox" : "Connect Dropbox")}</h2><p class="mt-1 max-w-xl text-sm text-[#64748b]">${locale === "el" ? "Το Memboux χρησιμοποιεί μόνο τον δικό του φάκελο εφαρμογής στο προσωπικό Dropbox σου." : "Memboux uses only its dedicated app folder inside your personal Dropbox."}</p></div></div>
      ${dropboxConnection ? `<form action="/api/cloud/dropbox/disconnect" method="post" onsubmit="return confirm('${locale === "el" ? "Αποσύνδεση του Dropbox;" : "Disconnect Dropbox?"}')"><input type="hidden" name="locale" value="${locale}"><button class="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">${copy.disconnect}</button></form>` : dropboxConfigured ? `<a href="/api/cloud/dropbox/connect?locale=${locale}" class="inline-flex items-center gap-2 rounded-xl bg-[#0061ff] px-5 py-3 font-semibold text-white">${dropboxIcon()} ${locale === "el" ? "Σύνδεση Dropbox" : "Connect Dropbox"}</a>` : `<span class="rounded-xl bg-[#f1f5f9] px-4 py-3 text-sm text-[#64748b]">${locale === "el" ? "Αναμένεται ρύθμιση εφαρμογής Dropbox" : "Dropbox app setup required"}</span>`}
      </div>
    </section>
    <div class="mt-9 flex items-center justify-between"><h2 class="text-3xl">${copy.events}</h2><span class="text-sm text-[#64748b]">${events.results.length}</span></div>
    <div class="mt-4 grid gap-4">${eventCards || `<div class="rounded-3xl bg-white p-8 text-center text-[#64748b]">${locale === "el" ? "Δεν έχεις event για backup ακόμη." : "You do not have any events to back up yet."}</div>`}</div>
  </main><script>(()=>{const labels=${JSON.stringify({ queued: copy.queued, running: copy.running, completed: copy.completed, failed: copy.failed })};const poll=async box=>{try{const response=await fetch('/api/backups/'+box.dataset.backupStatus,{credentials:'include'});if(!response.ok)return;const backup=await response.json();box.querySelector('[data-status-label]').textContent=labels[backup.status]||backup.status;box.querySelector('[data-status-count]').textContent=backup.completed_items+'/'+backup.total_items;const percent=backup.total_items?Math.round(backup.completed_items/backup.total_items*100):(backup.status==='completed'?100:0);box.querySelector('[data-status-progress]').style.width=percent+'%';const error=box.querySelector('[data-status-error]');if(backup.error_message){error.textContent=backup.error_message;error.classList.remove('hidden')}const link=box.querySelector('[data-drive-link]');if(backup.provider_folder_id){link.href='https://drive.google.com/drive/folders/'+encodeURIComponent(backup.provider_folder_id);link.classList.remove('hidden')}if(backup.status==='queued'||backup.status==='running')setTimeout(()=>poll(box),2500);else setTimeout(()=>location.reload(),900)}catch{setTimeout(()=>poll(box),5000)}};document.querySelectorAll('[data-active="true"]').forEach(poll)})()<\/script>${logoutScript(locale)}`, { locale }));
});

backupRoutes.get("/api/cloud/google/connect", async (c) => {
  const locale = normalizeLocale(c.req.query("locale") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  const state = randomOAuthState();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO cloud_oauth_states (state_hash,user_id,provider,locale,expires_at,created_at) VALUES (?,?,?,?,?,?)",
  ).bind(await sha256(state), user.id, "google_drive", locale, now + 10 * 60 * 1000, now).run();
  return c.redirect(googleDriveAuthorizationUrl(c.env.GOOGLE_CLIENT_ID, state));
});

backupRoutes.get("/api/cloud/google/callback", async (c) => {
  const state = c.req.query("state") ?? "";
  const stored = state ? await c.env.DB.prepare(
    "SELECT state_hash,user_id,locale,expires_at FROM cloud_oauth_states WHERE state_hash=? AND provider='google_drive'",
  ).bind(await sha256(state)).first<{ state_hash: string; user_id: string; locale: Locale; expires_at: number }>() : null;
  const locale = normalizeLocale(stored?.locale ?? "en");
  if (!stored || stored.expires_at <= Date.now()) return c.redirect(`/${locale}/backups?error=oauth`);
  await c.env.DB.prepare("DELETE FROM cloud_oauth_states WHERE state_hash=?").bind(stored.state_hash).run();
  const user = await currentUser(c);
  if (!user || user.id !== stored.user_id || c.req.query("error") || !c.req.query("code")) {
    return c.redirect(`/${locale}/backups?error=oauth`);
  }
  try {
    const token = await exchangeGoogleDriveCode(c.env, c.req.query("code")!);
    const existing = await c.env.DB.prepare(
      "SELECT * FROM cloud_connections WHERE user_id=? AND provider='google_drive'",
    ).bind(user.id).first<CloudConnectionRow>();
    let encryptedToken = existing?.encrypted_refresh_token;
    let tokenIv = existing?.token_iv;
    if (token.refresh_token) {
      const encrypted = await encryptDriveRefreshToken(c.env.BETTER_AUTH_SECRET, user.id, token.refresh_token);
      encryptedToken = encrypted.encryptedToken;
      tokenIv = encrypted.iv;
    }
    if (!encryptedToken || !tokenIv) throw new Error("Google did not grant offline access");
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO cloud_connections (id,user_id,provider,encrypted_refresh_token,token_iv,scope,root_folder_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_refresh_token=excluded.encrypted_refresh_token,
       token_iv=excluded.token_iv,scope=excluded.scope,updated_at=excluded.updated_at`,
    ).bind(
      existing?.id ?? crypto.randomUUID(), user.id, "google_drive", encryptedToken, tokenIv,
      token.scope ?? GOOGLE_DRIVE_SCOPE, existing?.root_folder_id ?? null, existing?.created_at ?? now, now,
    ).run();
    c.executionCtx.waitUntil(
      queueAllGoogleDriveBackupsForUser(c.env, user.id).catch((error) => {
        console.error(JSON.stringify({
          event: "drive_initial_sync_failed",
          userId: user.id,
          error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
        }));
      }),
    );
    return c.redirect(`/${locale}/backups?connected=1`);
  } catch (error) {
    console.error("Google Drive OAuth callback failed", error instanceof Error ? error.message : "unknown");
    return c.redirect(`/${locale}/backups?error=oauth`);
  }
});

backupRoutes.post("/api/cloud/google/disconnect", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const connection = await c.env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='google_drive'",
  ).bind(user.id).first<CloudConnectionRow>();
  if (connection) {
    try {
      const token = await decryptDriveRefreshToken(
        c.env.BETTER_AUTH_SECRET, user.id, connection.encrypted_refresh_token, connection.token_iv,
      );
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch (error) {
      console.error("Google Drive token revocation failed", error instanceof Error ? error.message : "unknown");
    }
    await c.env.DB.prepare("DELETE FROM cloud_connections WHERE id=?").bind(connection.id).run();
  }
  return c.redirect(`/${locale}/backups`, 303);
});

backupRoutes.get("/api/cloud/dropbox/connect", async (c) => {
  const locale = normalizeLocale(c.req.query("locale") ?? "en");
  const user = await currentUser(c);
  if (!user) return c.redirect(`/${locale}/login`);
  if (!c.env.DROPBOX_APP_KEY || !c.env.DROPBOX_APP_SECRET) return c.text("Dropbox is not configured", 503);
  const state = randomOAuthState();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO cloud_oauth_states (state_hash,user_id,provider,locale,expires_at,created_at) VALUES (?,?,?,?,?,?)",
  ).bind(await sha256(state), user.id, "dropbox", locale, now + 10 * 60 * 1000, now).run();
  return c.redirect(dropboxAuthorizationUrl(c.env.DROPBOX_APP_KEY, state));
});

backupRoutes.get("/api/cloud/dropbox/callback", async (c) => {
  const state = c.req.query("state") ?? "";
  const stored = state ? await c.env.DB.prepare(
    "SELECT state_hash,user_id,locale,expires_at FROM cloud_oauth_states WHERE state_hash=? AND provider='dropbox'",
  ).bind(await sha256(state)).first<{ state_hash: string; user_id: string; locale: Locale; expires_at: number }>() : null;
  const locale = normalizeLocale(stored?.locale ?? "en");
  if (!stored || stored.expires_at <= Date.now()) return c.redirect(`/${locale}/backups?error=oauth`);
  await c.env.DB.prepare("DELETE FROM cloud_oauth_states WHERE state_hash=?").bind(stored.state_hash).run();
  const user = await currentUser(c);
  if (!user || user.id !== stored.user_id || c.req.query("error") || !c.req.query("code")) {
    return c.redirect(`/${locale}/backups?error=oauth`);
  }
  try {
    const token = await exchangeDropboxCode(c.env, c.req.query("code")!);
    if (!token.refresh_token) throw new Error("Dropbox did not grant offline access");
    const encrypted = await encryptDropboxRefreshToken(c.env.BETTER_AUTH_SECRET, user.id, token.refresh_token);
    const existing = await c.env.DB.prepare(
      "SELECT * FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
    ).bind(user.id).first<CloudConnectionRow>();
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO cloud_connections (id,user_id,provider,encrypted_refresh_token,token_iv,scope,root_folder_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_refresh_token=excluded.encrypted_refresh_token,
       token_iv=excluded.token_iv,scope=excluded.scope,updated_at=excluded.updated_at`,
    ).bind(
      existing?.id ?? crypto.randomUUID(), user.id, "dropbox", encrypted.encryptedToken, encrypted.iv,
      token.scope ?? DROPBOX_SCOPE, existing?.root_folder_id ?? null, existing?.created_at ?? now, now,
    ).run();
    c.executionCtx.waitUntil(queueAllDropboxBackupsForUser(c.env, user.id).catch((error) => {
      console.error(JSON.stringify({
        event: "dropbox_initial_sync_failed",
        userId: user.id,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      }));
    }));
    return c.redirect(`/${locale}/backups?connected=1`);
  } catch (error) {
    console.error("Dropbox OAuth callback failed", error instanceof Error ? error.message : "unknown");
    return c.redirect(`/${locale}/backups?error=oauth`);
  }
});

backupRoutes.post("/api/cloud/dropbox/disconnect", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? "en"));
  const connection = await c.env.DB.prepare(
    "SELECT * FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
  ).bind(user.id).first<CloudConnectionRow>();
  if (connection) {
    try {
      const refreshToken = await decryptDropboxRefreshToken(
        c.env.BETTER_AUTH_SECRET, user.id, connection.encrypted_refresh_token, connection.token_iv,
      );
      if (c.env.DROPBOX_APP_KEY && c.env.DROPBOX_APP_SECRET) {
        const token = await exchangeDropboxRefreshToken(c.env, refreshToken);
        if (token.access_token) {
          await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
            method: "POST",
            headers: { Authorization: `Bearer ${token.access_token}` },
          });
        }
      }
    } catch (error) {
      console.error("Dropbox token revocation failed", error instanceof Error ? error.message : "unknown");
    }
    await c.env.DB.prepare("DELETE FROM cloud_connections WHERE id=?").bind(connection.id).run();
  }
  return c.redirect(`/${locale}/backups`, 303);
});

backupRoutes.post("/api/account/events/:code/backups/google", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const member = await c.env.DB.prepare(
    "SELECT 1 FROM event_members WHERE event_id=? AND user_id=?",
  ).bind(event.id, user.id).first();
  if (!member) return c.text("You do not have access to this event", 403);
  const connection = await c.env.DB.prepare(
    "SELECT 1 FROM cloud_connections WHERE user_id=? AND provider='google_drive'",
  ).bind(user.id).first();
  if (!connection) return c.text("Connect Google Drive before creating a backup", 409);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  await queueGoogleDriveBackupForEvent(c.env, event.id, user.id);
  return c.redirect(`/${locale}/backups`, 303);
});

backupRoutes.post("/api/account/events/:code/backups/dropbox", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Event not found", 404);
  const member = await c.env.DB.prepare(
    "SELECT 1 FROM event_members WHERE event_id=? AND user_id=?",
  ).bind(event.id, user.id).first();
  if (!member) return c.text("You do not have access to this event", 403);
  const connection = await c.env.DB.prepare(
    "SELECT 1 FROM cloud_connections WHERE user_id=? AND provider='dropbox'",
  ).bind(user.id).first();
  if (!connection) return c.text("Connect Dropbox before creating a backup", 409);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? event.default_locale));
  await queueDropboxBackupForEvent(c.env, event.id, user.id);
  return c.redirect(`/${locale}/backups`, 303);
});

backupRoutes.get("/api/backups/:id", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  const backup = await c.env.DB.prepare(
    `SELECT id,status,total_items,completed_items,failed_items,total_bytes,completed_bytes,
      provider_folder_id,error_message,created_at,started_at,completed_at
     FROM event_backups WHERE id=? AND user_id=?`,
  ).bind(c.req.param("id"), user.id).first<EventBackupRow>();
  if (!backup) return c.json({ message: "Backup not found" }, 404);
  return c.json(backup);
});
