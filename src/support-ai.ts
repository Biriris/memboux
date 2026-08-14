import type { Bindings } from "./domain";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

type ChatMessage = {
  sender_type: "user" | "admin" | "system";
  body: string;
};

const SYSTEM_PROMPT = `You are Memboux AI Support, the first-line support assistant for memboux.com.
Reply in the same language as the customer's latest message. Be concise, warm, and practical.

Current, authoritative Memboux product facts:
- Memboux is a private shared-memory platform for events. Guests contribute photos and videos from
  their own point of view so moments do not remain scattered across separate phones.
- A signed-in owner creates an event from Account > New event, chooses its event type, completes the
  guided setup and can inspect the full private preview before inviting guests.
- Creating and previewing an event does not currently require payment or a card.
- The owner selects one package per event. Memboux Free allows 50 total photo/video upload slots,
  has no activation countdown, includes the complete guest experience and allows original-quality
  downloads. Deleting an upload does not restore a used slot.
- Payments and Stripe Checkout are not active. Package selection currently saves only a zero-charge
  preference for the future legal commercial launch.
- Never tell a customer to pay, subscribe or enter card details to create or preview an event.
- Never promise Google Drive or Dropbox integration unless the current interface explicitly offers it.

Security rules:
- Never ask for passwords, one-time codes, full payment-card data, private gallery PINs, or API keys.
- Never claim you changed an account, payment, event, or file.
- Never invent product behavior or pricing.
- For billing disputes, account ownership/access, privacy/deletion requests, security incidents,
  missing/deleted media, legal questions, or anything you cannot answer confidently, start with
  exactly "ESCALATE:" and explain that a human support specialist will follow up.
- Otherwise start with exactly "ANSWER:" and give numbered steps when useful.
- Mention support@memboux.com when email follow-up would help.`;

type SupportedLanguage = "el" | "en" | "fr" | "de" | "es" | "it";

function messageLanguage(message: string): SupportedLanguage {
  if (/[\u0370-\u03ff]/u.test(message)) return "el";
  if (/[äöüß]|\b(?:wie|zahlung|preis|karte|veranstaltung|erstellen|hochladen)\b/i.test(message)) return "de";
  if (/[ñ¿¡]|\b(?:evento|crear|subir|pago)\b/i.test(message)) return "es";
  if (/[àèéìòù]|\b(?:evento|creare|caricare|pagamento)\b/i.test(message)) return "it";
  if (/[àâçéèêëîïôùûüÿœ]|\b(?:événement|créer|téléverser|paiement)\b/i.test(message)) return "fr";
  return "en";
}

const creationAnswers: Record<SupportedLanguage, string> = {
  el: "Για να δημιουργήσεις event:\n1. Συνδέσου και άνοιξε «Τα events μου».\n2. Πάτησε «Νέο event» και επίλεξε τον τύπο εκδήλωσης.\n3. Συμπλήρωσε τα βήματα του wizard και έλεγξε το πλήρες preview.\n4. Επίλεξε το πακέτο που ταιριάζει στο event.\n\nΗ δημιουργία και το preview δεν απαιτούν πληρωμή ή κάρτα. Το Memboux Free περιλαμβάνει την πλήρη εμπειρία, 50 συνολικές θέσεις upload, λήψεις πρωτοτύπων και δεν έχει αντίστροφη μέτρηση.",
  en: "To create an event:\n1. Sign in and open “My events”.\n2. Select “New event” and choose the event type.\n3. Complete the guided setup and review the full preview.\n4. Choose the package that fits the event.\n\nCreation and preview do not require payment or a card. Memboux Free includes the complete experience, 50 total upload slots, original downloads and no activation countdown.",
  fr: "Pour créer un événement :\n1. Connectez-vous et ouvrez « Mes événements ».\n2. Choisissez « Nouvel événement » puis le type d’événement.\n3. Terminez la configuration guidée et vérifiez l’aperçu complet.\n4. Choisissez le forfait adapté.\n\nLa création et l’aperçu ne nécessitent ni paiement ni carte. Memboux Free comprend l’expérience complète, 50 ajouts au total, les originaux et aucun compte à rebours.",
  de: "So erstellst du ein Event:\n1. Melde dich an und öffne „Meine Events“.\n2. Wähle „Neues Event“ und den Eventtyp.\n3. Schließe die geführte Einrichtung ab und prüfe die vollständige Vorschau.\n4. Wähle das passende Paket.\n\nErstellung und Vorschau erfordern weder Zahlung noch Karte. Memboux Free umfasst das vollständige Erlebnis, 50 Uploads, Original-Downloads und keinen Countdown.",
  es: "Para crear un evento:\n1. Inicia sesión y abre «Mis eventos».\n2. Pulsa «Nuevo evento» y elige el tipo.\n3. Completa la configuración guiada y revisa la vista previa completa.\n4. Elige el paquete adecuado.\n\nCrear y previsualizar no requiere pago ni tarjeta. Memboux Free incluye la experiencia completa, 50 subidas, originales y ninguna cuenta atrás.",
  it: "Per creare un evento:\n1. Accedi e apri «I miei eventi».\n2. Seleziona «Nuovo evento» e scegli il tipo.\n3. Completa la configurazione guidata e controlla l’anteprima completa.\n4. Scegli il pacchetto adatto.\n\nCreazione e anteprima non richiedono pagamento o carta. Memboux Free include l’esperienza completa, 50 upload, originali e nessun conto alla rovescia.",
};

