import { Hono } from "hono";

type Bindings = { DB: D1Database; MEDIA: R2Bucket };
type EventRow = { id: string; code: string; couple: string; admin_token_hash: string; created_at: number; expires_at: number };
type MediaRow = { id: string; event_id: string; object_key: string; media_type: "image" | "video"; content_type: string; uploaded_by: string; uploaded_at: number; size_bytes: number };

const app = new Hono<{ Bindings: Bindings }>();
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);

const esc = (value: unknown) => String(value ?? "").replace(/[&<>'\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[ch]!));
const randomCode = () => crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");

function page(title: string, body: string) {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><script src="https://cdn.tailwindcss.com"><\/script></head><body class="min-h-screen bg-gradient-to-br from-rose-50 via-white to-violet-50 text-slate-800">${body}</body></html>`;
}

async function getEvent(db: D1Database, code: string) {
  return db.prepare("SELECT * FROM events WHERE code = ?").bind(code.toUpperCase()).first<EventRow>();
}

async function getMedia(db: D1Database, eventId: string) {
  const result = await db.prepare("SELECT * FROM media WHERE event_id = ? ORDER BY uploaded_at DESC").bind(eventId).all<MediaRow>();
  return result.results;
}

function cards(items: MediaRow[]) {
  return items.map((m) => `<article class="overflow-hidden rounded-2xl bg-slate-100 shadow-sm"><div class="aspect-square">${m.media_type === "image" ? `<img src="/media/${encodeURIComponent(m.id)}" alt="Ανέβηκε από ${esc(m.uploaded_by)}" loading="lazy" class="h-full w-full object-cover">` : `<video src="/media/${encodeURIComponent(m.id)}" controls preload="metadata" class="h-full w-full object-cover"></video>`}</div><p class="px-4 py-3 text-sm text-slate-600">Από ${esc(m.uploaded_by)}</p></article>`).join("");
}

app.get("/", (c) => c.html(page("Wedding Gallery", `<main class="mx-auto flex min-h-screen max-w-lg items-center p-5"><section class="w-full rounded-3xl bg-white p-8 shadow-xl"><p class="mb-2 text-center text-sm font-semibold uppercase tracking-[.25em] text-rose-500">Wedding Gallery</p><h1 class="mb-3 text-center text-4xl font-bold">Οι αναμνήσεις σας, μαζί</h1><p class="mb-8 text-center text-slate-500">Δημιούργησε μια ιδιωτική συλλογή για τον γάμο σου.</p><form action="/api/events" method="post" class="space-y-3"><input name="couple" required maxlength="100" placeholder="π.χ. Μαρία & Νίκος" class="w-full rounded-xl border px-4 py-3"><button class="w-full rounded-xl bg-gradient-to-r from-rose-500 to-violet-500 py-3 font-semibold text-white">Δημιουργία εκδήλωσης</button></form><div class="my-7 border-t"></div><form id="join" class="space-y-3"><input id="code" required maxlength="6" placeholder="Κωδικός πρόσκλησης" class="w-full rounded-xl border px-4 py-3 uppercase"><button class="w-full rounded-xl bg-slate-700 py-3 font-semibold text-white">Είσοδος ως καλεσμένος</button></form></section></main><script>document.getElementById('join').addEventListener('submit',e=>{e.preventDefault();location.href='/gallery/'+document.getElementById('code').value.trim().toUpperCase()})<\/script>`)));

app.post("/api/events", async (c) => {
  const data = await c.req.parseBody();
  const couple = String(data.couple ?? "").trim().slice(0, 100);
  if (!couple) return c.text("Συμπλήρωσε τα ονόματα.", 400);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await c.env.DB.prepare("INSERT INTO events (id,code,couple,admin_token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)").bind(id, code, couple, tokenHash, now, now + 365 * 86400000).run();
      return c.redirect(`/dashboard/${code}?token=${encodeURIComponent(token)}`, 303);
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  return c.text("Δεν ήταν δυνατή η δημιουργία.", 500);
});

app.get("/dashboard/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  const token = c.req.query("token") ?? "";
  if (!token || await sha256(token) !== event.admin_token_hash) return c.text("Δεν έχεις πρόσβαση σε αυτή τη διαχείριση.", 403);
  const items = await getMedia(c.env.DB, event.id);
  const guestUrl = `${new URL(c.req.url).origin}/gallery/${event.code}`;
  return c.html(page(`${event.couple} – Διαχείριση`, `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 shadow-lg"><p class="text-sm font-semibold text-rose-500">ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ</p><h1 class="mt-2 text-4xl font-bold">${esc(event.couple)}</h1><p class="mt-3">Κωδικός: <strong class="font-mono text-2xl text-violet-600">${esc(event.code)}</strong></p><p class="mt-5 text-sm text-slate-500">Φύλαξε το URL αυτής της σελίδας. Είναι το ιδιωτικό admin link σου.</p><div class="mt-5 flex gap-2"><input id="link" readonly value="${esc(guestUrl)}" class="min-w-0 flex-1 rounded-xl border px-4 py-3"><button id="copy" class="rounded-xl bg-slate-800 px-5 text-white">Αντιγραφή</button></div></section><section class="rounded-3xl bg-white p-7 shadow-lg"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-slate-500">Δεν υπάρχουν uploads ακόμη.</p>`}</section></main><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value)<\/script>`));
});

