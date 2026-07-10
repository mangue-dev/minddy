import "server-only";

import { getAppEnv } from "@/lib/env";

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
};

export type AddDomainResult =
  | { ok: true; verified: boolean; verification: VercelVerificationRecord[] }
  | { ok: false; code: "taken" | "invalid" | "api_error" };

/** La cible CNAME universelle de Vercel, affichée dans les instructions DNS. */
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

function isFake(): boolean {
  return process.env.MDY_FAKE_VERCEL_DOMAINS === "1" && getAppEnv() !== "production";
}

export function isVercelDomainsConfigured(): boolean {
  if (isFake()) return true;
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

function apiUrl(path: string): string {
  const teamId = process.env.VERCEL_TEAM_ID;
  return `https://api.vercel.com${path}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;
}

async function vercelFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
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
  if (isFake()) return { attached: true, verified: true, misconfigured: false, verification: [] };

  const projectId = process.env.VERCEL_PROJECT_ID;
  const encoded = encodeURIComponent(domain);

  const domainRes = await vercelFetch(`/v9/projects/${projectId}/domains/${encoded}`);
  if (domainRes.status === 404) {
    return { attached: false, verified: false, misconfigured: true, verification: [] };
  }
  if (!domainRes.ok) {
    console.error(`[vercel-domains] get ${domain} failed: ${domainRes.status}`);
    return { attached: false, verified: false, misconfigured: true, verification: [] };
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

  const configRes = await vercelFetch(`/v6/domains/${encoded}/config`);
  const config = configRes.ok
    ? ((await configRes.json()) as { misconfigured?: boolean })
    : { misconfigured: true };

  return {
    attached: true,
    verified: body.verified === true,
    misconfigured: config.misconfigured !== false,
    verification: body.verification ?? [],
  };
}