const trialAnswers: Record<SupportedLanguage, string> = {
  el: "Ο owner επιλέγει ένα από τα τρία πακέτα για κάθε event. Το Memboux Free περιλαμβάνει την πλήρη εμπειρία, 50 συνολικές θέσεις για φωτογραφίες ή βίντεο, λήψεις πρωτοτύπων και δεν έχει αντίστροφη μέτρηση. Αν διαγραφεί ένα αρχείο, η θέση δεν επιστρέφεται. Οι πληρωμές δεν είναι ακόμη ενεργές και δεν ζητούνται στοιχεία κάρτας.",
  en: "The owner selects one of three packages per event. Memboux Free includes the complete experience, 50 total photo/video upload slots, original downloads and no activation countdown. Deleting a file does not restore a slot. Payments are not active yet and no card details are requested.",
  fr: "Le propriétaire choisit un forfait par événement. Memboux Free comprend l’expérience complète, 50 ajouts de photos ou vidéos, les originaux et aucun compte à rebours. Supprimer un fichier ne rend pas son emplacement. Les paiements ne sont pas encore actifs et aucune carte n’est demandée.",
  de: "Der Owner wählt ein Paket pro Event. Memboux Free umfasst das vollständige Erlebnis, insgesamt 50 Foto- oder Video-Uploads, Original-Downloads und keinen Countdown. Durch Löschen wird kein Platz zurückgegeben. Zahlungen sind noch nicht aktiv und es werden keine Kartendaten verlangt.",
  es: "El owner elige un paquete por evento. Memboux Free incluye la experiencia completa, 50 subidas totales de fotos o vídeos, originales y ninguna cuenta atrás. Eliminar un archivo no devuelve su espacio. Los pagos aún no están activos y no se solicitan datos de tarjeta.",
  it: "L’owner sceglie un pacchetto per evento. Memboux Free include l’esperienza completa, 50 upload totali di foto o video, originali e nessun conto alla rovescia. Eliminare un file non restituisce lo spazio. I pagamenti non sono ancora attivi e non vengono richiesti dati della carta.",
};

export function groundedSupportAnswer(message: string): { body: string; escalate: false } | null {
  const normalized = message.trim();
  const language = messageLanguage(normalized);
  const requiresHumanReview = /\b(refund|dispute|charged|chargeback|fraud|compromised|hacked|delete my account|legal)\b/i.test(normalized)
    || /\b(remboursement|litige|fraude|piraté|supprimer mon compte|juridique)\b/i.test(normalized)
    || /\b(rückerstattung|streitfall|betrug|gehackt|konto löschen|rechtlich)\b/i.test(normalized)
    || /\b(reembolso|disputa|fraude|hackeada|eliminar mi cuenta|legal)\b/i.test(normalized)
    || /\b(rimborso|contestazione|frode|violato|eliminare il mio account|legale)\b/i.test(normalized)
    || /(?:επιστροφ|αμφισβήτ|χρεώθηκα|απάτ|παραβιάστ|χακαρ|διαγραφ.{0,15}λογαριασ|νομικ)/iu.test(normalized);
  if (requiresHumanReview) return null;
  const asksHowToCreate = /\b(create|new|start|make)\b.{0,30}\b(event|album)\b/i.test(normalized)
    || /\b(créer|nouvel)\b.{0,30}\b(événement|album)\b/i.test(normalized)
    || /\b(erstellen|neues)\b.{0,30}\b(event|album)\b/i.test(normalized)
    || /\b(crear|nuevo)\b.{0,30}\b(evento|álbum)\b/i.test(normalized)
    || /\b(creare|nuovo)\b.{0,30}\b(evento|album)\b/i.test(normalized)
    || /(?:πώς|πως).{0,40}(?:δημιουργ|φτιάξ).{0,30}(?:event|εκδήλωση|άλμπουμ|album)/iu.test(normalized)
    || /(?:δημιουργ|φτιάξ).{0,30}(?:event|εκδήλωση|άλμπουμ|album)/iu.test(normalized);
  if (asksHowToCreate) return { body: creationAnswers[language], escalate: false };

  const asksAboutTrial = /\b(trial|free trial|payment|pricing|price|card)\b/i.test(normalized)
    || /\b(essai|paiement|prix|carte)\b/i.test(normalized)
    || /\b(test|zahlung|preis|karte)\b/i.test(normalized)
    || /\b(prueba|pago|precio|tarjeta)\b/i.test(normalized)
    || /\b(prova|pagamento|prezzo|carta)\b/i.test(normalized)
    || /(?:δοκιμ|trial|πληρωμ|τιμή|τιμες|τιμές|κάρτ)/iu.test(normalized);
  if (asksAboutTrial) return { body: trialAnswers[language], escalate: false };
  return null;
}