app.get("/gallery/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  const items = await getMedia(c.env.DB, event.id);
  return c.html(page(`${event.couple} – Gallery`, `<main class="mx-auto max-w-6xl p-5 md:p-10"><section class="mb-6 rounded-3xl bg-white p-7 text-center shadow-lg"><p class="text-sm font-semibold uppercase tracking-[.25em] text-rose-500">Wedding Gallery</p><h1 class="mt-2 text-4xl font-bold">${esc(event.couple)}</h1><p class="mt-2 text-slate-500">Μοιράσου τις αγαπημένες σου στιγμές</p><form action="/api/upload/${event.code}" method="post" enctype="multipart/form-data" class="mx-auto mt-7 max-w-xl space-y-3 text-left"><input name="name" maxlength="60" placeholder="Το όνομά σου" class="w-full rounded-xl border px-4 py-3"><input name="file" required type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" class="w-full rounded-xl border p-3"><p class="text-xs text-slate-500">Μέχρι 20 MB ανά αρχείο. Επίλεξε ένα αρχείο κάθε φορά.</p><button class="w-full rounded-xl bg-gradient-to-r from-rose-500 to-violet-500 py-3 font-semibold text-white">Ανέβασμα</button></form></section><section class="rounded-3xl bg-white p-7 shadow-lg"><h2 class="mb-5 text-2xl font-bold">Gallery (${items.length})</h2>${items.length ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-3">${cards(items)}</div>` : `<p class="py-12 text-center text-slate-500">Γίνε ο πρώτος που θα ανεβάσει μια στιγμή!</p>`}</section></main>`));
});

app.post("/api/upload/:code", async (c) => {
  const event = await getEvent(c.env.DB, c.req.param("code"));
  if (!event) return c.text("Η εκδήλωση δεν βρέθηκε.", 404);
  if (Date.now() > event.expires_at) return c.text("Η εκδήλωση έχει λήξει.", 410);
  const form = await c.req.formData();
  const file = form.get("file");
  const uploadedBy = String(form.get("name") ?? "Ανώνυμος").trim().slice(0, 60) || "Ανώνυμος";
  if (!(file instanceof File)) return c.text("Δεν επιλέχθηκε αρχείο.", 400);
  if (!ALLOWED_TYPES.has(file.type)) return c.text("Μη υποστηριζόμενος τύπος αρχείου.", 415);
  if (file.size > MAX_FILE_SIZE) return c.text("Το αρχείο ξεπερνά τα 20 MB.", 413);
  const id = crypto.randomUUID();
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) : "bin";
  const objectKey = `${event.id}/${id}.${extension}`;
  await c.env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  try {
    await c.env.DB.prepare("INSERT INTO media (id,event_id,object_key,media_type,content_type,uploaded_by,uploaded_at,size_bytes) VALUES (?,?,?,?,?,?,?,?)").bind(id, event.id, objectKey, file.type.startsWith("image/") ? "image" : "video", file.type, uploadedBy, Date.now(), file.size).run();
  } catch (error) {
    await c.env.MEDIA.delete(objectKey);
    throw error;
  }
  return c.redirect(`/gallery/${event.code}`, 303);
});

app.get("/media/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT object_key, content_type FROM media WHERE id = ?").bind(c.req.param("id")).first<{ object_key: string; content_type: string }>();
  if (!row) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const object = await c.env.MEDIA.get(row.object_key);
  if (!object) return c.text("Το αρχείο δεν βρέθηκε.", 404);
  const headers = new Headers({ "Content-Type": row.content_type, "Cache-Control": "public, max-age=31536000, immutable", "ETag": object.httpEtag, "X-Content-Type-Options": "nosniff" });
  return new Response(object.body, { headers });
});

app.onError((error, c) => { console.error(error); return c.text("Παρουσιάστηκε προσωρινό σφάλμα.", 500); });
export default app;
