export type EmailDnsStatus = "ready" | "missing" | "misconfigured" | "unavailable";

export type EmailDnsCheck = {
  key: "mx" | "spf" | "dkim" | "dmarc";
  label: string;
  status: EmailDnsStatus;
  detail: string;
};

export type EmailDnsHealth = {
  checkedAt: number;
  checks: EmailDnsCheck[];
  ready: boolean;
};

type DnsJsonAnswer = { type?: number; data?: string };
type DnsJsonResponse = { Status?: number; Answer?: DnsJsonAnswer[] };
type DnsFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const recommendedDmarcRecord = {
  type: "TXT",
  name: "_dmarc",
  value:
    "v=DMARC1; p=none; sp=none; rua=mailto:support@memboux.com; adkim=r; aspf=r",
} as const;

const resolver = "https://cloudflare-dns.com/dns-query";

function cleanTxt(value: string) {
  return value
    .replace(/^"(.*)"$/s, "$1")
    .replace(/"\s+"/g, "")
    .replace(/\\"/g, '"')
    .trim();
}

async function resolve(
  name: string,
  type: "TXT" | "MX",
  fetcher: DnsFetch,
): Promise<string[]> {
  const url = new URL(resolver);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const response = await fetcher(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`DNS resolver returned ${response.status}`);
  const body = (await response.json()) as DnsJsonResponse;
  if (typeof body.Status === "number" && ![0, 3].includes(body.Status)) {
    throw new Error(`DNS resolver status ${body.Status}`);
  }
  const expectedType = type === "TXT" ? 16 : 15;
  return (body.Answer ?? [])
    .filter((answer) => answer.type === expectedType && answer.data)
    .map((answer) =>
      type === "TXT" ? cleanTxt(String(answer.data)) : String(answer.data).trim(),
    );
}

function unavailable(key: EmailDnsCheck["key"], label: string): EmailDnsCheck {
  return {
    key,
    label,
    status: "unavailable",
    detail: "The live DNS check could not be completed. Try again shortly.",
  };
}

export async function checkEmailDnsHealth(
  fetcher: DnsFetch = fetch,
): Promise<EmailDnsHealth> {
  const [mxResult, rootTxtResult, dkimResult, dmarcResult] =
    await Promise.allSettled([
      resolve("memboux.com", "MX", fetcher),
      resolve("memboux.com", "TXT", fetcher),
      resolve("resend._domainkey.mail.memboux.com", "TXT", fetcher),
      resolve("_dmarc.memboux.com", "TXT", fetcher),
    ]);

  const checks: EmailDnsCheck[] = [];
  if (mxResult.status === "rejected") {
    checks.push(unavailable("mx", "Inbound email routing (MX)"));
  } else {
    const cloudflareMx = mxResult.value.filter((value) =>
      /\.mx\.cloudflare\.net\.?$/i.test(value),
    );
    checks.push({
      key: "mx",
      label: "Inbound email routing (MX)",
      status: cloudflareMx.length >= 3 ? "ready" : cloudflareMx.length ? "misconfigured" : "missing",
      detail:
        cloudflareMx.length >= 3
          ? "Cloudflare Email Routing has all expected MX destinations."
          : "The complete Cloudflare Email Routing MX set was not found.",
    });
  }

  if (rootTxtResult.status === "rejected") {
    checks.push(unavailable("spf", "Sender policy (SPF)"));
  } else {
    const spf = rootTxtResult.value.filter((value) =>
      /^v=spf1(?:\s|$)/i.test(value),
    );
    const valid =
      spf.length === 1 && spf[0].includes("include:_spf.mx.cloudflare.net");
    checks.push({
      key: "spf",
      label: "Sender policy (SPF)",
      status: valid ? "ready" : spf.length ? "misconfigured" : "missing",
      detail: valid
        ? "One valid root SPF record authorizes Cloudflare Email Routing."
        : spf.length > 1
          ? "More than one SPF record exists; SPF must be published as one record."
          : "The expected Cloudflare Email Routing SPF policy was not found.",
    });
  }

  if (dkimResult.status === "rejected") {
    checks.push(unavailable("dkim", "Outbound signing (Resend DKIM)"));
  } else {
    const dkim = dkimResult.value.find((value) => /(?:^|;\s*)p=/i.test(value));
    checks.push({
      key: "dkim",
      label: "Outbound signing (Resend DKIM)",
      status: dkim ? "ready" : dkimResult.value.length ? "misconfigured" : "missing",
      detail: dkim
        ? "The Resend signing key is published for mail.memboux.com."
        : "The Resend DKIM public key was not found.",
    });
  }

  if (dmarcResult.status === "rejected") {
    checks.push(unavailable("dmarc", "Domain protection (DMARC)"));
  } else {
    const records = dmarcResult.value.filter((value) =>
      /^v=DMARC1(?:;|$)/i.test(value),
    );
    const valid =
      records.length === 1 && /(?:^|;)\s*p=(none|quarantine|reject)(?:;|$)/i.test(records[0]);
    checks.push({
      key: "dmarc",
      label: "Domain protection (DMARC)",
      status: valid ? "ready" : records.length ? "misconfigured" : "missing",
      detail: valid
        ? "A valid DMARC policy is published for memboux.com."
        : records.length > 1
          ? "More than one DMARC policy was found; only one can be published."
          : "No valid DMARC policy is currently published for memboux.com.",
    });
  }

  return {
    checkedAt: Date.now(),
    checks,
    ready: checks.every((check) => check.status === "ready"),
  };
}
