import { describe, expect, it, vi } from "vitest";
import {
  checkEmailDnsHealth,
  recommendedDmarcRecord,
} from "../src/email-dns-health";

const dnsResponse = (answers: Array<{ type: number; data: string }>) =>
  new Response(JSON.stringify({ Status: 0, Answer: answers }), {
    headers: { "content-type": "application/dns-json" },
  });

function healthyFetcher(options: { dmarc?: boolean; duplicateSpf?: boolean } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    const name = url.searchParams.get("name");
    const type = url.searchParams.get("type");
    if (name === "memboux.com" && type === "MX") {
      return dnsResponse([
        { type: 15, data: "10 route1.mx.cloudflare.net." },
        { type: 15, data: "20 route2.mx.cloudflare.net." },
        { type: 15, data: "30 route3.mx.cloudflare.net." },
      ]);
    }
    if (name === "memboux.com" && type === "TXT") {
      return dnsResponse([
        { type: 16, data: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' },
        ...(options.duplicateSpf
          ? [{ type: 16, data: '"v=spf1 include:example.invalid ~all"' }]
          : []),
      ]);
    }
    if (name === "resend._domainkey.mail.memboux.com") {
      return dnsResponse([{ type: 16, data: '"p=example-public-key"' }]);
    }
    if (name === "_dmarc.memboux.com" && options.dmarc !== false) {
      return dnsResponse([
        { type: 16, data: `"${recommendedDmarcRecord.value}"` },
      ]);
    }
    return dnsResponse([]);
  });
}

describe("email DNS health", () => {
  it("reports a complete email authentication setup as ready", async () => {
    const health = await checkEmailDnsHealth(healthyFetcher());

    expect(health.ready).toBe(true);
    expect(health.checks).toHaveLength(4);
    expect(health.checks.every((check) => check.status === "ready")).toBe(true);
  });

  it("identifies a missing DMARC policy without failing the other checks", async () => {
    const health = await checkEmailDnsHealth(
      healthyFetcher({ dmarc: false }),
    );

    expect(health.ready).toBe(false);
    expect(health.checks.find((check) => check.key === "dmarc")?.status).toBe(
      "missing",
    );
    expect(
      health.checks
        .filter((check) => check.key !== "dmarc")
        .every((check) => check.status === "ready"),
    ).toBe(true);
  });

  it("rejects multiple SPF policies", async () => {
    const health = await checkEmailDnsHealth(
      healthyFetcher({ duplicateSpf: true }),
    );

    const spf = health.checks.find((check) => check.key === "spf");
    expect(spf?.status).toBe("misconfigured");
    expect(spf?.detail).toContain("More than one SPF");
  });

  it("degrades safely when the DNS resolver is unavailable", async () => {
    const health = await checkEmailDnsHealth(
      vi.fn(async () => {
        throw new Error("network unavailable");
      }),
    );

    expect(health.ready).toBe(false);
    expect(
      health.checks.every((check) => check.status === "unavailable"),
    ).toBe(true);
  });
});
