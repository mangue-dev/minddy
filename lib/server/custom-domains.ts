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
import { reserveProviderOperation } from "@/lib/server/provider-operation-guard";

/**
 * Custom domains (MIN-36). One `custom_domains` row maps a customer
 * hostname to either a feedback board or a shared view at its root. The table
 * is RLS deny-all: all service-role access goes through this module, while
 * authorization remains in the API routes.
 *
 * Write order is Vercel first, then the database. A database domain without a
 * Vercel attachment would be unusable; the reverse case self-heals because a
 * Vercel 409 for a domain already attached to this project counts as success.
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
  // The operations allowlist bypasses forbidden Minddy suffixes so deployments
  // can dogfood a host such as feedback.minddy.app.
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

export type DomainProviderOperationError = {
  ok: false;
  error: "rate_limited" | "operation_in_progress" | "provider_unavailable";
  retryAfter?: number;
};

export type SetDomainResult =
  | { ok: true; row: CustomDomainRow }
  | { ok: false; error: "invalid" | "apex" | "forbidden" | "taken" | "api_error" }
  | DomainProviderOperationError;

const DOMAIN_PROVIDER_LIMIT = 20;
const DOMAIN_PROVIDER_WINDOW_SECONDS = 60;
const DOMAIN_MUTATION_DEDUPE_SECONDS = 10;
const DOMAIN_REFRESH_DEDUPE_SECONDS = 15;

type DomainMutationOptions = {
  resourceKey?: string;
  mutationAlreadyReserved?: boolean;
};

function targetResourceKey(target: DomainTargetRef): string {
  return "boardId" in target ? `board:${target.boardId}` : `share:${target.shareId}`;
}

function rowResourceKey(row: CustomDomainRow): string {
  return row.board_id ? `board:${row.board_id}` : `share:${row.share_id}`;
}

async function reserveDomainProviderOperation(input: {
  actorId: string;
  operation: "mutation" | "refresh";
  resourceKey: string;
  dedupeSeconds: number;
}): Promise<DomainProviderOperationError | null> {
  const reservation = await reserveProviderOperation({
    actorId: input.actorId,
    provider: "vercel-domains",
    operation: input.operation,
    resourceKey: input.resourceKey,
    limit: DOMAIN_PROVIDER_LIMIT,
    windowSeconds: DOMAIN_PROVIDER_WINDOW_SECONDS,
    dedupeSeconds: input.dedupeSeconds,
  });
  switch (reservation.state) {
    case "reserved":
      return null;
    case "deduplicated":
      return { ok: false, error: "operation_in_progress", retryAfter: reservation.retryAfter };
    case "quota_exceeded":
      return { ok: false, error: "rate_limited", retryAfter: reservation.retryAfter };
    case "unavailable":
      return { ok: false, error: "provider_unavailable" };
  }
}

/** Reserves the stable target key shared by share revocation and domain routes. */
export async function reserveCustomDomainMutation(
  resourceKey: string,
  actorId: string,
): Promise<DomainProviderOperationError | null> {
  return reserveDomainProviderOperation({
    actorId,
    operation: "mutation",
    resourceKey,
    dedupeSeconds: DOMAIN_MUTATION_DEDUPE_SECONDS,
  });
}

/**
 * Serializes provider calls for one hostname across different Minddy targets.
 * Target leases alone cannot protect two projects racing to claim the same
 * hostname, because each project has a different target key.
 */
async function reserveDomainNameMutation(
  domain: string,
  actorId: string,
): Promise<DomainProviderOperationError | null> {
  const reservation = await reserveProviderOperation({
    actorId,
    provider: "vercel-domain-names",
    operation: "mutation",
    resourceKey: domain.toLowerCase(),
    limit: DOMAIN_PROVIDER_LIMIT,
    windowSeconds: DOMAIN_PROVIDER_WINDOW_SECONDS,
    dedupeSeconds: DOMAIN_MUTATION_DEDUPE_SECONDS,
  });
  switch (reservation.state) {
    case "reserved":
      return null;
    case "deduplicated":
      return { ok: false, error: "operation_in_progress", retryAfter: reservation.retryAfter };
    case "quota_exceeded":
      return { ok: false, error: "rate_limited", retryAfter: reservation.retryAfter };
    case "unavailable":
      return { ok: false, error: "provider_unavailable" };
  }
}

