export type LaunchReadinessEnvironment = {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  BUSINESS_LEGAL_NAME?: string;
  BUSINESS_POSTAL_ADDRESS?: string;
  PRIVACY_EMAIL?: string;
  SUPPORT_EMAIL?: string;
};

export type LaunchReadinessCheck = {
  key: string;
  category: "technical" | "commercial";
  ready: boolean;
  label: string;
};

const configured = (value: string | undefined, minimum = 1) =>
  Boolean(value && value.trim().length >= minimum);
const emailConfigured = (value: string | undefined) =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));

export function getLaunchReadiness(env: LaunchReadinessEnvironment) {
  const checks: LaunchReadinessCheck[] = [
    {
      key: "auth_secret",
      category: "technical",
      ready: configured(env.BETTER_AUTH_SECRET, 32),
      label: "Authentication secret",
    },
    {
      key: "google_oauth",
      category: "technical",
      ready:
        configured(env.GOOGLE_CLIENT_ID) && configured(env.GOOGLE_CLIENT_SECRET),
      label: "Google OAuth credentials",
    },
    {
      key: "transactional_email",
      category: "technical",
      ready: configured(env.RESEND_API_KEY),
      label: "Transactional email",
    },
    {
      key: "admin_secret",
      category: "technical",
      ready: configured(env.ADMIN_PASSWORD, 12),
      label: "Admin authentication",
    },
    {
      key: "legal_identity",
      category: "commercial",
      ready: configured(env.BUSINESS_LEGAL_NAME, 3),
      label: "Legal business name",
    },
    {
      key: "postal_address",
      category: "commercial",
      ready: configured(env.BUSINESS_POSTAL_ADDRESS, 10),
      label: "Business postal address",
    },
    {
      key: "privacy_contact",
      category: "commercial",
      ready: emailConfigured(env.PRIVACY_EMAIL),
      label: "Privacy contact email",
    },
    {
      key: "support_contact",
      category: "commercial",
      ready: emailConfigured(env.SUPPORT_EMAIL),
      label: "Customer support email",
    },
    {
      key: "billing",
      category: "commercial",
      ready: false,
      label: "Billing, invoices and webhook integration",
    },
    {
      key: "commercial_terms",
      category: "commercial",
      ready: false,
      label: "Published pricing, refund and cancellation terms",
    },
  ];
  return {
    checks,
    technicalReady: checks
      .filter((check) => check.category === "technical")
      .every((check) => check.ready),
    commercialReady: checks.every((check) => check.ready),
  };
}
