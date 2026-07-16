import type { Locale } from "../i18n";
import { brandMark, page } from "./shared";

const shell = (locale: Locale, title: string, content: string) => page(
  title,
  `<header class="border-b bg-white"><div class="mx-auto flex max-w-4xl items-center justify-between p-5">${brandMark(`/${locale}`, true)}<a href="/${locale === "en" ? "el" : "en"}/${title.toLowerCase().startsWith("privacy") || title.startsWith("Απόρρητο") ? "privacy-policy" : "terms"}" class="rounded-xl border px-3 py-2 text-sm">${locale === "en" ? "EL" : "EN"}</a></div></header><main class="mx-auto max-w-4xl p-5 pb-16 md:p-10"><article class="rounded-3xl bg-white p-6 shadow md:p-10">${content}</article><footer class="mt-7 flex flex-wrap gap-5 text-sm text-[#64748b]"><a href="/${locale}/privacy-policy">${locale === "el" ? "Απόρρητο" : "Privacy"}</a><a href="/${locale}/terms">${locale === "el" ? "Όροι" : "Terms"}</a><a href="/${locale}/privacy-request">${locale === "el" ? "Αίτημα δεδομένων" : "Data request"}</a></footer></main>`,
);

const section = (title: string, body: string) => `<section><h2 class="text-2xl">${title}</h2>${body}</section>`;

