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
import { SITE_URL } from "@/lib/site";
import {
  addDomainToVercel,
  getVercelDomainState,
  removeDomainFromVercel,
  VERCEL_CNAME_TARGET,
  type VercelVerificationRecord,
} from "@/lib/server/vercel-domains";

/**
 * Custom domains (MIN-36). A custom_domains line = a hostname
 * client that serves a feedback board OR a shared view at the root. The
 * table is RLS deny-all: everything goes through here (customer service), the access checks
 * live in the API routes.
 *
 * Writing order: Vercel first, DB then — a base domain without
 * Vercel attachment would be a lie (never used), the reverse is repaired
 * on its own (the 409 “already on this project” is treated as a success when added).
 */

export interface CustomDomainRow {
  id: string;
  domain: string;
  board_id: string | null;
  share_id: string | null;
  status: "pending" | "verified";
  verification: VercelVerificationRecord[] | null;
  /** CNAME target recommended by Vercel for THIS domain (null → generic). */
  cname_target: string | null;
  created_at: string;
  updated_at: string;
}

const DOMAIN_SELECT =
  "id, domain, board_id, share_id, status, verification, cname_target, created_at, updated_at";

export type DomainTargetRef = { boardId: string } | { shareId: string };

export type NormalizeDomainResult =
  | { ok: true; domain: string }
  | { ok: false; error: "invalid" | "apex" | "forbidden" };

// Hostname RFC 1123: alphanumeric labels + internal hyphens, ≤ 63 chars.
const HOSTNAME_RE =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Our own domains and Vercel infra are never valid targets.
const FORBIDDEN_SUFFIXES = ["minddy.app", "vercel.app", "vercel-dns.com", "localhost"];

/**
 * Cleans up a user entry (“https://feedback.acme.com/” → hostname) and
 * validates it. v1: subdomains only (≥ 3 labels) — an apex requests a
 * A record, incompatible with the CNAME instruction displayed.
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

/** Attaches `domain` to the target (replaces any previous domain). */
export async function setDomain(
  target: DomainTargetRef,
  rawDomain: string,
  actorId: string
): Promise<SetDomainResult> {
  const normalized = normalizeDomain(rawDomain);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const domain = normalized.domain;

  const service = getServiceClient();

  // Global uniqueness: a domain already mapped elsewhere is never stolen.
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

  // Replacement: the target had another domain → we detach it properly.
  // The “if there was one” is IN `removeDomain`, not in a
  // `if (previous)` here: this guard is compiled in `if (true)`.
  // The explanation is based on `removeDomain`.
  const previous = await getDomainRowForTarget(target);
  if (!(await removeDomain(previous))) {
    return { ok: false, error: "api_error" };
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
    // Lost race on uniqueness → we detach what we have just attached.
    console.error("[custom-domains] insert failed:", error?.message);
    void removeDomainFromVercel(domain);
    return { ok: false, error: error?.code === "23505" ? "taken" : "api_error" };
  }

  invalidateCustomDomainCache(domain);
  return { ok: true, row: data as CustomDomainRow };
}

/**
 * Vercel detachment alone, when the custom_domains line leaves (or has left)
 * in cascade with its target (deletion of a share or a view). Failure = log
 * and continue: the orphan on the Vercel side repairs itself on the next addition (409-success).
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

/**
 * Detaches from Vercel THEN deletes the row (the reverse leaves an orphan).
 *
 * **`null` = nothing to detach, and this is a success.** All three callers leave
 * from a search which may find nothing, and a detach is idempotent by
 * nature: the "if there is one" has its place here, once, rather than copied
 * on each call site.
 *
 * It's not just a convenience, it's the only protection we control.
 * Turbopack (Next 16.3) evaluates `await getDomainRowForTarget(target)` as a
 * always true value — the function is `async`, so its return is a
 * Promise, therefore an object, and the `await` is not modeled. The `if (previous)`
 * which protected this call in `setDomain` was compiled in `if (true)`, in dev
 * AS in production (verified in both outputs): the first domain
 * attached to a board or a shared view died en
 * `TypeError: Cannot read properties of null (reading 'domain')`, with a stack
 * which designates a branch that the source makes unreachable.
 *
 * So: **do not put guard back on the call site.** It would be reread
 * as protection, and wouldn't be one. This is the only place in the repository
 * where the compiler folds a condition on a runtime value —
 * checked on all the output of `.next` — but it is a place.
 */
