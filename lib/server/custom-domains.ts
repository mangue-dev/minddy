import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { getServiceClient } from "@/lib/supabase-service";
import {
  invalidateCustomDomainCache,
  lookupCustomDomain,
  type DomainTarget,
} from "@/lib/custom-domain-lookup";
import { customDomainAllowlist, isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import {
  addDomainToVercel,
  getVercelDomainState,
  removeDomainFromVercel,
  VERCEL_CNAME_TARGET,
  type VercelVerificationRecord,
} from "@/lib/server/vercel-domains";

/**
 * Domaines personnalisés (MIN-36). Une ligne custom_domains = un hostname
 * client qui sert un board de feedback OU une vue partagée à la racine. La
 * table est RLS deny-all : tout passe par ici (service client), les checks
 * d'accès vivent dans les routes API.
 *
 * Ordre d'écriture : Vercel d'abord, DB ensuite — un domaine en base sans
 * attachement Vercel serait un mensonge (jamais servi), l'inverse se répare
 * tout seul (le 409 « déjà sur ce projet » est traité en succès à l'ajout).
 */

export interface CustomDomainRow {
  id: string;
  domain: string;
  board_id: string | null;
  share_id: string | null;
  status: "pending" | "verified";
  verification: VercelVerificationRecord[] | null;
  created_at: string;
  updated_at: string;
}

const DOMAIN_SELECT =
  "id, domain, board_id, share_id, status, verification, created_at, updated_at";

export type DomainTargetRef = { boardId: string } | { shareId: string };

export type NormalizeDomainResult =
  | { ok: true; domain: string }
  | { ok: false; error: "invalid" | "apex" | "forbidden" };

// Hostname RFC 1123 : labels alphanumériques + tirets internes, ≤ 63 chars.
const HOSTNAME_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Nos propres domaines et l'infra Vercel ne sont jamais des cibles valides.
const FORBIDDEN_SUFFIXES = ["minddy.app", "vercel.app", "vercel-dns.com", "localhost"];

/**
 * Nettoie une saisie utilisateur (« https://feedback.acme.com/ » → hostname) et
 * la valide. v1 : sous-domaines uniquement (≥ 3 labels) — un apex demande un
 * enregistrement A, incompatible avec l'instruction CNAME qu'on affiche.
 */
export function normalizeDomain(input: string): NormalizeDomainResult {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  value = value.split("/")[0]?.split("?")[0] ?? "";
  value = normalizeHost(value);

  if (!value || value.length > 253 || !HOSTNAME_RE.test(value)) {
    return { ok: false, error: "invalid" };
  }
  // L'allowlist ops (MDY_CUSTOM_DOMAIN_ALLOWLIST) court-circuite l'interdit
  // des suffixes minddy — dogfooding de feedback.minddy.app.
  if (
    !customDomainAllowlist().has(value) &&
    FORBIDDEN_SUFFIXES.some((suffix) => value === suffix || value.endsWith(`.${suffix}`))
  ) {
    return { ok: false, error: "forbidden" };
  }
  if (value.split(".").length < 3) return { ok: false, error: "apex" };
  return { ok: true, domain: value };
}

export async function getDomainForBoard(boardId: string): Promise<CustomDomainRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("custom_domains")
    .select(DOMAIN_SELECT)
    .eq("board_id", boardId)
    .maybeSingle();
  return (data as CustomDomainRow | null) ?? null;
}

export async function getDomainForShare(shareId: string): Promise<CustomDomainRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("custom_domains")
    .select(DOMAIN_SELECT)
    .eq("share_id", shareId)
    .maybeSingle();
  return (data as CustomDomainRow | null) ?? null;
}

async function getDomainRowForTarget(target: DomainTargetRef): Promise<CustomDomainRow | null> {
  return "boardId" in target ? getDomainForBoard(target.boardId) : getDomainForShare(target.shareId);
}

export type SetDomainResult =
  | { ok: true; row: CustomDomainRow }
  | { ok: false; error: "invalid" | "apex" | "forbidden" | "taken" | "api_error" };

/** Attache `domain` à la cible (remplace l'éventuel domaine précédent). */
export async function setDomain(
  target: DomainTargetRef,
  rawDomain: string,
  actorId: string
): Promise<SetDomainResult> {
  const normalized = normalizeDomain(rawDomain);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const domain = normalized.domain;

  const service = getServiceClient();

  // Unicité globale : un domaine déjà mappé ailleurs n'est jamais volé.
  const { data: existingRow } = await service
    .from("custom_domains")
    .select(DOMAIN_SELECT)
    .eq("domain", domain)
    .maybeSingle();
  const existing = existingRow as CustomDomainRow | null;
  if (existing) {
    const sameTarget =
      "boardId" in target ? existing.board_id === target.boardId : existing.share_id === target.shareId;
    if (!sameTarget) return { ok: false, error: "taken" };
    return { ok: true, row: existing }; // PUT idempotent
  }

  // Remplacement : la cible avait un autre domaine → on le détache proprement.
  const previous = await getDomainRowForTarget(target);
  if (previous) {
    const removed = await removeDomain(previous);
    if (!removed) return { ok: false, error: "api_error" };
  }

  const added = await addDomainToVercel(domain);
  if (!added.ok) {
    return { ok: false, error: added.code === "invalid" ? "invalid" : added.code };
  }

  const { data, error } = await service
    .from("custom_domains")
    .insert({
      domain,
      board_id: "boardId" in target ? target.boardId : null,
      share_id: "shareId" in target ? target.shareId : null,
      status: added.verified ? "verified" : "pending",
      verification: added.verification.length > 0 ? added.verification : null,
      created_by: actorId,
    })
    .select(DOMAIN_SELECT)
    .maybeSingle();

  if (error || !data) {
    // Course perdue sur l'unicité → on détache ce qu'on vient d'attacher.
    console.error("[custom-domains] insert failed:", error?.message);
    void removeDomainFromVercel(domain);
    return { ok: false, error: error?.code === "23505" ? "taken" : "api_error" };
  }

  invalidateCustomDomainCache(domain);
  return { ok: true, row: data as CustomDomainRow };
}

