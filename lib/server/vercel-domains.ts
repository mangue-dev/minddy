import "server-only";

import { getAppEnv } from "@/lib/env";
import { capability } from "@/lib/server/capabilities";

/**
 * Vercel Domains API minimal client (MIN-36). Attaches/detaches
 * custom domains to the Vercel project that hosts minddy — Vercel manages
 * then DNS + TLS certificate on its own.
 *
 * Env required: VERCEL_TOKEN + VERCEL_PROJECT_ID (VERCEL_TEAM_ID if project
 * lives in a team). Absent → the feature responds “not configured”, never
 * error at startup.
 *
 * Local mock: MDY_FAKE_VERCEL_DOMAINS=1 (non-production) short-circuits all
 * successful/verified calls to test the complete flow without token.
 */

export type VercelVerificationRecord = {
  type: string;
  domain: string;
  value: string;
  reason?: string;
};

export type VercelDomainState = {
  attached: boolean;
  verified: boolean;
  misconfigured: boolean;
  verification: VercelVerificationRecord[];
  /** CNAME target recommended by Vercel for THIS domain (rank 1), or null. */
  cnameTarget: string | null;
};

export type AddDomainResult =
  | { ok: true; verified: boolean; verification: VercelVerificationRecord[] }
  | { ok: false; code: "taken" | "invalid" | "api_error" };

/** Vercel generic CNAME target — fallback when the recommendation by domain
 (recommendedCNAME) has not yet been read. Still works, but the Vercel dashboard displays “DNS Change Recommended” since the IP expansion: prefer the value by domain as soon as you have it. */
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

function isFake(): boolean {
  return process.env.MDY_FAKE_VERCEL_DOMAINS === "1" && getAppEnv() !== "production";
}

export function isVercelDomainsConfigured(): boolean {
  if (isFake()) return true;
  return capability("vercelDomains").configured;
}

function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`https://api.vercel.com${path}`);
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) url.searchParams.set("teamId", teamId);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function vercelFetch(
  path: string,
  init?: RequestInit,
  params?: Record<string, string>
): Promise<Response> {
  return fetch(apiUrl(path, params), {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      "content-type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function addDomainToVercel(domain: string): Promise<AddDomainResult> {
  if (isFake()) return { ok: true, verified: true, verification: [] };
  if (!isVercelDomainsConfigured()) return { ok: false, code: "api_error" };

  const projectId = process.env.VERCEL_PROJECT_ID;
  const res = await vercelFetch(`/v10/projects/${projectId}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });

  if (res.ok) {
    const body = (await res.json()) as {
      verified?: boolean;
      verification?: VercelVerificationRecord[];
    };
    return { ok: true, verified: body.verified === true, verification: body.verification ?? [] };
  }

  const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  const code = body?.error?.code ?? "";
  // “Already in use”: if it is on OUR project, it is a failed cleanup which is
  // repair it yourself — we start from the current state. Otherwise, the domain is taken.
  if (res.status === 409 || code.includes("already")) {
    const state = await getVercelDomainState(domain);
    if (state.attached) {
      return { ok: true, verified: state.verified, verification: state.verification };
    }
    return { ok: false, code: "taken" };
  }
  if (res.status === 400) return { ok: false, code: "invalid" };
  console.error(`[vercel-domains] add ${domain} failed: ${res.status} ${code}`);
  return { ok: false, code: "api_error" };
}

/** 404 = already detached: success (idempotent). */
export async function removeDomainFromVercel(domain: string): Promise<{ ok: boolean }> {
  if (isFake()) return { ok: true };
  if (!isVercelDomainsConfigured()) return { ok: false };

  const projectId = process.env.VERCEL_PROJECT_ID;
  const res = await vercelFetch(
    `/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" }
  );
  if (res.ok || res.status === 404) return { ok: true };
  console.error(`[vercel-domains] remove ${domain} failed: ${res.status}`);
  return { ok: false };
}

export async function getVercelDomainState(domain: string): Promise<VercelDomainState> {
  if (isFake()) {
    return {
      attached: true,
      verified: true,
      misconfigured: false,
      verification: [],
      cnameTarget: null,
    };
  }

  if (!isVercelDomainsConfigured()) {
    return {
      attached: false,
      verified: false,
      misconfigured: true,
      verification: [],
      cnameTarget: null,
    };
  }

  const projectId = process.env.VERCEL_PROJECT_ID;
  const encoded = encodeURIComponent(domain);
  const notAttached: VercelDomainState = {
    attached: false,
    verified: false,
    misconfigured: true,
    verification: [],
    cnameTarget: null,
  };

  const domainRes = await vercelFetch(`/v9/projects/${projectId}/domains/${encoded}`);
  if (domainRes.status === 404) return notAttached;
  if (!domainRes.ok) {
    console.error(`[vercel-domains] get ${domain} failed: ${domainRes.status}`);
    return notAttached;
  }
  let body = (await domainRes.json()) as {
    verified?: boolean;
    verification?: VercelVerificationRecord[];
  };

  // TXT challenge pending (domain claimed by another Vercel account):
  // we attempt the verification — it succeeds as soon as the TXT is placed.
  if (body.verified !== true && (body.verification?.length ?? 0) > 0) {
    const verifyRes = await vercelFetch(
      `/v9/projects/${projectId}/domains/${encoded}/verify`,
      { method: "POST" }
    );
    if (verifyRes.ok) {
      body = (await verifyRes.json()) as typeof body;
    }
  }

  // projectIdOrName: the CNAME recommendation is specific to the couple
  // domain × project since IP Vercel expansion (vercel-dns-016 & co).
  const configRes = await vercelFetch(`/v6/domains/${encoded}/config`, undefined, {
    projectIdOrName: projectId as string,
  });
  const config = configRes.ok
    ? ((await configRes.json()) as {
        misconfigured?: boolean;
        recommendedCNAME?: Array<{ rank: number; value: string }>;
      })
    : { misconfigured: true, recommendedCNAME: undefined };

  const cnameTarget =
    (config.recommendedCNAME ?? [])
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.value.trim())
      .find(Boolean) ?? null;

  return {
    attached: true,
    verified: body.verified === true,
    misconfigured: config.misconfigured !== false,
    verification: body.verification ?? [],
    cnameTarget,
  };
}
