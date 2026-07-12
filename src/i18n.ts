export type Locale = "el" | "en";

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
    coupleNames: "Ονόματα ζευγαριού",
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
    coupleNames: "Couple names",
    forgotPassword: "Forgot your password?",
    genericError: "Something went wrong. Please try again.",
  },
} as const;

export function normalizeLocale(value?: string): Locale {
  return value === "en" ? "en" : "el";
}

export function t(locale: Locale) {
  return messages[locale];
}