export function privacyPolicyPage(locale: Locale) {
  const el = locale === "el";
  const content = `<p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Version 17/07/2026</p>
    <h1 class="mt-3 text-4xl">${el ? "Πολιτική απορρήτου" : "Privacy policy"}</h1>
    <p class="mt-5 text-[#64748b]">${el
      ? "Το Memboux είναι υπηρεσία ιδιωτικών galleries για events. Το παρόν κείμενο περιγράφει με διαφάνεια την τρέχουσα τεχνική λειτουργία· δεν αποτελεί δήλωση πιστοποίησης συμμόρφωσης."
      : "Memboux is a private event-gallery service. This notice transparently describes the current technical operation; it is not a certification of compliance."}</p>
    <div class="mt-8 space-y-7 leading-7">
      ${section(
        el ? "Ρόλοι και ευθύνη" : "Roles and responsibility",
        `<p>${el
          ? "Το Memboux λειτουργεί την πλατφόρμα και τους λογαριασμούς. Ο owner κάθε event αποφασίζει ποιοι προσκαλούνται, τον σκοπό της συλλογής και την πρόσβαση. Όποιος ανεβάζει περιεχόμενο επιβεβαιώνει ότι δικαιούται να το κάνει."
          : "Memboux operates the platform and accounts. Each event owner decides who is invited, the purpose of the collection and access. Uploaders confirm that they are entitled to submit the content."}</p>`,
      )}
      ${section(
        el ? "Δεδομένα που επεξεργαζόμαστε" : "Data we process",
        `<p>${el
          ? "Στοιχεία λογαριασμού, sessions και security logs, event metadata και memberships, φωτογραφίες/βίντεο και τεχνικά metadata, εκδόσεις συγκατάθεσης upload, προσκλήσεις, αιτήματα αφαίρεσης και privacy requests. Τα rate limits αποθηκεύουν μονόδρομα hashed identifiers και όχι raw IP."
          : "Account details, sessions and security logs, event metadata and memberships, photos/videos and technical metadata, upload-consent versions, invitations, removal requests and privacy requests. Rate limits store one-way hashed identifiers rather than raw IP addresses."}</p>`,
      )}
      ${section(
        el ? "Σκοποί και υπηρεσίες" : "Purposes and services",
        `<p>${el
          ? "Τα δεδομένα χρησιμοποιούνται για authentication, λειτουργία private galleries, uploads, συνεργασία, ασφάλεια, καταπολέμηση κατάχρησης, υποστήριξη, cloud backups και άσκηση δικαιωμάτων. Υποδομή παρέχεται από Cloudflare Workers, D1 και R2· transactional email από Resend· προαιρετικό Google login και Google Drive backup από Google. Δεν πωλούμε δεδομένα και δεν τα χρησιμοποιούμε για διαφημιστικό profiling."
          : "Data is used for authentication, private-gallery operation, uploads, collaboration, security, abuse prevention, support, cloud backups and rights requests. Infrastructure is provided by Cloudflare Workers, D1 and R2; transactional email by Resend; optional Google sign-in and Google Drive backup by Google. We do not sell data or use it for advertising profiles."}</p>`,
      )}
      ${section(
        el ? "Google Sign-In και προσωπικά Drive backups" : "Google Sign-In and personal Drive backups",
        `<p>${el
          ? "Όταν επιλέγεις Google Sign-In, λαμβάνουμε τα βασικά στοιχεία ταυτότητας που εγκρίνεις, όπως όνομα, email και εικόνα προφίλ, μόνο για τη δημιουργία ή σύνδεση του λογαριασμού σου. Όταν συνδέεις προαιρετικά το Google Drive, ζητάμε αποκλειστικά την περιορισμένη άδεια drive.file. Τη χρησιμοποιούμε μόνο για να δημιουργούμε και να διαχειριζόμαστε τον φάκελο Memboux και τα αντίγραφα των events που εσύ επιλέγεις στο δικό σου Drive. Δεν διαβάζουμε, δεν τροποποιούμε και δεν διαγράφουμε άσχετα αρχεία του Drive σου."
          : "When you choose Google Sign-In, we receive the basic identity details you approve, such as name, email and profile image, solely to create or connect your account. When you optionally connect Google Drive, we request only the limited drive.file permission. We use it solely to create and manage the Memboux folder and the event backups you choose in your own Drive. We do not read, modify or delete unrelated files in your Drive."}</p>
        <p class="mt-3">${el
          ? "Το Google refresh token αποθηκεύεται κρυπτογραφημένο και συνδέεται αποκλειστικά με τον δικό σου λογαριασμό Memboux. Δεν κοινοποιούμε Google user data σε διαφημιστές, data brokers ή άλλα apps και δεν το χρησιμοποιούμε για διαφημίσεις, profiling ή εκπαίδευση γενικών μοντέλων AI/ML. Η χρήση και τυχόν μεταφορά πληροφοριών που λαμβάνονται από Google APIs συμμορφώνεται με την Google API Services User Data Policy, συμπεριλαμβανομένων των Limited Use requirements."
          : "The Google refresh token is encrypted at rest and linked only to your own Memboux account. We do not disclose Google user data to advertisers, data brokers or other apps, and we do not use it for advertising, profiling or training generalized AI/ML models. Memboux's use and transfer to any other app of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."}</p>
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block font-semibold text-[#4338ca]">Google API Services User Data Policy</a>`,
      )}
      ${section(
        el ? "Διατήρηση και αποσύνδεση Google Drive" : "Retention and Google Drive disconnection",
        `<p>${el
          ? "Διατηρούμε την κρυπτογραφημένη σύνδεση Google μόνο όσο το Drive παραμένει συνδεδεμένο. Μπορείς οποτεδήποτε να το αποσυνδέσεις από τη σελίδα Backups· τότε ανακαλούμε την πρόσβαση στη Google και διαγράφουμε τα αποθηκευμένα tokens από το Memboux. Η αποσύνδεση δεν διαγράφει τα αντίγραφα που έχουν ήδη δημιουργηθεί στο προσωπικό σου Drive· αυτά παραμένουν υπό τον δικό σου έλεγχο και μπορείς να τα διαγράψεις απευθείας από τη Google. Backup status και τεχνικά audit metadata μπορεί να παραμένουν όσο απαιτείται για τη λειτουργία, την ασφάλεια και την τεκμηρίωση της υπηρεσίας."
          : "We retain the encrypted Google connection only while Drive remains connected. You can disconnect it at any time from the Backups page; we then revoke access with Google and delete stored tokens from Memboux. Disconnecting does not delete copies already created in your personal Drive; those remain under your control and can be deleted directly in Google Drive. Backup status and technical audit metadata may remain as needed for service operation, security and accountability."}</p>`,
      )}
      ${section(
        el ? "Άλλη διατήρηση" : "Other retention",
        `<p>${el
          ? "Sessions λήγουν μετά από 30 ημέρες. Ο κάδος media/events διαγράφεται οριστικά μετά από 30 ημέρες. Rate-limit counters λήγουν στο τέλος του παραθύρου τους. Ληγμένες προσκλήσεις και verification records καθαρίζονται αυτόματα. Επιλυμένα αιτήματα αφαίρεσης διατηρούνται έως 12 μήνες και επιλυμένα privacy requests έως 3 έτη για audit. Η λήξη πρόσβασης event δεν διαγράφει αυτόματα τις αναμνήσεις· το event παραμένει μέχρι να το διαγράψει owner/admin."
          : "Sessions expire after 30 days. Trashed media/events are permanently deleted after 30 days. Rate-limit counters expire at the end of their window. Expired invitations and verification records are automatically cleaned up. Resolved removal requests are retained for up to 12 months and resolved privacy requests for up to 3 years for audit. Event access expiry does not automatically erase memories; an event remains until its owner/admin deletes it."}</p>`,
      )}
      ${section(
        el ? "Επιλογές και δικαιώματα" : "Choices and rights",
        `<p>${el
          ? "Οι χρήστες μπορούν να εξάγουν τα account data τους, να αποσυνδέσουν το Google Drive και να ζητήσουν επαληθευμένη διαγραφή από το Privacy center. Κάθε media item διαθέτει αίτημα αφαίρεσης. Για πρόσβαση, διόρθωση, διαγραφή, περιορισμό ή εναντίωση χρησιμοποίησε την ασφαλή φόρμα αιτήματος."
          : "Users can export their account data, disconnect Google Drive and request verified deletion from the Privacy center. Each media item offers a removal request. For access, correction, deletion, restriction or objection, use the secure request form."}</p><a href="/${locale}/privacy-request" class="mt-4 inline-block rounded-xl bg-[#4f46e5] px-5 py-3 text-white">${el ? "Υποβολή αιτήματος" : "Submit a request"}</a>`,
      )}
      ${section(
        el ? "Στοιχεία υπευθύνου" : "Controller details",
        `<p class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">${el
          ? "Το Memboux είναι ο υπεύθυνος λειτουργίας της υπηρεσίας. Πριν από την αποδοχή πληρωμών θα δημοσιευθούν επίσης η πλήρης νομική επωνυμία, η ταχυδρομική διεύθυνση και επίσημο privacy email. Μέχρι τότε, αιτήματα απορρήτου και επικοινωνία παραλαμβάνονται μέσω της ασφαλούς φόρμας Privacy center."
          : "Memboux is the service operator. Before accepting payments, the full legal name, postal address and official privacy email will also be published. Until then, privacy requests and contact are received through the secure Privacy center form."}</p>`,
      )}
    </div>`;
  return shell(locale, el ? "Απόρρητο – Memboux" : "Privacy policy – Memboux", content);
}

export function termsPage(locale: Locale) {
  const el = locale === "el";
  const content = `<p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Version 17/07/2026</p>
    <h1 class="mt-3 text-4xl">${el ? "Όροι χρήσης" : "Terms of use"}</h1>
    <div class="mt-8 space-y-7 leading-7">
      ${section(
        el ? "Η υπηρεσία" : "The service",
        `<p>${el
          ? "Το Memboux επιτρέπει τη δημιουργία ιδιωτικών event galleries, προσκλήσεις συνεργατών, uploads από guests και προαιρετικά προσωπικά cloud backups. Οι λειτουργίες μπορεί να εξελίσσονται κατά τη δοκιμαστική περίοδο."
          : "Memboux enables private event galleries, collaborator invitations, guest uploads and optional personal cloud backups. Features may evolve during the testing period."}</p>`,
      )}
      ${section(
        el ? "Λογαριασμοί και πρόσβαση" : "Accounts and access",
        `<p>${el
          ? "Ο χρήστης πρέπει να παρέχει ακριβή στοιχεία, να προστατεύει τα credentials/PIN και να δίνει πρόσβαση μόνο σε κατάλληλα πρόσωπα. Οι ρόλοι owner, editor και viewer έχουν διαφορετικά δικαιώματα."
          : "Users must provide accurate information, protect credentials/PINs and grant access only to appropriate people. Owner, editor and viewer roles have different permissions."}</p>`,
      )}
      ${section(
        el ? "Περιεχόμενο" : "Content",
        `<p>${el
          ? "Κρατάς τα δικαιώματά σου στο περιεχόμενο. Μας δίνεις μόνο την τεχνικά αναγκαία άδεια αποθήκευσης, επεξεργασίας, προβολής και, όταν το ζητάς, αντιγραφής του στο προσωπικό σου cloud backup. Δεν επιτρέπεται παράνομο, παραπλανητικό, κακόβουλο ή παραβιαστικό περιεχόμενο. Reported media κρύβεται άμεσα μέχρι admin review."
          : "You retain rights in your content. You grant only the technically necessary permission to store, process, display and, when you request it, copy content to your personal cloud backup. Illegal, deceptive, malicious or infringing content is prohibited. Reported media is hidden immediately pending admin review."}</p>`,
      )}
      ${section(
        el ? "Προαιρετικά Google Drive backups" : "Optional Google Drive backups",
        `<p>${el
          ? "Η σύνδεση Google Drive και κάθε backup ξεκινούν μόνο με δική σου επιλογή. Τα αντίγραφα αποθηκεύονται στον προσωπικό χώρο Google Drive που συνδέεις και υπόκεινται στα όρια, τη διαθεσιμότητα και τους όρους της Google. Το Memboux εμφανίζει την κατάσταση του backup, αλλά ο χρήστης πρέπει να επιβεβαιώνει ότι τα σημαντικά αρχεία έχουν μεταφερθεί και παραμένουν διαθέσιμα. Μπορείς να ανακαλέσεις την πρόσβαση οποτεδήποτε, χωρίς αυτόματη διαγραφή των αντιγράφων που βρίσκονται ήδη στο Drive σου."
          : "Connecting Google Drive and starting each backup occur only at your direction. Copies are stored in the personal Google Drive account you connect and are subject to Google's quotas, availability and terms. Memboux displays backup status, but users should verify that important files were transferred and remain available. You may revoke access at any time without automatically deleting copies already stored in your Drive."}</p>`,
      )}
      ${section(
        el ? "Διαγραφή και διαθεσιμότητα" : "Deletion and availability",
        `<p>${el
          ? "Ο κάδος έχει περίοδο επαναφοράς 30 ημερών. Η υπηρεσία δεν πρέπει να θεωρείται το μοναδικό backup σημαντικών αρχείων. Η λήξη πρόσβασης δεν ισοδυναμεί με αυτόματη διαγραφή."
          : "Trash has a 30-day recovery period. The service should not be treated as the only backup of important files. Access expiry is not automatic deletion."}</p>`,
      )}
      ${section(
        el ? "Εμπορικοί όροι" : "Commercial terms",
        `<p class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">${el
          ? "Τιμές, quotas, refunds, SLA και πλήρη στοιχεία παρόχου δεν έχουν ακόμη δημοσιευθεί. Πρέπει να οριστικοποιηθούν πριν δεχθούμε πληρωμές."
          : "Pricing, quotas, refunds, SLA and full provider details are not yet published. They must be finalized before accepting payments."}</p>`,
      )}
    </div>`;
  return shell(locale, el ? "Όροι – Memboux" : "Terms – Memboux", content);
}

export function privacyRequestPage(locale: Locale, sent = false, reference = "") {
  const el = locale === "el";
  const options = [
    ["access", el ? "Πρόσβαση" : "Access"],
    ["correction", el ? "Διόρθωση" : "Correction"],
    ["deletion", el ? "Διαγραφή" : "Deletion"],
    ["restriction", el ? "Περιορισμός" : "Restriction"],
    ["objection", el ? "Εναντίωση" : "Objection"],
    ["other", el ? "Άλλο" : "Other"],
  ];
  return shell(
    locale,
    el ? "Αίτημα δεδομένων – Memboux" : "Data request – Memboux",
    `<p class="text-xs uppercase tracking-[.2em] text-[#4338ca]">Privacy request</p><h1 class="mt-3 text-4xl">${el ? "Άσκηση δικαιώματος" : "Exercise your rights"}</h1>${sent ? `<div class="mt-6 rounded-2xl bg-emerald-50 p-5 text-emerald-800"><strong>${el ? "Το αίτημα καταχωρίστηκε." : "Your request was recorded."}</strong><p class="mt-1 break-all text-sm">Reference: ${reference}</p></div>` : ""}<form action="/api/privacy/requests" method="post" class="mt-7 space-y-4"><input type="hidden" name="locale" value="${locale}"><label class="block text-sm font-medium">Email<input name="email" type="email" maxlength="254" required class="mt-1 w-full rounded-xl border px-4 py-3"></label><label class="block text-sm font-medium">${el ? "Τύπος αιτήματος" : "Request type"}<select name="requestType" class="mt-1 w-full rounded-xl border px-4 py-3">${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><label class="block text-sm font-medium">${el ? "Λεπτομέρειες" : "Details"}<textarea name="details" minlength="20" maxlength="2000" required rows="7" class="mt-1 w-full rounded-xl border px-4 py-3" placeholder="${el ? "Περιέγραψε το αίτημα και, αν αφορά event ή media, πρόσθεσε τον σχετικό κωδικό." : "Describe your request and, if it concerns an event or media item, add the relevant code."}"></textarea></label><p class="text-xs text-[#64748b]">${el ? "Μην συμπεριλαμβάνεις κωδικούς πρόσβασης, PIN ή ευαίσθητα έγγραφα στη φόρμα." : "Do not include passwords, PINs or sensitive documents in this form."}</p><button class="rounded-xl bg-[#4f46e5] px-6 py-3 text-white">${el ? "Υποβολή" : "Submit request"}</button></form>`,
  );
}
