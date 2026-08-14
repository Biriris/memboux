import { Hono, type Context } from "hono";
import { getEventRole, roleCan } from "../access";
import {
  activateComplimentaryEventOrder,
  complimentaryEventActivationAvailable,
  commerceLaunchReady,
  commerceProductDescription,
  commerceProductName,
  eventProducts,
  formatCommerceMoney,
  getCommerceLaunchSettings,
  saveDraftEventOrder,
  type CommerceOrder,
  type CommerceProduct,
} from "../commerce";
import type { Bindings } from "../domain";
import { EVENT_TRIAL_MEDIA_LIMIT, eventMediaUsage, getEventAccess, startEventTrial } from "../event-access";
import { normalizeLocale, type Locale } from "../i18n";
import { getEvent } from "../repositories";
import { currentUser } from "../session";
import { esc } from "../utils";
import { eventHeader, logoutScript, page } from "../views/shared";

export const commerceRoutes = new Hono<{ Bindings: Bindings }>();

const complimentaryCopy: Record<Locale, { activate: string; available: string; detail: string; activated: string }> = {
  en: { activate: "Activate complimentary beta package", available: "Complimentary beta access", detail: "No payment is recorded. During beta, the selected capacity activates immediately for this event.", activated: "The beta package is active. The event limit and access were updated immediately." },
  el: { activate: "Ενεργοποίηση δωρεάν beta πακέτου", available: "Δωρεάν beta πρόσβαση", detail: "Δεν καταγράφεται πληρωμή. Στη beta περίοδο, η επιλεγμένη χωρητικότητα ενεργοποιείται άμεσα για αυτό το event.", activated: "Το beta πακέτο ενεργοποιήθηκε. Το όριο και η πρόσβαση του event ενημερώθηκαν άμεσα." },
  fr: { activate: "Activer le forfait bêta offert", available: "Accès bêta offert", detail: "Aucun paiement n’est enregistré. Pendant la bêta, la capacité choisie est activée immédiatement pour cet événement.", activated: "Le forfait bêta est actif. La limite et l’accès ont été mis à jour immédiatement." },
  de: { activate: "Kostenloses Beta-Paket aktivieren", available: "Kostenloser Beta-Zugang", detail: "Es wird keine Zahlung erfasst. Während der Beta wird die gewählte Kapazität sofort für dieses Event aktiviert.", activated: "Das Beta-Paket ist aktiv. Limit und Zugriff wurden sofort aktualisiert." },
  es: { activate: "Activar paquete beta gratuito", available: "Acceso beta gratuito", detail: "No se registra ningún pago. Durante la beta, la capacidad elegida se activa inmediatamente para este evento.", activated: "El paquete beta está activo. El límite y el acceso se actualizaron de inmediato." },
  it: { activate: "Attiva il pacchetto beta gratuito", available: "Accesso beta gratuito", detail: "Non viene registrato alcun pagamento. Durante la beta, la capacità scelta si attiva subito per questo evento.", activated: "Il pacchetto beta è attivo. Limite e accesso sono stati aggiornati subito." },
};