export async function removeDomain(row: CustomDomainRow | null): Promise<boolean> {
  if (!row) return true;

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

/** Queries Vercel, persists the status, returns the form consumed by the UI. */
export async function refreshDomainStatus(row: CustomDomainRow): Promise<DomainStatus> {
  const state = await getVercelDomainState(row.domain);
  const status: CustomDomainRow["status"] =
    state.verified && !state.misconfigured ? "verified" : "pending";
  const verification = state.verification.length > 0 ? state.verification : null;
  // We never degrade an already known recommendation to null (response
  // config in error) — the value per domain remains stable on the Vercel side.
  const cname_target = state.cnameTarget ?? row.cname_target;

  if (
    status !== row.status ||
    cname_target !== row.cname_target ||
    JSON.stringify(verification) !== JSON.stringify(row.verification)
  ) {
    const service = getServiceClient();
    await service
      .from("custom_domains")
      .update({ status, verification, cname_target })
      .eq("id", row.id);
  }

  return serializeDomainStatus({ ...row, status, verification, cname_target }, state.misconfigured);
}

/** API/UI form without Vercel call (initial loading of settings). */
export function serializeDomainStatus(
  row: CustomDomainRow,
  misconfigured?: boolean
): DomainStatus {
  const dns: DomainStatus["dns"] = [
    // The recommended target by domain (vercel-dns-016 & co) when we read it,
    // otherwise the generic one — which works but which Vercel now advises against.
    { type: "CNAME", name: row.domain, value: row.cname_target ?? VERCEL_CNAME_TARGET },
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

// ── Request context: on which host is the public page served? ──────

const getRequestHost = cache(async (): Promise<string> => {
  const h = await headers();
  return normalizeHost(h.get("host") ?? "");
});

/** Host custom (≠ minddy.app / vercel.app / localhost), whatever the path. */
export async function isCustomPublicHost(): Promise<boolean> {
  const host = await getRequestHost();
  return Boolean(host) && !isPrimaryHost(host);
}

/**
 * Target mapped to the request host (null on primary host). React-cached
 * per request; reuses the 60 s cache from the middleware lookup.
 */
export const getRequestDomainTarget = cache(async (): Promise<DomainTarget | null> => {
  const host = await getRequestHost();
  if (!host || isPrimaryHost(host)) return null;
  return lookupCustomDomain(host);
});

/**
 * Public prefix of board links: "" when the page is served by SON
 * custom domain (own URLs), otherwise /f/<token>. Aware of the MAPPING, not
 * only of the host: a shared view visited in pass-through on the domain
 * of a board keeps its token prefix.
 */
export function feedbackBasePath(token: string, target: DomainTarget | null): string {
  return target?.kind === "feedback" && target.token === token ? "" : `/f/${token}`;
}

export function shareBasePath(token: string, target: DomainTarget | null): string {
  return target?.kind === "share" && target.token === token ? "" : `/share/${token}`;
}

/**
 * Absolute canonical URL of a public page served under TWO hosts (MIN-88).
 *
 * A feedback board responds to both `www.minddy.app/f/<token>` and
 * the client's domain — two URLs, single content. The `canonical` designates
 * the one which is authentic: the client's domain when it is he who serves the page
 * (it is his site, not ours), `www.minddy.app` otherwise.
 *
 * `basePath` is what returns `feedbackBasePath` / `shareBasePath`: the
 * empty string means precisely “we are on the dedicated domain”.
 */
export async function publicCanonicalUrl(basePath: string, subPath = ""): Promise<string> {
  const path = `${basePath}${subPath}` || "/";
  if (basePath === "") {
    const host = await getRequestHost();
    if (host) return `https://${host}${path}`;
  }
  return `${SITE_URL}${path}`;
}

/**
 * Public cookie path: HOST aware only. On a custom domain
 *, the visible path never contains /f/<token> — a path-scoped cookie
 * would be invisible there; and one domain = only one site, so path=/ is safe.
 */
export function publicCookiePath(isCustomHost: boolean, defaultPath: string): string {
  return isCustomHost ? "/" : defaultPath;
}