/** Attaches `domain` to the target (replaces any previous domain). */
export async function setDomain(
  target: DomainTargetRef,
  rawDomain: string,
  actorId: string,
  options?: DomainMutationOptions,
): Promise<SetDomainResult> {
  const normalized = normalizeDomain(rawDomain);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  const domain = normalized.domain;

  const refusal = options?.mutationAlreadyReserved
    ? null
    : await reserveCustomDomainMutation(
        options?.resourceKey ?? targetResourceKey(target),
        actorId,
      );
  if (refusal) return refusal;

  const domainRefusal = await reserveDomainNameMutation(domain, actorId);
  if (domainRefusal) return domainRefusal;

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

  // Replacement: detach the target's previous domain before attaching the new
  // one. The “if there was one” guard belongs in the removal helper, not in a
  // `if (previous)` here: this guard is compiled in `if (true)`.
  // See the explanation on `removeDomainAfterReservation`.
  const previous = await getDomainRowForTarget(target);
  if (previous && previous.domain.toLowerCase() !== domain) {
    const previousRefusal = await reserveDomainNameMutation(previous.domain, actorId);
    if (previousRefusal) return previousRefusal;
  }
  if (!(await removeDomainAfterReservation(previous))) {
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
    // A global uniqueness race may have retained the same hostname for another
    // target. Never detach that winner's provider resource.
    console.error("[custom-domains] insert failed:", error?.message);
    const { data: retained } = await service
      .from("custom_domains")
      .select("id")
      .eq("domain", domain)
      .maybeSingle();
    if (!retained) void removeDomainFromVercel(domain);
    return { ok: false, error: error?.code === "23505" ? "taken" : "api_error" };
  }

  invalidateCustomDomainCache(domain);
  return { ok: true, row: data as CustomDomainRow };
}

/**
 * Detaches from Vercel only when a `custom_domains` row is being, or has been,
 * removed by a target cascade. Failure is logged but does not block deletion:
 * a later add repairs the Vercel orphan through the accepted 409 response.
 */