export const commerceCheckoutCopy: Record<Locale, {
  back: string; eyebrow: string; title: string; lead: string; oneTime: string;
  subscription: string; files: string; days: string; originals: string;
  guestUploads: string; select: string; selected: string; save: string;
  current: string; preview: string; trial: string; unlocked: string; expired: string;
  trialIncludes: string; trialFiles: string; trialDays: string; noOriginals: string;
  unlockTitle: string; unlockText: string; noCart: string; disabled: string;
  noCard: string; legalText: string; directTitle: string; directPoints: string[];
  invalid: string; indicative: string; savedNotice: string;
  draftTitle: string; eventLabel: string; packageLabel: string; totalLabel: string;
  noChargeLabel: string; draftReference: string;
}> = {
  en: {
    back: "Back to event", eyebrow: "Unlock this event", title: "Keep every original, not just the preview.",
    lead: "Choose the capacity for this event. Your selection is saved, but no payment or card request can start before the legal commercial launch.",
    oneTime: "One-time event unlock", subscription: "Subscription", files: "photos & videos",
    days: "days of access", originals: "Original-quality downloads", guestUploads: "Guest uploads",
    select: "Select package", selected: "Selected", save: "Save package for launch",
    current: "Current access", preview: "Private preview", trial: "Memboux Free", unlocked: "Unlocked", expired: "Free access expired",
    trialIncludes: "Memboux Free lets you use the real guest experience without a card.",
    trialFiles: "50 lifetime upload slots (deletions do not return slots)", trialDays: "37 days after activation", noOriginals: "No original downloads",
    unlockTitle: "What payment will unlock", unlockText: "More contributions, longer access and every original file ready to keep.",
    noCart: "No cart: this package belongs only to this event.", disabled: "Payments are not active yet",
    noCard: "No card details are requested", legalText: "The future Stripe Checkout will open only after company, tax, invoicing, refund and sales terms are ready.",
    directTitle: "Why direct event checkout", directPoints: ["Less friction than a cart", "No accidental package for the wrong event", "Immutable order and entitlement snapshot"],
    invalid: "Invalid package.", indicative: "Indicative launch price", savedNotice: "Package preference saved for this event. No order was placed and no payment was made.",
    draftTitle: "Saved package preference", eventLabel: "Event", packageLabel: "Package",
    totalLabel: "Indicative total", noChargeLabel: "Due now: €0 · No charge", draftReference: "Draft reference",
  },
  el: {
    back: "Πίσω στο event", eyebrow: "Ξεκλείδωσε αυτό το event", title: "Κράτησε κάθε πρωτότυπο, όχι μόνο το preview.",
    lead: "Επίλεξε τη χωρητικότητα αυτού του event. Η επιλογή αποθηκεύεται, αλλά δεν μπορεί να ξεκινήσει πληρωμή ή αίτημα κάρτας πριν από τη νόμιμη εμπορική έναρξη.",
    oneTime: "Εφάπαξ ξεκλείδωμα event", subscription: "Συνδρομή", files: "φωτογραφίες & βίντεο",
    days: "ημέρες πρόσβασης", originals: "Λήψεις αρχείων σε αρχική ποιότητα", guestUploads: "Uploads καλεσμένων",
    select: "Επιλογή πακέτου", selected: "Επιλεγμένο", save: "Αποθήκευση πακέτου για το launch",
    current: "Τρέχουσα πρόσβαση", preview: "Ιδιωτικό preview", trial: "Memboux Free", unlocked: "Ξεκλειδωμένο", expired: "Η δωρεάν πρόσβαση έληξε",
    trialIncludes: "Το Memboux Free σου επιτρέπει να χρησιμοποιήσεις την πραγματική εμπειρία καλεσμένων χωρίς κάρτα.",
    trialFiles: "50 συνολικές θέσεις upload (οι διαγραφές δεν επιστρέφουν θέσεις)", trialDays: "37 ημέρες από την ενεργοποίηση", noOriginals: "Χωρίς λήψεις πρωτοτύπων",
    unlockTitle: "Τι θα ξεκλειδώνει η πληρωμή", unlockText: "Περισσότερες συνεισφορές, μεγαλύτερη πρόσβαση και όλα τα πρωτότυπα έτοιμα να τα κρατήσεις.",
    noCart: "Χωρίς καλάθι: το πακέτο ανήκει μόνο σε αυτό το event.", disabled: "Οι πληρωμές δεν είναι ακόμη ενεργές",
    noCard: "Δεν ζητούνται στοιχεία κάρτας", legalText: "Το μελλοντικό Stripe Checkout θα ανοίξει μόνο αφού είναι έτοιμα εταιρεία, φορολογία, τιμολόγηση, επιστροφές και όροι πώλησης.",
    directTitle: "Γιατί άμεσο checkout ανά event", directPoints: ["Λιγότερα βήματα από ένα καλάθι", "Καμία αγορά για λάθος event", "Αμετάβλητο snapshot παραγγελίας και δικαιωμάτων"],
    invalid: "Μη έγκυρο πακέτο.", indicative: "Ενδεικτική τιμή launch", savedNotice: "Η επιλογή πακέτου αποθηκεύτηκε για αυτό το event. Δεν δημιουργήθηκε αγορά και δεν έγινε καμία χρέωση.",
    draftTitle: "Αποθηκευμένη επιλογή πακέτου", eventLabel: "Event", packageLabel: "Πακέτο",
    totalLabel: "Ενδεικτικό σύνολο", noChargeLabel: "Πληρωτέο τώρα: 0 € · Καμία χρέωση", draftReference: "Κωδικός προσχεδίου",
  },
  fr: {
    back: "Retour à l’événement", eyebrow: "Débloquer cet événement", title: "Gardez chaque original, pas seulement l’aperçu.",
    lead: "Choisissez la capacité de cet événement. Le choix est enregistré, mais aucun paiement ni carte ne sera demandé avant le lancement commercial légal.",
    oneTime: "Déblocage unique", subscription: "Abonnement", files: "photos et vidéos", days: "jours d’accès",
    originals: "Téléchargements en qualité originale", guestUploads: "Ajouts des invités", select: "Choisir",
    selected: "Sélectionné", save: "Enregistrer pour le lancement", current: "Accès actuel", preview: "Aperçu privé",
    trial: "Essai de 7 jours", unlocked: "Débloqué", expired: "Essai expiré",
    trialIncludes: "L’essai montre toute l’expérience invité avec des limites qui préservent la valeur payante.",
    trialFiles: "50 emplacements d’ajout au total (les suppressions ne les rendent pas)", trialDays: "37 jours après activation", noOriginals: "Pas de téléchargement des originaux",
    unlockTitle: "Ce que le paiement débloquera", unlockText: "Plus de contributions, un accès prolongé et tous les originaux à conserver.",
    noCart: "Pas de panier : ce forfait appartient uniquement à cet événement.", disabled: "Paiements pas encore actifs",
    noCard: "Aucune carte demandée", legalText: "Stripe Checkout ne sera activé qu’après les étapes légales, fiscales, de facturation et de remboursement.",
    directTitle: "Pourquoi un paiement direct", directPoints: ["Moins de friction", "Aucun forfait sur le mauvais événement", "Commande et droits figés"],
    invalid: "Forfait invalide.", indicative: "Prix de lancement indicatif", savedNotice: "Votre préférence a été enregistrée pour cet événement. Aucune commande ni aucun paiement n’a été effectué.",
    draftTitle: "Préférence enregistrée", eventLabel: "Événement", packageLabel: "Forfait",
    totalLabel: "Total indicatif", noChargeLabel: "À payer maintenant : 0 € · Aucun débit", draftReference: "Référence du brouillon",
  },
  de: {
    back: "Zurück zum Event", eyebrow: "Dieses Event freischalten", title: "Behalte jedes Original, nicht nur die Vorschau.",
    lead: "Wähle die Kapazität für dieses Event. Die Auswahl wird gespeichert, aber vor dem rechtmäßigen Verkaufsstart gibt es keine Zahlung oder Kartenabfrage.",
    oneTime: "Einmalige Event-Freischaltung", subscription: "Abonnement", files: "Fotos & Videos", days: "Tage Zugriff",
    originals: "Downloads in Originalqualität", guestUploads: "Uploads von Gästen", select: "Paket wählen",
    selected: "Ausgewählt", save: "Paket für den Start speichern", current: "Aktueller Zugriff", preview: "Private Vorschau",
    trial: "7-Tage-Test", unlocked: "Freigeschaltet", expired: "Test abgelaufen",
    trialIncludes: "Der Test zeigt das vollständige Gästeerlebnis mit Grenzen, die den Bezahlwert schützen.",
    trialFiles: "50 Upload-Plätze insgesamt (Löschen gibt keinen Platz zurück)", trialDays: "37 Tage ab Aktivierung", noOriginals: "Keine Original-Downloads",
    unlockTitle: "Was die Zahlung freischaltet", unlockText: "Mehr Beiträge, längerer Zugriff und alle Originale zum Aufbewahren.",
    noCart: "Kein Warenkorb: Dieses Paket gehört nur zu diesem Event.", disabled: "Zahlungen sind noch nicht aktiv",
    noCard: "Keine Kartendaten erforderlich", legalText: "Stripe Checkout startet erst nach Unternehmens-, Steuer-, Rechnungs-, Rückerstattungs- und Verkaufsbedingungen.",
    directTitle: "Warum direkter Event-Checkout", directPoints: ["Weniger Schritte", "Kein Paket für das falsche Event", "Unveränderlicher Bestell-Snapshot"],
    invalid: "Ungültiges Paket.", indicative: "Voraussichtlicher Startpreis", savedNotice: "Deine Paketauswahl wurde für dieses Event gespeichert. Es wurde keine Bestellung oder Zahlung ausgeführt.",
    draftTitle: "Gespeicherte Paketauswahl", eventLabel: "Event", packageLabel: "Paket",
    totalLabel: "Voraussichtlicher Gesamtpreis", noChargeLabel: "Jetzt fällig: 0 € · Keine Belastung", draftReference: "Entwurfsnummer",
  },
  es: {
    back: "Volver al evento", eyebrow: "Desbloquear este evento", title: "Conserva cada original, no solo la vista previa.",
    lead: "Elige la capacidad de este evento. La selección se guarda, pero no habrá pago ni solicitud de tarjeta antes del lanzamiento comercial legal.",
    oneTime: "Desbloqueo único", subscription: "Suscripción", files: "fotos y vídeos", days: "días de acceso",
    originals: "Descargas en calidad original", guestUploads: "Subidas de invitados", select: "Elegir paquete",
    selected: "Seleccionado", save: "Guardar para el lanzamiento", current: "Acceso actual", preview: "Vista previa privada",
    trial: "Prueba de 7 días", unlocked: "Desbloqueado", expired: "Prueba vencida",
    trialIncludes: "La prueba muestra toda la experiencia con límites que protegen el valor de pago.",
    trialFiles: "50 espacios de subida totales (eliminarlos no devuelve espacios)", trialDays: "37 días desde la activación", noOriginals: "Sin descargas originales",
    unlockTitle: "Qué desbloqueará el pago", unlockText: "Más aportaciones, acceso prolongado y todos los originales para conservar.",
    noCart: "Sin carrito: este paquete pertenece solo a este evento.", disabled: "Los pagos aún no están activos",
    noCard: "No se solicitan datos de tarjeta", legalText: "Stripe Checkout se abrirá solo tras completar empresa, impuestos, facturación, reembolsos y términos.",
    directTitle: "Por qué pago directo", directPoints: ["Menos pasos", "Sin comprar para el evento equivocado", "Pedido y derechos inmutables"],
    invalid: "Paquete no válido.", indicative: "Precio de lanzamiento indicativo", savedNotice: "Tu preferencia se guardó para este evento. No se realizó ningún pedido ni pago.",
    draftTitle: "Preferencia guardada", eventLabel: "Evento", packageLabel: "Paquete",
    totalLabel: "Total indicativo", noChargeLabel: "A pagar ahora: 0 € · Sin cargo", draftReference: "Referencia del borrador",
  },
  it: {
    back: "Torna all’evento", eyebrow: "Sblocca questo evento", title: "Conserva ogni originale, non solo l’anteprima.",
    lead: "Scegli la capacità per questo evento. La selezione viene salvata, ma nessun pagamento o carta sarà richiesto prima del lancio commerciale legale.",
    oneTime: "Sblocco evento una tantum", subscription: "Abbonamento", files: "foto e video", days: "giorni di accesso",
    originals: "Download in qualità originale", guestUploads: "Caricamenti degli invitati", select: "Scegli pacchetto",
    selected: "Selezionato", save: "Salva per il lancio", current: "Accesso attuale", preview: "Anteprima privata",
    trial: "Prova di 7 giorni", unlocked: "Sbloccato", expired: "Prova scaduta",
    trialIncludes: "La prova mostra l’esperienza completa con limiti che proteggono il valore a pagamento.",
    trialFiles: "50 spazi di upload totali (eliminare non restituisce spazi)", trialDays: "37 giorni dall’attivazione", noOriginals: "Nessun download originale",
    unlockTitle: "Cosa sbloccherà il pagamento", unlockText: "Più contributi, accesso più lungo e tutti gli originali da conservare.",
    noCart: "Nessun carrello: questo pacchetto appartiene solo a questo evento.", disabled: "I pagamenti non sono ancora attivi",
    noCard: "Nessun dato carta richiesto", legalText: "Stripe Checkout partirà solo dopo azienda, fisco, fatturazione, rimborsi e condizioni di vendita.",
    directTitle: "Perché checkout diretto", directPoints: ["Meno passaggi", "Nessun pacchetto per l’evento sbagliato", "Ordine e diritti immutabili"],
    invalid: "Pacchetto non valido.", indicative: "Prezzo di lancio indicativo", savedNotice: "La preferenza è stata salvata per questo evento. Non è stato effettuato alcun ordine o pagamento.",
    draftTitle: "Preferenza salvata", eventLabel: "Evento", packageLabel: "Pacchetto",
    totalLabel: "Totale indicativo", noChargeLabel: "Da pagare ora: 0 € · Nessun addebito", draftReference: "Riferimento bozza",
  },
};

