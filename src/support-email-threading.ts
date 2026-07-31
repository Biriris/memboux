import type { Locale } from "./i18n";

const TICKET_PATTERN = /\[MBX:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

export function supportTicketIdFromSubject(subject: string) {
  return subject.match(TICKET_PATTERN)?.[1] ?? null;
}

export function supportTicketSubject(conversationId: string, subject: string) {
  const clean = subject.replace(TICKET_PATTERN, "").replace(/^\s*(re|fwd?)\s*:\s*/i, "").trim();
  return `[MBX:${conversationId}] ${clean || "Support request"}`.slice(0, 180);
}

export function staffEmailReplyCopy(locale: Locale) {
  if (locale === "el") {
    return {
      description: "Όρισε το προσωπικό email στο οποίο θέλεις να λαμβάνεις τα αιτήματα που ανατίθενται σε εσένα. Μπορείς να απαντάς απευθείας από αυτή τη διεύθυνση ή μέσα από το Admin Centre.",
      alertTitle: "Ειδοποιήσεις email ενεργές",
      alertDetail: "Θα λαμβάνεις ειδοποίηση όταν ένα νέο αίτημα ανατίθεται σε εσένα.",
      security: "Απάντησε απευθείας σε ειδοποίηση ticket μόνο από το καταχωρισμένο email σου. Το Memboux ελέγχει την ταυτότητα και την ανάθεση, προσθέτει την απάντηση στο ίδιο ticket και διατηρεί ολόκληρο το ιστορικό ελέγχου. Υποστηριζόμενα screenshots και PDF προστίθενται με ασφάλεια στο ticket.",
    };
  }
  return {
    description: "Choose the personal email where you want to receive requests assigned to you. You can reply directly from that address or work inside Admin Centre.",
    alertTitle: "Email alerts enabled",
    alertDetail: "You will be notified when a new request is assigned to you.",
    security: "Reply directly to a ticket notification only from your registered address. Memboux verifies your identity and assignment, adds the reply to the same ticket and preserves the complete audit trail. Supported screenshots and PDFs are added securely to the ticket.",
  };
}
