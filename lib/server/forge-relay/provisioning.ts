import "server-only";

import crypto from "node:crypto";

import {
  DEFAULT_FORGE_RELAY_URL,
  isForgeRelayOptedOut,
  resolveForgeRelayConfig,
  type ForgeRelayConfig,
} from "@/lib/forge-relay";
import { getDeploymentEdition } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase-service";
import { hasStrongSecret } from "@/lib/server/env-secrets";
import {
  decryptForgeToken,
  encryptForgeToken,
  isForgeTokenCryptoConfigured,
} from "@/lib/server/git/token-crypto";
import { signRelayRequest } from "./protocol";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * Self-service provisioning of the managed forge relay, instance side
 * (docs/managed-forge-relay-plan.md).
 *
 * A self-hosted instance with no operator-owned forge app must NOT require
 * any relay environment variable: on first connect, it registers itself
 * against the minddy control plane and stores the issued identity in its own
 * database (`forge_relay_provisioning`, encrypted at rest). The flow is lazy —
 * nothing contacts minddy until a user actually connects a forge account.
 *
 * Precedence, mirrored by every consumer:
 * 1. explicit environment variables (`resolveForgeRelayConfig`) — Cloud and
 *    operators who pin a control plane; never touched here;
 * 2. the provisioned identity below;
 * 3. `MINDDY_FORGE_RELAY=0` or the cloud edition — provisioning is refused.
 *
 * The sync getters read ONLY the in-process cache: entry points that may
 * provision await `ensureForgeRelayProvisioned()` first, and request paths
 * that must not register (webhook receiver) await
 * `loadProvisionedRelayConfig()`, which only reads the database.
 */

interface ProvisionedIdentity extends ForgeRelayConfig {
  webhookSecret: string;
}

let cached: ProvisionedIdentity | null = null;
/**
 * A row exists but cannot be decrypted (the encryption secret changed). Sticky
 * for the process lifetime: re-reading the same row cannot help, only a
 * reconnect (which re-provisions and overwrites the row) can.
 */
let unreadable = false;
let inflight: Promise<boolean> | null = null;
let lastFailureAt = 0;

/** A failed registration is retried at most once per minute (connect-time
 * calls are user-driven, but several may race). */
const FAILURE_RETRY_DELAY_MS = 60_000;

function registrationRefused(): boolean {
  if (resolveForgeRelayConfig(process.env)) return false;
  if (isForgeRelayOptedOut(process.env)) return true;
  return getDeploymentEdition() === "cloud";
}

/**
 * Instance-side secrets provisioning depends on. Checked BEFORE the
 * control-plane call: a registration whose identity cannot be stored locally
 * would still create a live instance on Cloud — and every retry would orphan
 * another one there. Mirrors the `relayMissing` list of the capability
 * catalog (`lib/capabilities.ts`).
 */
function provisioningBlockers(): string[] {
  const blockers: string[] = [];
  if (!hasStrongSecret("GIT_STATE_SECRET")) blockers.push("GIT_STATE_SECRET");
  if (!isForgeTokenCryptoConfigured()) {
    blockers.push("GIT_TOKEN_ENCRYPTION_SECRET");
  }
  return blockers;
}

/**
 * Reads the stored identity into the cache WITHOUT ever registering. Safe for
 * unauthenticated request paths (the webhook receiver): worst case it does
 * one database read. Returns true when the relay is usable afterwards.
 *
 * An ABSENT row is not cached negatively: in a multi-process deployment
 * another process may provision at any time, so each call re-queries until an
 * identity actually exists.
 */
export async function loadProvisionedRelayConfig(): Promise<boolean> {
  if (resolveForgeRelayConfig(process.env)) return true;
  if (registrationRefused()) return false;
  if (cached) return true;
  if (unreadable) return false;
  const { data } = await getServiceClient()
    .from("forge_relay_provisioning")
    .select(
      "relay_url, instance_id, signing_key_encrypted, webhook_secret_encrypted",
    )
    .eq("id", true)
    .maybeSingle();
  const row = data as {
    relay_url: string;
    instance_id: string;
    signing_key_encrypted: string;
    webhook_secret_encrypted: string;
  } | null;
  if (!row) return false;
  const secret = decryptForgeToken(row.signing_key_encrypted);
  const webhookSecret = decryptForgeToken(row.webhook_secret_encrypted);
  if (!secret || !webhookSecret) {
    unreadable = true;
    console.error(
      "[forge-relay] provisioned identity is unreadable (encryption secret changed?); reconnect a forge account to re-provision",
    );
    return false;
  }
  cached = {
    url: row.relay_url,
    instanceId: row.instance_id,
    secret,
    webhookSecret,
  };
  return true;
}

