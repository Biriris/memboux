import { betterAuth } from "better-auth";

export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
};

type SendEmailInput = { to: string; subject: string; html: string; text: string };

export async function sendEmail(env: AuthEnv, message: SendEmailInput) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Memboux <accounts@mail.memboux.com>",
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}

export function createAuth(env: AuthEnv, waitUntil?: (promise: Promise<unknown>) => void) {
  const schedule = (promise: Promise<unknown>) => waitUntil ? waitUntil(promise) : promise;

  return betterAuth({
    appName: "Memboux",
    baseURL: "https://memboux.com",
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: ["https://memboux.com", "https://www.memboux.com"],
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: "memboux.com",
      },
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: "lax",
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user, url }) => {
        schedule(sendEmail(env, {
          to: user.email,
          subject: "Memboux – Password reset / Επαναφορά κωδικού",
          text: `Reset your password / Επαναφορά κωδικού: ${url}`,
          html: `<h1>Reset your password</h1><p>Use the link below to choose a new Memboux password.</p><p><a href="${url}">Reset password</a></p><hr><h1>Επαναφορά κωδικού</h1><p>Χρησιμοποίησε τον παραπάνω σύνδεσμο για να ορίσεις νέο κωδικό στο Memboux.</p><p>If you did not request this / Αν δεν το ζήτησες εσύ, αγνόησε αυτό το email.</p>`,
        }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        schedule(sendEmail(env, {
          to: user.email,
          subject: "Memboux – Verify email / Επιβεβαίωση email",
          text: `Verify your email / Επιβεβαίωσε το email σου: ${url}`,
          html: `<h1>Verify your email</h1><p>Welcome to Memboux. Confirm your email address using the link below.</p><p><a href="${url}">Verify email</a></p><hr><h1>Επιβεβαίωσε το email σου</h1><p>Καλώς ήρθες στο Memboux. Χρησιμοποίησε τον παραπάνω σύνδεσμο για να ενεργοποιήσεις τον λογαριασμό σου.</p>`,
        }));
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
  });
}