function contradictsCurrentProduct(body: string) {
  const normalized = body.toLocaleLowerCase();
  const paymentRequired = [
    /\b(?:you must|you need to|you have to)\s+(?:pay|subscribe|purchase)\b/i,
    /\bpayment (?:is )?required\b/i,
    /(?:πρέπει|χρειάζεται)\s+να\s+(?:πληρώ|αγοράσ|εγγραφ)/iu,
    /(?<!δεν )απαιτείται\s+(?:πληρωμή|συνδρομή|αγορά)/iu,
    /\bvous devez (?:payer|vous abonner|acheter)\b/i,
    /\b(?:un )?paiement est (?:requis|obligatoire|nécessaire)\b/i,
    /\bdu musst (?:zahlen|bezahlen|abonnieren)\b/i,
    /\b(?:eine )?zahlung ist erforderlich\b/i,
    /\bdebes (?:pagar|suscribirte|comprar)\b/i,
    /\b(?:el )?pago es (?:obligatorio|necesario)\b/i,
    /\bdevi (?:pagare|abbonarti|acquistare)\b/i,
    /\b(?:il )?pagamento è (?:obbligatorio|necessario)\b/i,
  ].some((pattern) => pattern.test(normalized));
  const paymentFalselyActive = [
    /\b(?:payments|stripe checkout) (?:are|is) (?:now )?active\b/i,
    /(?:οι πληρωμές|το stripe checkout) (?:είναι|είναι πλέον) ενεργ/iu,
    /\b(?:les paiements|stripe checkout) (?:sont|est) actifs?\b/i,
    /\b(?:zahlungen|stripe checkout) (?:sind|ist) aktiv\b/i,
    /\b(?:los pagos|stripe checkout) (?:están|está) activos?\b/i,
    /\b(?:i pagamenti|stripe checkout) (?:sono|è) attiv[oi]\b/i,
  ].some((pattern) => pattern.test(normalized));
  return paymentRequired || paymentFalselyActive;
}

export function parseSupportAiResponse(
  raw: string,
): { body: string; escalate: boolean } | null {
  const match = raw.trim().match(/^(ANSWER|ESCALATE):\s*([\s\S]+)$/i);
  if (!match) return null;
  const body = match[2].trim().slice(0, 2000);
  if (!body) return null;
  const escalate = match[1].toUpperCase() === "ESCALATE";
  if (!escalate && contradictsCurrentProduct(body)) return null;
  return { body, escalate };
}

export async function answerSupportMessage(
  env: Bindings,
  messages: ChatMessage[],
): Promise<{ body: string; escalate: boolean } | null> {
  const latestUserMessage = [...messages].reverse()
    .find((message) => message.sender_type === "user")?.body ?? "";
  const grounded = groundedSupportAnswer(latestUserMessage);
  if (grounded) return grounded;
  if (!env.AI) return null;
  const recent = messages.slice(-12).map((message) => ({
    role: message.sender_type === "user" ? "user" as const : "assistant" as const,
    content: message.body,
  }));
  try {
    const result = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...recent],
      max_tokens: 420,
      temperature: 0.2,
    });
    const raw = result.response?.trim() ?? "";
    if (!raw) return null;
    return parseSupportAiResponse(raw);
  } catch (error) {
    console.error(JSON.stringify({
      event: "support_ai_failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}