/**
 * Makes sure the relay is usable, REGISTERING the instance on first use.
 * Called from authenticated connect flows only. Idempotent; concurrent calls
 * share one registration.
 */
export async function ensureForgeRelayProvisioned(): Promise<boolean> {
  if (resolveForgeRelayConfig(process.env)) return true;
  if (registrationRefused()) return false;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (await loadProvisionedRelayConfig()) return true;
      // Configuration errors surface on every attempt and never reach Cloud:
      // the blockers check comes before the failure backoff, which only
      // governs transient registration failures.
      const blockers = provisioningBlockers();
      if (blockers.length > 0) {
        console.error(
          `[forge-relay] automatic registration blocked, missing or weak instance secrets: ${blockers.join(", ")} — generate them with \`openssl rand -hex 32\``,
        );
        return false;
      }
      if (Date.now() - lastFailureAt < FAILURE_RETRY_DELAY_MS) return false;
      try {
        await registerInstance();
        return true;
      } catch (err) {
        lastFailureAt = Date.now();
        console.error(
          "[forge-relay] automatic registration failed:",
          (err as Error).message,
        );
        return false;
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * One registration round-trip: keypair generation, control-plane call, local
 * storage, webhook endpoint push. Any failure leaves no partial state — the
 * row is written only after Cloud accepted the public key.
 */
async function registerInstance(): Promise<void> {
  const url = DEFAULT_FORGE_RELAY_URL.replace(/\/$/, "");
  const { publicKeyPem, privateKeyPem } = generateSigningKeyPair();
  let name = "self-hosted";
  try {
    name = new URL(canonicalAppOrigin()).hostname.slice(0, 80) || name;
  } catch {
    // The default name is fine when the origin cannot be resolved yet.
  }

  const response = await fetch(`${url}/api/relay/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: publicKeyPem, name }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => null)) as {
    instanceId?: string;
    error?: string;
  } | null;
  if (!response.ok || !data?.instanceId) {
    throw new Error(data?.error || `registration failed (${response.status})`);
  }

  const webhookSecret = crypto.randomBytes(32).toString("hex");
  const { error } = await getServiceClient()
    .from("forge_relay_provisioning")
    .upsert(
      {
        id: true,
        relay_url: url,
        instance_id: data.instanceId,
        signing_key_encrypted: encryptForgeToken(privateKeyPem),
        webhook_secret_encrypted: encryptForgeToken(webhookSecret),
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);

  cached = {
    url,
    instanceId: data.instanceId,
    secret: privateKeyPem,
    webhookSecret,
  };

  // Announce the fan-out endpoint immediately so a claim completed right
  // after the connect already receives webhooks.
  await pushProvisionedWebhookRegistration();
}

/** Registers (or rotates) the fan-out endpoint with the provisioned identity. */
export async function pushProvisionedWebhookRegistration(): Promise<void> {
  if (!cached) return;
  const path = "/api/relay/webhook-secret";
  const rawBody = JSON.stringify({
    webhookUrl: `${canonicalAppOrigin()}/api/webhooks/github`,
    secret: cached.webhookSecret,
  });
  const headers = signRelayRequest({
    method: "POST",
    path,
    rawBody,
    instanceId: cached.instanceId,
    privateKey: cached.secret,
  });
  const response = await fetch(`${cached.url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: rawBody,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error(
      "[forge-relay] webhook registration refused:",
      await response.text().catch(() => `HTTP ${response.status}`),
    );
  }
}

function generateSigningKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

/** The provisioned identity, or null. Sync: reads only the in-process cache —
 * await `ensureForgeRelayProvisioned()` / `loadProvisionedRelayConfig()` first. */
export function getProvisionedRelayConfig(): ForgeRelayConfig | null {
  return cached ? { url: cached.url, instanceId: cached.instanceId, secret: cached.secret } : null;
}

/** The provisioned webhook HMAC secret, or null (same cache contract). */
export function getProvisionedWebhookSecret(): string | null {
  return cached?.webhookSecret ?? null;
}

/** Clears the in-process cache. Reserved for tests. */
export function __resetProvisioningCacheForTests(): void {
  cached = null;
  unreadable = false;
  inflight = null;
  lastFailureAt = 0;
}