async function ownedEvent(c: Context<{ Bindings: Bindings }>) {
  const locale = normalizeLocale(c.req.query("lang") ?? "en");
  const user = await currentUser(c);
  if (!user) return { response: c.redirect(`/${locale}/login`) };
  const event = await getEvent(c.env.DB, c.req.param("code") ?? "");
  if (!event) return { response: c.text("Event not found", 404) };
  const role = await getEventRole(c.env.DB, event.id, user.id);
  if (!roleCan(role, "manage_event"))
    return { response: c.text("Forbidden", 403) };
  return { locale, user, event, role };
}

function accessLabel(locale: Locale, state: string) {
  const c = commerceCheckoutCopy[locale];
  return state === "preview" ? c.preview : state === "trial" ? c.trial
    : state === "expired" ? c.expired : c.unlocked;
}

export function commercePlanSelectionAssets(locale: Locale) {
  const copy = commerceCheckoutCopy[locale];
  const style = `<style>
    [data-product-card][data-selected="true"]{border-color:#7c3aed!important;background:#f6f2ff!important;box-shadow:0 18px 50px rgba(124,58,237,.13)}
    [data-product-card][data-selected="false"]{border-color:#e5dff0!important;background:#fff!important;box-shadow:none}
    [data-product-card][data-selected="true"] [data-product-check],
    [data-product-card][data-selected="true"] [data-product-badge]{border-color:#7c3aed!important;background:#7c3aed!important;color:#fff!important}
    [data-product-card][data-selected="false"] [data-product-check]{border-color:#cfc4dd!important;background:transparent!important;color:inherit!important}
    [data-product-card][data-selected="false"] [data-product-badge]{background:#f2ecfb!important;color:#6d28d9!important}
  </style>`;
  const script = `<script>(()=>{const radios=[...document.querySelectorAll('input[name="productKey"]')],selected=${JSON.stringify(copy.selected)},select=${JSON.stringify(copy.select)};const paint=active=>radios.forEach(radio=>{const card=radio.closest('[data-product-card]');if(!card)return;const on=radio===active&&radio.checked;card.dataset.selected=String(on);card.setAttribute('aria-selected',String(on));const badge=card.querySelector('[data-product-badge]');if(badge)badge.textContent=on?selected:select});radios.forEach(radio=>{radio.addEventListener('input',()=>paint(radio));radio.addEventListener('change',()=>paint(radio))});const checked=radios.find(radio=>radio.checked);if(checked)paint(checked)})()<\/script>`;
  return { style, script };
}

