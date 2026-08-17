import "server-only";

import { getAppEnv } from "@/lib/env";
import { capability } from "@/lib/server/capabilities";

/**
 * Client minimal de l'API Domaines de Vercel (MIN-36). Attache/détache les
 * domaines personnalisés au projet Vercel qui héberge minddy — Vercel gère
 * ensuite DNS + certificat TLS tout seul.
 *
 * Env requis : VERCEL_TOKEN + VERCEL_PROJECT_ID (VERCEL_TEAM_ID si le projet
 * vit dans une team). Absents → la feature répond « non configuré », jamais
 * d'erreur au démarrage.
 *
 * Mock local : MDY_FAKE_VERCEL_DOMAINS=1 (hors production) court-circuite tous
 * les appels en succès/verified pour tester le flux complet sans token.
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
  /** Cible CNAME recommandée par Vercel pour CE domaine (rank 1), ou null. */
  cnameTarget: string | null;
};

export type AddDomainResult =
  | { ok: true; verified: boolean; verification: VercelVerificationRecord[] }
  | { ok: false; code: "taken" | "invalid" | "api_error" };

/** Cible CNAME générique de Vercel — repli quand la recommandation par domaine
    (recommendedCNAME) n'a pas encore été lue. Fonctionne toujours, mais le
    dashboard Vercel affiche « DNS Change Recommended » depuis l'expansion
    d'IP : préférer la valeur par domaine dès qu'on l'a. */
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
  // « Déjà en usage » : si c'est sur NOTRE projet, c'est un cleanup raté qui se
  // répare tout seul — on repart de l'état actuel. Sinon, le domaine est pris.
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

/** 404 = déjà détaché : succès (idempotent). */
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

  // Challenge TXT en attente (domaine revendiqué par un autre compte Vercel) :
  // on tente la vérification — elle réussit dès que le TXT est posé.
  if (body.verified !== true && (body.verification?.length ?? 0) > 0) {
    const verifyRes = await vercelFetch(
      `/v9/projects/${projectId}/domains/${encoded}/verify`,
      { method: "POST" }
    );
    if (verifyRes.ok) {
      body = (await verifyRes.json()) as typeof body;
    }
  }

  // projectIdOrName : la recommandation CNAME est propre au couple
  // domaine × projet depuis l'expansion d'IP Vercel (vercel-dns-016 & co).
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