/**
 * Détachement Vercel seul, quand la ligne custom_domains part (ou est partie)
 * en cascade avec sa cible (suppression d'un share ou d'une vue). Échec = log
 * and continue : l'orphelin côté Vercel se répare au prochain ajout (409-succès).
 */
export async function detachDomainFromVercelOnly(row: CustomDomainRow): Promise<void> {
  const removed = await removeDomainFromVercel(row.domain);
  if (!removed.ok) {
    console.error(
      `[custom-domains] vercel detach failed for ${row.domain} (orphan, healed on re-add)`
    );
  }
  invalidateCustomDomainCache(row.domain);
}

/** Détache de Vercel PUIS supprime la ligne (l'inverse laisse un orphelin). */
export async function removeDomain(row: CustomDomainRow): Promise<boolean> {
  const removed = await removeDomainFromVercel(row.domain);
  if (!removed.ok) return false;

  const service = getServiceClient();
  const { error } = await service.from("custom_domains").delete().eq("id", row.id);
  if (error) {
    console.error("[custom-domains] delete failed:", error.message);
    return false;
  }
  invalidateCustomDomainCache(row.domain);
  return true;
}

export interface DomainStatus {
  domain: string;
  status: "pending" | "verified";
  misconfigured: boolean;
  dns: Array<{ type: "CNAME" | "TXT"; name: string; value: string }>;
}

/** Interroge Vercel, persiste le statut, retourne la forme consommée par l'UI. */
export async function refreshDomainStatus(row: CustomDomainRow): Promise<DomainStatus> {
  const state = await getVercelDomainState(row.domain);
  const status: CustomDomainRow["status"] =
    state.verified && !state.misconfigured ? "verified" : "pending";
  const verification = state.verification.length > 0 ? state.verification : null;

  if (status !== row.status || JSON.stringify(verification) !== JSON.stringify(row.verification)) {
    const service = getServiceClient();
    await service
      .from("custom_domains")
      .update({ status, verification })
      .eq("id", row.id);
  }

  return serializeDomainStatus({ ...row, status, verification }, state.misconfigured);
}

/** Forme API/UI sans appel Vercel (chargement initial des réglages). */
export function serializeDomainStatus(
  row: CustomDomainRow,
  misconfigured?: boolean
): DomainStatus {
  const dns: DomainStatus["dns"] = [
    { type: "CNAME", name: row.domain, value: VERCEL_CNAME_TARGET },
    ...(row.verification ?? [])
      .filter((v) => v.type?.toUpperCase() === "TXT")
      .map((v) => ({ type: "TXT" as const, name: v.domain, value: v.value })),
  ];
  return {
    domain: row.domain,
    status: row.status,
    misconfigured: misconfigured ?? row.status !== "verified",
    dns,
  };
}

// ── Contexte requête : sur quel host la page publique est-elle servie ? ──────

const getRequestHost = cache(async (): Promise<string> => {
  const h = await headers();
  return normalizeHost(h.get("host") ?? "");
});

/** Host custom (≠ minddy.app / vercel.app / localhost), quel que soit le path. */
export async function isCustomPublicHost(): Promise<boolean> {
  const host = await getRequestHost();
  return Boolean(host) && !isPrimaryHost(host);
}

/**
 * Cible mappée sur le host de la requête (null sur host primaire). React-cached
 * par requête ; réutilise le cache 60 s du lookup middleware.
 */
export const getRequestDomainTarget = cache(async (): Promise<DomainTarget | null> => {
  const host = await getRequestHost();
  if (!host || isPrimaryHost(host)) return null;
  return lookupCustomDomain(host);
});

/**
 * Préfixe public des liens du board : "" quand la page est servie par SON
 * domaine custom (URLs propres), sinon /f/<token>. Conscient du MAPPING, pas
 * seulement du host : une vue partagée visitée en pass-through sur le domaine
 * d'un board garde son préfixe token.
 */
export function feedbackBasePath(token: string, target: DomainTarget | null): string {
  return target?.kind === "feedback" && target.token === token ? "" : `/f/${token}`;
}

export function shareBasePath(token: string, target: DomainTarget | null): string {
  return target?.kind === "share" && target.token === token ? "" : `/share/${token}`;
}

/**
 * Path des cookies publics : conscient du HOST uniquement. Sur un domaine
 * custom, le path visible ne contient jamais /f/<token> — un cookie path-scopé
 * y serait invisible ; et un domaine = un seul site, donc path=/ est sûr.
 */
export function publicCookiePath(isCustomHost: boolean, defaultPath: string): string {
  return isCustomHost ? "/" : defaultPath;
}