commerceRoutes.get("/dashboard/:code/checkout", async (c) => {
  if (c.req.method === "GET") {
    const locale = normalizeLocale(c.req.query("lang") ?? "en");
    return c.redirect(`/dashboard/${encodeURIComponent(c.req.param("code"))}?lang=${locale}#package-access-title`, 302);
  }
  const context = await ownedEvent(c);
  if ("response" in context) return context.response;
  const { locale, user, event, role } = context;
  const t = commerceCheckoutCopy[locale];
  const [products, draft, access, usage, launchSettings] = await Promise.all([
    eventProducts(c.env.DB),
    c.env.DB.prepare(`SELECT o.*,i.product_key FROM commerce_orders o
      LEFT JOIN commerce_order_items i ON i.order_id=o.id
      WHERE o.user_id=? AND o.event_id=? AND o.status='draft' LIMIT 1`)
      .bind(user.id, event.id).first<CommerceOrder & { product_key: string | null }>(),
    getEventAccess(c.env.DB, event.id),
    eventMediaUsage(c.env.DB, event.id),
    getCommerceLaunchSettings(c.env.DB),
  ]);
  const cards = products.map((product) => {
    const selected = draft?.product_key === product.product_key;
    return `<label data-product-card data-selected="${selected}" aria-selected="${selected}" class="relative flex cursor-pointer flex-col rounded-[1.7rem] border-2 ${selected ? "border-[#7c3aed] bg-[#f6f2ff] shadow-[0_18px_50px_rgba(124,58,237,.13)]" : "border-[#e5dff0] bg-white"} p-6 transition hover:-translate-y-0.5 hover:border-[#a78bfa]"><input type="radio" name="productKey" value="${esc(product.product_key)}" class="sr-only" ${selected ? "checked" : ""} required><div class="flex items-start justify-between gap-4"><div><span class="text-[11px] font-bold uppercase tracking-[.15em] text-[#7c3aed]">${product.billing_model === "one_time" ? t.oneTime : t.subscription}</span><h2 class="mt-2 text-2xl text-[#2b174d]">${esc(commerceProductName(product, locale))}</h2></div><span data-product-check class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-[#cfc4dd]"} text-xs">✓</span></div><p class="mt-3 flex-1 text-sm leading-6 text-[#6f657c]">${esc(commerceProductDescription(product, locale))}</p><ul class="mt-5 space-y-2.5 text-sm text-[#443653]"><li>✓ <strong>${product.media_limit?.toLocaleString(locale) ?? "—"}</strong> ${t.files}</li><li>✓ <strong>${product.event_duration_days ?? "—"}</strong> ${t.days}</li><li>✓ ${t.guestUploads}</li><li>✓ ${t.originals}</li></ul><div class="mt-6 flex items-end justify-between gap-3"><div><span class="block text-[10px] uppercase tracking-wide text-[#8a8093]">${t.indicative}</span><strong class="text-3xl text-[#2b174d]">${esc(formatCommerceMoney(product.amount_minor, product.currency, locale))}</strong></div><span data-product-badge class="rounded-xl ${selected ? "bg-[#7c3aed] text-white" : "bg-[#f2ecfb] text-[#6d28d9]"} px-3 py-2 text-xs font-bold">${selected ? t.selected : t.select}</span></div></label>`;
  }).join("");
  const selectedProduct = products.find((product) => product.product_key === draft?.product_key);
  const launchReady = commerceLaunchReady(launchSettings);
  const beta = complimentaryCopy[locale];
  const complimentaryAvailable = complimentaryEventActivationAvailable({
    accessState: access.access_state,
    launchReady,
    owner: role === "owner",
  });
  const draftSummary = selectedProduct && draft
    ? `<section class="rounded-[1.6rem] border border-[#d9caf1] bg-white p-5 shadow-sm"><div class="flex flex-col gap-3"><div><p class="text-xs font-bold uppercase tracking-[.15em] text-[#7c3aed]">${t.draftTitle}</p><h2 class="mt-2 text-xl">${esc(commerceProductName(selectedProduct, locale))}</h2></div><span class="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">${t.noChargeLabel}</span></div><dl class="mt-5 space-y-3 border-t border-[#eee8f5] pt-4 text-sm"><div class="flex justify-between gap-3"><dt class="text-[#756b82]">${t.eventLabel}</dt><dd class="text-right font-semibold">${esc(event.eventName)}</dd></div><div class="flex justify-between gap-3"><dt class="text-[#756b82]">${t.packageLabel}</dt><dd class="text-right font-semibold">${esc(commerceProductName(selectedProduct, locale))}</dd></div><div class="flex justify-between gap-3"><dt class="text-[#756b82]">${t.totalLabel}</dt><dd class="text-right font-bold">${esc(formatCommerceMoney(draft.total_minor, draft.currency, locale))}</dd></div><div class="flex justify-between gap-3"><dt class="text-[#756b82]">${t.draftReference}</dt><dd class="font-mono text-xs">${esc(draft.id.slice(0, 8).toUpperCase())}</dd></div></dl></section>`
    : "";
  const savedNotice = c.req.query("saved") === "1"
    ? `<p role="status" class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold leading-6 text-emerald-900">${esc(t.savedNotice)}</p>`
    : "";
  const activatedNotice = c.req.query("activated") === "1"
    ? `<p role="status" class="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold leading-6 text-emerald-900">${esc(beta.activated)}</p>`
    : "";
  const checkoutAction = access.access_state === "preview"
    ? `/api/account/events/${encodeURIComponent(event.code)}/checkout/start-trial`
    : complimentaryAvailable
      ? `/api/account/events/${encodeURIComponent(event.code)}/checkout/activate-beta`
      : `/api/account/events/${encodeURIComponent(event.code)}/checkout/draft`;
  const checkoutButton = access.access_state === "preview"
    ? (locale === "el" ? "Επιλογή πακέτου & έναρξη Memboux Free" : "Choose package & start Memboux Free")
    : complimentaryAvailable ? beta.activate : t.save;
  const checkoutStateCard = complimentaryAvailable
    ? `<section class="rounded-[1.7rem] bg-[#2b174d] p-6 text-white shadow-xl"><span class="inline-flex rounded-full bg-emerald-300/20 px-3 py-1 text-xs font-bold text-emerald-100">${esc(beta.available)}</span><h2 class="mt-4 text-2xl">${esc(beta.activate)}</h2><p class="mt-3 text-sm leading-6 text-white/70">${esc(beta.detail)}</p></section>`
    : `<section class="rounded-[1.7rem] bg-[#2b174d] p-6 text-white shadow-xl"><span class="inline-flex rounded-full bg-amber-300/20 px-3 py-1 text-xs font-bold text-amber-100">${t.disabled}</span><h2 class="mt-4 text-2xl">${t.noCard}</h2><p class="mt-3 text-sm leading-6 text-white/70">${t.legalText}</p></section>`;
  const planSelection = commercePlanSelectionAssets(locale);
  const body = `${eventHeader(locale, user, "")}<main data-commerce-launch-ready="${launchReady ? "true" : "false"}" class="mx-auto max-w-7xl p-4 pb-16 sm:p-6 md:p-10"><a href="/dashboard/${encodeURIComponent(event.code)}?lang=${locale}#event-access" class="text-sm font-semibold text-[#7c3aed]">← ${t.back}</a><div class="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]"><section><p class="text-xs font-bold uppercase tracking-[.2em] text-[#f43f8f]">${t.eyebrow}</p><h1 class="mt-3 max-w-4xl text-4xl leading-tight tracking-[-.04em] text-[#2b174d] sm:text-6xl">${t.title}</h1><p class="mt-5 max-w-3xl text-lg leading-8 text-[#6f657c]">${t.lead}</p>${savedNotice}${activatedNotice}<section class="mt-8 grid gap-3 rounded-[1.7rem] border border-[#e4daf4] bg-[#faf8ff] p-5 sm:grid-cols-2"><div><span class="text-xs font-bold uppercase tracking-wide text-[#7c3aed]">${t.current}</span><strong class="mt-2 block text-2xl">${esc(accessLabel(locale, access.access_state))}</strong><p class="mt-2 text-sm text-[#6f657c]">${Number(usage?.total ?? 0)} / ${access.media_limit.toLocaleString(locale)} ${t.files}</p></div><div class="border-t border-[#e4daf4] pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><p class="text-sm leading-6 text-[#6f657c]">${t.trialIncludes}</p><ul class="mt-2 text-sm"><li>• ${t.trialFiles}</li><li>• ${t.trialDays}</li><li>• ${t.noOriginals}</li></ul></div></section><div class="mt-6 rounded-[1.7rem] bg-gradient-to-r from-[#2b174d] to-[#6d28d9] p-6 text-white"><p class="text-xs font-bold uppercase tracking-[.16em] text-[#f9a8d4]">${t.unlockTitle}</p><p class="mt-2 max-w-3xl text-lg leading-7 text-white/80">${t.unlockText}</p><p class="mt-4 text-sm font-semibold text-white">${t.noCart}</p></div><form action="${checkoutAction}" method="post" class="mt-6"><input type="hidden" name="locale" value="${locale}"><div class="grid gap-4 lg:grid-cols-2">${cards}</div><button class="mt-5 w-full rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#f43f8f] px-6 py-4 font-bold text-white shadow-lg sm:w-auto">${esc(checkoutButton)}</button></form></section><aside class="space-y-4 xl:sticky xl:top-6 xl:h-fit">${draftSummary}${checkoutStateCard}<section class="rounded-[1.7rem] border border-[#e5dff0] bg-white p-5"><h3 class="font-semibold text-[#2b174d]">${t.directTitle}</h3><ul class="mt-3 space-y-2 text-sm leading-6 text-[#6f657c]">${t.directPoints.map((point) => `<li>✓ ${esc(point)}</li>`).join("")}</ul></section></aside></div></main>${logoutScript(locale)}`;
  return c.html(page(t.title, `${body}${planSelection.style}${planSelection.script}`, { locale }));
});

