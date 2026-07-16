import { APIError, betterAuth } from "better-auth";
import { countActiveOwnedEvents } from "./account-data";
import { sha256 } from "./utils";

export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
};

export type EmailPurpose =
  | "verification"
  | "password_reset"
  | "account_deletion"
  | "event_invitation"
  | "professional_assignment";

type SendEmailInput = {
  to: string;
  purpose: EmailPurpose;
  subject: string;
  html: string;
  text: string;
};

const emailEsc = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]!));

function accountEmail(options: {
  preheader: string;
  title: string;
  intro: string;
  actionLabel: string;
  url: string;
  secondary: string;
}) {
  const url = emailEsc(options.url);
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;color:#172033;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${emailEsc(options.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px"><tr><td style="padding:34px"><div style="font-size:22px;font-weight:700;letter-spacing:-.02em;color:#172033">Memboux</div><div style="margin-top:4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6366f1">Collecting moments</div><h1 style="margin:32px 0 12px;font-size:28px;line-height:1.2;color:#111827">${emailEsc(options.title)}</h1><p style="margin:0;color:#475569;font-size:16px;line-height:1.7">${emailEsc(options.intro)}</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">${emailEsc(options.actionLabel)}</a></p><p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6">${emailEsc(options.secondary)}</p><p style="margin:0;word-break:break-all;color:#6366f1;font-size:12px;line-height:1.6"><a href="${url}" style="color:#6366f1">${url}</a></p><hr style="margin:30px 0;border:0;border-top:1px solid #e2e8f0"><p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">This is a transactional account email from memboux.com.</p></td></tr></table></td></tr></table></body></html>`;
}

async function recordEmailAttempt(
  env: AuthEnv,
  message: SendEmailInput,
  status: "sent" | "failed",
  providerMessageId: string | null,
  errorCode: string | null,
) {
  try {
    const recipientHash = await sha256(
      `memboux-email:${env.BETTER_AUTH_SECRET}:${message.to.trim().toLowerCase()}`,
    );
    await env.DB.prepare(
      "INSERT INTO email_delivery_attempts (id,recipient_hash,purpose,status,provider_message_id,error_code,created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      recipientHash,
      message.purpose,
      status,
      providerMessageId,
      errorCode,
      Date.now(),
    ).run();
  } catch (error) {
    console.error("Email delivery audit failed", error);
  }
}

export async function sendEmail(env: AuthEnv, message: SendEmailInput) {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Memboux Accounts <accounts@mail.memboux.com>",
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
  } catch (error) {
    await recordEmailAttempt(env, message, "failed", null, "network_error");
    throw error;
  }

  const result = await response.json().catch(() => ({})) as {
    id?: string;
    name?: string;
  };
  if (!response.ok) {
    const errorCode = `resend_${response.status}_${result.name ?? "unknown"}`.slice(0, 120);
    await recordEmailAttempt(env, message, "failed", null, errorCode);
    throw new Error(`Email delivery failed (${response.status})`);
  }

  await recordEmailAttempt(env, message, "sent", result.id ?? null, null);
  return result.id ?? null;
}

export function createAuth(env: AuthEnv, waitUntil?: (promise: Promise<unknown>) => void) {
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
      backgroundTasks: waitUntil ? { handler: waitUntil } : undefined,
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
      maxPasswordLength: 128,
      onExistingUserSignUp: async ({ user }) => {
        const loginUrl = "https://memboux.com/en/login";
        await sendEmail(env, {
          to: user.email,
          purpose: "verification",
          subject: "Your Memboux account already exists",
          text: `A sign-up was attempted with this email, but a Memboux account already exists. Sign in with Google or your password: ${loginUrl}\n\nIf you use Google and want a password, choose Forgot password on the sign-in page.`,
          html: accountEmail({
            preheader: "Your Memboux account is ready — sign in instead of registering again.",
            title: "Your account already exists",
            intro: "A sign-up was attempted with this email, but it is already connected to a Memboux account. Sign in with Google or your existing password.",
            actionLabel: "Sign in to Memboux",
            url: loginUrl,
            secondary: "If you originally used Google and want to create a password, choose “Forgot password” on the sign-in page.",
          }),
        });
      },
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          purpose: "password_reset",
          subject: "Reset your Memboux password",
          text: `Reset your Memboux password / Επαναφορά κωδικού Memboux: ${url}\n\nIf you did not request this, ignore this email.`,
          html: accountEmail({
            preheader: "Choose a new password for your Memboux account.",
            title: "Reset your password",
            intro: "Use the secure link below to choose a new Memboux password. / Χρησιμοποίησε τον ασφαλή σύνδεσμο για να ορίσεις νέο κωδικό.",
            actionLabel: "Reset password",
            url,
            secondary: "If you did not request this, you can safely ignore this email. / Αν δεν το ζήτησες, αγνόησε αυτό το email.",
          }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          purpose: "verification",
          subject: "Confirm your email for Memboux",
          text: `Confirm your Memboux email / Επιβεβαίωσε το email σου στο Memboux: ${url}\n\nThis link expires in one hour.`,
          html: accountEmail({
            preheader: "One click to activate your Memboux account.",
            title: "Confirm your email",
            intro: "Welcome to Memboux. Confirm your email to activate your account. / Καλώς ήρθες. Επιβεβαίωσε το email σου για να ενεργοποιήσεις τον λογαριασμό σου.",
            actionLabel: "Confirm email",
            url,
            secondary: "This secure link expires in one hour. If you did not create this account, ignore this email.",
          }),
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 60 * 60,
        sendDeleteAccountVerification: async ({ user, url }) => {
          await sendEmail(env, {
            to: user.email,
            purpose: "account_deletion",
            subject: "Memboux – Confirm account deletion / Επιβεβαίωση διαγραφής",
            text: `Confirm permanent account deletion / Επιβεβαίωσε την οριστική διαγραφή λογαριασμού: ${url}`,
            html: `<h1>Confirm account deletion</h1><p>This link permanently deletes your Memboux account. It expires in one hour.</p><p><a href="${url}">Delete my account</a></p><hr><h1>Επιβεβαίωση διαγραφής</h1><p>Αυτός ο σύνδεσμος διαγράφει οριστικά τον λογαριασμό Memboux και λήγει σε μία ώρα.</p><p><a href="${url}">Διαγραφή λογαριασμού</a></p>`,
          });
        },
        beforeDelete: async (user) => {
          if (await countActiveOwnedEvents(env.DB, user.id)) {
            throw new APIError("CONFLICT", { message: "Delete or transfer your active owned events before deleting the account." });
          }
        },
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
