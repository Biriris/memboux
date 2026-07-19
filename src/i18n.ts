export const supportedLocales = ["en", "el", "fr", "de", "es", "it"] as const;
export type Locale = typeof supportedLocales[number];

/**
 * Maps ISO 3166-1 alpha-2 country codes to our supported locales.
 * Countries that don't appear in this map will default to "en".
 */
const countryToLocale: Record<string, Locale> = {
  // Greek
  GR: "el", CY: "el",
  // French
  FR: "fr", MC: "fr",
  // German
  DE: "de", AT: "de", LI: "de",
  // Spanish
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es",
  EC: "es", VE: "es", GT: "es", CU: "es", BO: "es", DO: "es",
  HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es",
  UY: "es", GQ: "es",
  // Italian
  IT: "it", SM: "it", VA: "it",
  // Multilingual countries — assign the most widely spoken official language
  CH: "de",   // Switzerland → German (most spoken)
  BE: "fr",   // Belgium → French (most spoken)
  LU: "fr",   // Luxembourg → French (most spoken)
};

/**
 * Detects the best matching locale from the visitor's country code (geolocation).
 * Falls back to "en" if the country is not in our mapping.
 */
export function detectLocale(country: string | null): Locale {
  if (!country) return "en";
  return countryToLocale[country.toUpperCase()] ?? "en";
}

const messages = {
  el: {
    brand: "Memboux",
    login: "Σύνδεση",
    register: "Εγγραφή",
    logout: "Αποσύνδεση",
    email: "Email",
    password: "Κωδικός πρόσβασης",
    name: "Ονοματεπώνυμο",
    continueGoogle: "Συνέχεια με Google",
    noAccount: "Δεν έχεις λογαριασμό;",
    hasAccount: "Έχεις ήδη λογαριασμό;",
    verifyTitle: "Έλεγξε το email σου",
    verifyText: "Σου στείλαμε σύνδεσμο επιβεβαίωσης. Άνοιξέ τον για να ενεργοποιήσεις τον λογαριασμό σου.",
    dashboard: "Τα events μου",
    createEvent: "Νέο event",
    eventName: "Όνομα event",
    forgotPassword: "Ξέχασες τον κωδικό;",
    genericError: "Κάτι πήγε στραβά. Δοκίμασε ξανά.",
  },
  en: {
    brand: "Memboux",
    login: "Sign in",
    register: "Create account",
    logout: "Sign out",
    email: "Email",
    password: "Password",
    name: "Full name",
    continueGoogle: "Continue with Google",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    verifyTitle: "Check your email",
    verifyText: "We sent you a verification link. Open it to activate your account.",
    dashboard: "My events",
    createEvent: "New event",
    eventName: "Event name",
    forgotPassword: "Forgot your password?",
    genericError: "Something went wrong. Please try again.",
  },
  fr: {
    brand: "Memboux", login: "Se connecter", register: "Créer un compte", logout: "Se déconnecter",
    email: "E-mail", password: "Mot de passe", name: "Nom complet", continueGoogle: "Continuer avec Google",
    noAccount: "Vous n’avez pas de compte ?", hasAccount: "Vous avez déjà un compte ?",
    verifyTitle: "Vérifiez votre e-mail", verifyText: "Nous vous avons envoyé un lien de vérification pour activer votre compte.",
    dashboard: "Mes événements", createEvent: "Nouvel événement", eventName: "Nom de l’événement",
    forgotPassword: "Mot de passe oublié ?", genericError: "Une erreur s’est produite. Réessayez.",
  },
  de: {
    brand: "Memboux", login: "Anmelden", register: "Konto erstellen", logout: "Abmelden",
    email: "E-Mail", password: "Passwort", name: "Vollständiger Name", continueGoogle: "Mit Google fortfahren",
    noAccount: "Noch kein Konto?", hasAccount: "Bereits registriert?",
    verifyTitle: "E-Mail prüfen", verifyText: "Wir haben dir einen Bestätigungslink zur Aktivierung deines Kontos gesendet.",
    dashboard: "Meine Events", createEvent: "Neues Event", eventName: "Eventname",
    forgotPassword: "Passwort vergessen?", genericError: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  },
  es: {
    brand: "Memboux", login: "Iniciar sesión", register: "Crear cuenta", logout: "Cerrar sesión",
    email: "Correo electrónico", password: "Contraseña", name: "Nombre completo", continueGoogle: "Continuar con Google",
    noAccount: "¿No tienes cuenta?", hasAccount: "¿Ya tienes una cuenta?",
    verifyTitle: "Revisa tu correo", verifyText: "Te enviamos un enlace de verificación para activar tu cuenta.",
    dashboard: "Mis eventos", createEvent: "Nuevo evento", eventName: "Nombre del evento",
    forgotPassword: "¿Olvidaste tu contraseña?", genericError: "Algo salió mal. Inténtalo de nuevo.",
  },
  it: {
    brand: "Memboux", login: "Accedi", register: "Crea account", logout: "Esci",
    email: "Email", password: "Password", name: "Nome completo", continueGoogle: "Continua con Google",
    noAccount: "Non hai un account?", hasAccount: "Hai già un account?",
    verifyTitle: "Controlla la tua email", verifyText: "Ti abbiamo inviato un link di verifica per attivare il tuo account.",
    dashboard: "I miei eventi", createEvent: "Nuovo evento", eventName: "Nome dell’evento",
    forgotPassword: "Password dimenticata?", genericError: "Qualcosa è andato storto. Riprova.",
  },
} as const;

export function normalizeLocale(value?: string): Locale {
  return supportedLocales.includes(value as Locale) ? value as Locale : "en";
}

export function t(locale: Locale) {
  return messages[locale];
}

export const localeNames: Record<Locale, string> = {
  en: "English", el: "Ελληνικά", fr: "Français", de: "Deutsch", es: "Español", it: "Italiano",
};
