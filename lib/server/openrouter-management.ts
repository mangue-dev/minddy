import "server-only";

/**
 * OpenRouter key management API (MIN-761).
 *
 * The management key issues, caps and deletes the API keys Minddy Cloud uses
 * per billed account. It can create uncapped keys, so it is the most sensitive
 * secret of the deployment: it is read here, sent only to OpenRouter's key
 * endpoints, and never handed to a caller.
 *
 * Keys that are no longer used are DELETED, never disabled: the retired run
 * keys (MIN-223) were only disabled and left dead keys behind on the account.
 * `patchKey` therefore does not accept `disabled`.
 */

const KEYS_URL = "https://openrouter.ai/api/v1/keys";
const REQUEST_TIMEOUT_MS = 10_000;

/** The current name, and the name OpenRouter used before it renamed provisioning keys. */
const MANAGEMENT_ENV = "OPENROUTER_MANAGEMENT_KEY";
const LEGACY_MANAGEMENT_ENV = "OPENROUTER_PROVISIONING_KEY";

export type OpenRouterManagementErrorCode =
  | "management_key_missing"
  | "http"
  | "network"
  | "invalid_response";

export class OpenRouterManagementError extends Error {
  constructor(
    readonly code: OpenRouterManagementErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "OpenRouterManagementError";
  }
}

export interface ManagedKeyInfo {
  hash: string;
  name: string;
  /** Spending limit in USD, `null` when uncapped. */
  limit: number | null;
  /** Cumulative OpenRouter usage of the key, in USD. */
  usage: number;
  /** Usage of the current UTC day, the counter a daily limit applies to. */
  usageDaily: number;
  createdAt: string | null;
}

export interface CreatedManagedKey extends ManagedKeyInfo {
  /** The `sk-or-v1-…` secret, returned only once, at creation. */
  key: string;
}

export function readManagementKey(env: Record<string, string | undefined> = process.env): string | null {
  return env[MANAGEMENT_ENV]?.trim() || env[LEGACY_MANAGEMENT_ENV]?.trim() || null;
}

function requireManagementKey(): string {
  const key = readManagementKey();
  if (!key) {
    throw new OpenRouterManagementError(
      "management_key_missing",
      `${MANAGEMENT_ENV} is not configured`,
    );
  }
  return key;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseKeyInfo(value: unknown): ManagedKeyInfo {
  const data = value as Record<string, unknown> | null;
  if (!data || typeof data.hash !== "string" || !data.hash) {
    throw new OpenRouterManagementError("invalid_response", "Key response without a hash");
  }
  return {
    hash: data.hash,
    name: typeof data.name === "string" ? data.name : "",
    limit: finite(data.limit),
    usage: finite(data.usage) ?? 0,
    usageDaily: finite(data.usage_daily) ?? 0,
    createdAt: typeof data.created_at === "string" ? data.created_at : null,
  };
}

async function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; payload: unknown }> {
  const managementKey = requireManagementKey();
  let response: Response;
  try {
    response = await fetch(`${KEYS_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${managementKey}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new OpenRouterManagementError("network", `OpenRouter keys API unreachable: ${(err as Error).message}`);
  }
  if (response.status === 404) return { status: 404, payload: null };
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new OpenRouterManagementError(
      "http",
      `OpenRouter keys API ${method} failed (HTTP ${response.status}): ${detail}`,
      response.status,
    );
  }
  try {
    return { status: response.status, payload: await response.json() };
  } catch {
    throw new OpenRouterManagementError("invalid_response", "OpenRouter keys API returned invalid JSON");
  }
}

export async function createKey(params: {
  name: string;
  limitUsd: number;
  limitReset: "daily" | null;
}): Promise<CreatedManagedKey> {
  const { payload } = await request("POST", "", {
    name: params.name,
    limit: params.limitUsd,
    limit_reset: params.limitReset,
    // BYOK calls go through the user's own key, never through this one.
    include_byok_in_limit: false,
  });
  const result = payload as { data?: unknown; key?: unknown } | null;
  if (typeof result?.key !== "string" || !result.key) {
    throw new OpenRouterManagementError("invalid_response", "Created key without a secret");
  }
  return { ...parseKeyInfo(result.data), key: result.key };
}

/** The key, or `null` when OpenRouter no longer knows it. */
export async function getKey(hash: string): Promise<ManagedKeyInfo | null> {
  const { status, payload } = await request("GET", `/${encodeURIComponent(hash)}`);
  if (status === 404) return null;
  return parseKeyInfo((payload as { data?: unknown } | null)?.data);
}

/** Changes the spending limit. `null` when the key no longer exists. */
export async function patchKey(
  hash: string,
  changes: { limitUsd: number },
): Promise<ManagedKeyInfo | null> {
  const { status, payload } = await request("PATCH", `/${encodeURIComponent(hash)}`, {
    limit: changes.limitUsd,
  });
  if (status === 404) return null;
  return parseKeyInfo((payload as { data?: unknown } | null)?.data);
}

/** Deletes the key. `false` when it was already gone. */
export async function deleteKey(hash: string): Promise<boolean> {
  const { status } = await request("DELETE", `/${encodeURIComponent(hash)}`);
  return status !== 404;
}

/** Every key of the account, disabled and expired ones included, page by page. */
export async function listKeys(): Promise<ManagedKeyInfo[]> {
  const keys: ManagedKeyInfo[] = [];
  // A hard stop keeps a provider that ignores `offset` from looping forever.
  for (let page = 0; page < 1_000; page += 1) {
    const query = new URLSearchParams({
      offset: String(keys.length),
      include_disabled: "true",
      include_expired: "true",
    });
    const { payload } = await request("GET", `?${query}`);
    const data = (payload as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) {
      throw new OpenRouterManagementError("invalid_response", "Key list without data");
    }
    if (data.length === 0) return keys;
    keys.push(...data.map(parseKeyInfo));
  }
  throw new OpenRouterManagementError("invalid_response", "Key list did not end");
}