export async function detachDomainFromVercelOnly(
  row: CustomDomainRow,
  actorId: string,
  options?: DomainMutationOptions,
): Promise<void> {
  if (!options?.mutationAlreadyReserved) {
    const refusal = await reserveCustomDomainMutation(
      options?.resourceKey ?? rowResourceKey(row),
      actorId,
    );
    if (refusal) return;
  }
  if (await reserveDomainNameMutation(row.domain, actorId)) return;

  // The share cascade removed the captured row. If the hostname has already
  // been retained by a newer mapping, provider cleanup belongs to that mapping.
  const service = getServiceClient();
  const { data: retained, error } = await service
    .from("custom_domains")
    .select("id")
    .eq("domain", row.domain)
    .maybeSingle();
  if (error || retained) return;

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
 * **`null` means there is nothing to detach, which is a success.** Callers all
 * start with a lookup that may find nothing, and detachment is naturally
 * idempotent. Keep the null guard here instead of copying it to every caller.
 *
 * This is not merely a convenience; it is the only reliable guard here.
 * Turbopack (Next 16.3) evaluates `await getDomainRowForTarget(target)` as a
 * truthy value: the function is async, so its return is a Promise object and
 * the `await` is not modeled. The former `if (previous)` in `setDomain` was
 * compiled as `if (true)` in both development and production. Attaching the
 * first domain then failed with `Cannot read properties of null`, even though
 * the source appeared to make that branch unreachable.
 *
 * Therefore, do not move this guard back to a call site. It would look safe
 * but would not survive compilation. This is the only observed runtime-value
 * condition folded this way in the generated `.next` output.
 */
async function removeDomainAfterReservation(row: CustomDomainRow | null): Promise<boolean> {
  if (!row) return true;

  const removed = await removeDomainFromVercel(row.domain);
  if (!removed.ok) return false;

  const { data: deleted, error } = await getServiceClient().rpc(
    "delete_custom_domain_if_current",
    { p_id: row.id, p_domain: row.domain },
  );
  if (error) {
    console.error("[custom-domains] delete failed:", error.message);
    return false;
  }
  if (!deleted) return false;
  invalidateCustomDomainCache(row.domain);
  return true;
}

export type RemoveDomainResult =
  | { ok: true }
  | DomainProviderOperationError
  | { ok: false; error: "api_error" };

/** Reserves a shared mutation slot before detaching a domain from Vercel. */
export async function removeDomain(
  row: CustomDomainRow | null,
  actorId: string,
  options?: DomainMutationOptions,
): Promise<RemoveDomainResult> {
  if (!row) return { ok: true };
  const refusal = options?.mutationAlreadyReserved
    ? null
    : await reserveCustomDomainMutation(
        options?.resourceKey ?? rowResourceKey(row),
        actorId,
      );
  if (refusal) return refusal;
  const domainRefusal = await reserveDomainNameMutation(row.domain, actorId);
  if (domainRefusal) return domainRefusal;
  return (await removeDomainAfterReservation(row))
    ? { ok: true }
    : { ok: false, error: "api_error" };
}

export interface DomainStatus {
  domain: string;
  status: "pending" | "verified";
  misconfigured: boolean;
  dns: Array<{ type: "CNAME" | "TXT"; name: string; value: string }>;
}

export type RefreshDomainStatusResult =
  | { ok: true; domain: DomainStatus; refreshed: boolean }
  | DomainProviderOperationError;

/** Queries Vercel, persists the status, and returns the UI representation. */
export async function refreshDomainStatus(
  row: CustomDomainRow,
  actorId: string,
  options?: { mutationAlreadyReserved?: boolean },
): Promise<RefreshDomainStatusResult> {
  if (!options?.mutationAlreadyReserved) {
    const refusal = await reserveDomainProviderOperation({
      actorId,
      operation: "refresh",
      resourceKey: rowResourceKey(row),
      dedupeSeconds: DOMAIN_REFRESH_DEDUPE_SECONDS,
    });
    if (refusal?.error === "operation_in_progress") {
      return { ok: true, domain: serializeDomainStatus(row), refreshed: false };
    }
    if (refusal) return refusal;
  }

  const state = await getVercelDomainState(row.domain);
  const status: CustomDomainRow["status"] =
    state.verified && !state.misconfigured ? "verified" : "pending";
  const verification = state.verification.length > 0 ? state.verification : null;
  // Never replace an existing recommendation with null after a failed config
  // response; Vercel's domain-specific value remains stable.
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

  return {
    ok: true,
    domain: serializeDomainStatus(
      { ...row, status, verification, cname_target },
      state.misconfigured,
    ),
    refreshed: true,
  };
}

/** API/UI form without Vercel call (initial loading of settings). */
export function serializeDomainStatus(
  row: CustomDomainRow,
  misconfigured?: boolean
): DomainStatus {
  const dns: DomainStatus["dns"] = [
    // Prefer Vercel's domain-specific target when known; the generic target
    // remains functional but is no longer recommended.
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

/** Whether the request uses a custom host, regardless of its path. */
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
 * Public board-link prefix: empty when a page is served by its own custom
 * domain, otherwise `/f/<token>`. This uses the mapped target, not just the
 * host: a shared view visited through a board domain keeps its token prefix.
 */
export function feedbackBasePath(token: string, target: DomainTarget | null): string {
  return target?.kind === "feedback" && target.token === token ? "" : `/f/${token}`;
}

export function shareBasePath(token: string, target: DomainTarget | null): string {
  return target?.kind === "share" && target.token === token ? "" : `/share/${token}`;
}

/**
 * Absolute canonical URL for a public page served under two hosts (MIN-88).
 *
 * A feedback board responds on both `www.minddy.app/f/<token>` and the
 * customer's domain. The canonical URL selects the customer's domain when it
 * serves the page directly, and `www.minddy.app` otherwise.
 *
 * `basePath` comes from `feedbackBasePath` or `shareBasePath`; an empty value
 * means the request is already on the dedicated domain.
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
 * Public cookie path, based only on the host. A custom-domain URL never
 * contains `/f/<token>`, so a token-path cookie would be invisible there.
 * One custom domain maps to one site, making `path=/` safe.
 */
export function publicCookiePath(isCustomHost: boolean, defaultPath: string): string {
  return isCustomHost ? "/" : defaultPath;
}