commerceRoutes.post("/api/account/events/:code/checkout/draft", async (c) => {
  const context = await ownedEvent(c);
  if ("response" in context) return context.response;
  const { user, event } = context;
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? context.locale));
  const product = await c.env.DB.prepare(
    "SELECT * FROM commerce_products WHERE product_key=? AND scope='event' AND active=1",
  ).bind(String(body.productKey ?? "")).first<CommerceProduct>();
  if (!product) return c.text(commerceCheckoutCopy[locale].invalid, 400);
  await saveDraftEventOrder(c.env.DB, { userId: user.id, eventId: event.id, product, locale });
  return c.redirect(`/dashboard/${event.code}?lang=${locale}&packageSaved=1#package-access-title`, 303);
});

commerceRoutes.post("/api/account/events/:code/checkout/start-trial", async (c) => {
  const context = await ownedEvent(c);
  if ("response" in context) return context.response;
  const { user, event, role } = context;
  if (role !== "owner") return c.text("Only an event owner can start the trial.", 403);
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? context.locale));
  const product = await c.env.DB.prepare(
    "SELECT * FROM commerce_products WHERE product_key=? AND scope='event' AND active=1",
  ).bind(String(body.productKey ?? "")).first<CommerceProduct>();
  if (!product) return c.text(commerceCheckoutCopy[locale].invalid, 400);
  const access = await getEventAccess(c.env.DB, event.id);
  if (access.access_state !== "preview")
    return c.redirect(`/dashboard/${event.code}?lang=${locale}#package-access-title`, 303);
  const usage = await eventMediaUsage(c.env.DB, event.id);
  if (usage.total > EVENT_TRIAL_MEDIA_LIMIT)
    return c.text(locale === "el"
      ? `Το trial υποστηρίζει έως ${EVENT_TRIAL_MEDIA_LIMIT} συνολικά αρχεία.`
      : `The trial supports up to ${EVENT_TRIAL_MEDIA_LIMIT} lifetime media uploads.`, 409);
  await saveDraftEventOrder(c.env.DB, { userId: user.id, eventId: event.id, product, locale });
  await startEventTrial(c.env.DB, event.id);
  console.log(JSON.stringify({
    event: "event_trial_started",
    eventId: event.id,
    userId: user.id,
    productKey: product.product_key,
  }));
  return c.redirect(`/dashboard/${event.code}?lang=${locale}&trialStarted=1#package-access-title`, 303);
});

commerceRoutes.post("/api/account/events/:code/checkout/activate-beta", async (c) => {
  const context = await ownedEvent(c);
  if ("response" in context) return context.response;
  const { user, event, role } = context;
  const body = await c.req.parseBody();
  const locale = normalizeLocale(String(body.locale ?? context.locale));
  if (role !== "owner") return c.text("Only the event owner can activate a package.", 403);
  if (commerceLaunchReady(await getCommerceLaunchSettings(c.env.DB)))
    return c.text("Complimentary beta activation is no longer available.", 409);
  const product = await c.env.DB.prepare(
    "SELECT * FROM commerce_products WHERE product_key=? AND scope='event' AND active=1",
  ).bind(String(body.productKey ?? "")).first<CommerceProduct>();
  if (!product) return c.text(commerceCheckoutCopy[locale].invalid, 400);

  const orderId = await saveDraftEventOrder(c.env.DB, {
    userId: user.id,
    eventId: event.id,
    product,
    locale,
  });
  const activation = await activateComplimentaryEventOrder(c.env.DB, {
    orderId,
    userId: user.id,
    eventId: event.id,
  });
  if (!activation.activated)
    return c.text("The beta package could not be activated.", 409);
  console.log(JSON.stringify({
    event: "complimentary_event_package_activated",
    eventId: event.id,
    userId: user.id,
    productKey: product.product_key,
    mediaLimit: activation.mediaLimit,
    expiresAt: activation.expiresAt,
  }));
  return c.redirect(`/dashboard/${event.code}?lang=${locale}&activated=1#package-access-title`, 303);
});
