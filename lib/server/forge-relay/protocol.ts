import "server-only";

import crypto from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Request authentication for the managed forge relay control plane
 * (docs/managed-forge-relay-plan.md, "Instance identity and authentication").
 *
 * Every relay request is signed with the instance's Ed25519 PRIVATE key; the
 * control plane stores only the public key (decided in Phase 0). The signed
 * payload covers method, path, timestamp, a single-use nonce, and the SHA-256
 * of the raw body, which pins the request to one wire message: replay is
 * stopped twice, by a ±5 min timestamp window AND by the nonce unique
 * constraint (`forge_relay_nonces`).
 */

export const RELAY_TIMESTAMP_TOLERANCE_MS = 5 * 60_000;

export const RELAY_INSTANCE_HEADER = "x-minddy-relay-instance";
export const RELAY_TIMESTAMP_HEADER = "x-minddy-relay-timestamp";
export const RELAY_NONCE_HEADER = "x-minddy-relay-nonce";
export const RELAY_SIGNATURE_HEADER = "x-minddy-relay-signature";

export interface RelayRequestSignature {
  [key: string]: string;
}

/** Stable bytes covered by the signature. Exported for the instance-side client and tests. */
export function relaySigningPayload(input: {
  method: string;
  path: string;
  timestamp: number;
  nonce: string;
  rawBody: string;
}): Buffer {
  const bodyHash = crypto
    .createHash("sha256")
    .update(input.rawBody, "utf8")
    .digest("hex");
  return Buffer.from(
    [
      input.method.toUpperCase(),
      input.path,
      String(input.timestamp),
      input.nonce,
      bodyHash,
    ].join("\n"),
    "utf8",
  );
}

/**
 * Builds the signature headers for one relay request. The private key is PEM
 * (PKCS#8); this is the instance side of the protocol, used by the relay
 * client and by the tests of the control plane.
 */
export function signRelayRequest(input: {
  method: string;
  path: string;
  rawBody: string;
  instanceId: string;
  privateKey: string;
  now?: number;
  nonce?: string;
}): RelayRequestSignature {
  const timestamp = input.now ?? Date.now();
  const nonce = input.nonce ?? crypto.randomUUID();
  // Ed25519 signs raw data: the digest argument must be null (Node API), the
  // algorithm is carried by the key itself.
  const signature = crypto.sign(
    null,
    relaySigningPayload({ ...input, timestamp, nonce }),
    crypto.createPrivateKey(input.privateKey),
  );
  return {
    [RELAY_INSTANCE_HEADER]: input.instanceId,
    [RELAY_TIMESTAMP_HEADER]: String(timestamp),
    [RELAY_NONCE_HEADER]: nonce,
    [RELAY_SIGNATURE_HEADER]: signature.toString("base64"),
  };
}

export interface RelayInstanceIdentity {
  id: string;
  name: string;
}

export type RelayRequestVerification =
  | { ok: true; instance: RelayInstanceIdentity; timestamp: number }
  | { ok: false; status: number; error: string };

/**
 * Verifies one incoming relay request: known ACTIVE instance, timestamp inside
 * the tolerance window, unused nonce (consumed atomically), and a valid
 * signature over the exact raw body. Every failure is explicit — the caller
 * turns it into a 4xx without further work.
 */
export async function verifyRelayRequest(input: {
  method: string;
  path: string;
  headers: Headers;
  rawBody: string;
  now?: number;
}): Promise<RelayRequestVerification> {
  const instanceId = input.headers.get(RELAY_INSTANCE_HEADER)?.trim();
  const timestamp = Number(input.headers.get(RELAY_TIMESTAMP_HEADER));
  const nonce = input.headers.get(RELAY_NONCE_HEADER)?.trim();
  const signature = input.headers.get(RELAY_SIGNATURE_HEADER)?.trim();
  if (!instanceId || !nonce || !signature || !Number.isFinite(timestamp)) {
    return { ok: false, status: 401, error: "Missing relay signature headers" };
  }

  const now = input.now ?? Date.now();
  if (Math.abs(now - timestamp) > RELAY_TIMESTAMP_TOLERANCE_MS) {
    return { ok: false, status: 401, error: "Relay request timestamp outside the tolerance window" };
  }

  const supabase = getServiceClient();
  const { data: instance } = await supabase
    .from("forge_relay_instances")
    .select("id, name, public_key, status")
    .eq("id", instanceId)
    .maybeSingle();
  const row = instance as
    | { id: string; name: string; public_key: string; status: string }
    | null;
  if (!row) {
    return { ok: false, status: 401, error: "Unknown relay instance" };
  }
  if (row.status !== "active") {
    return { ok: false, status: 403, error: "Relay instance is revoked" };
  }

  let valid = false;
  try {
    valid = crypto.verify(
      null,
      relaySigningPayload({
        method: input.method,
        path: input.path,
        timestamp,
        nonce,
        rawBody: input.rawBody,
      }),
      crypto.createPublicKey(row.public_key),
      Buffer.from(signature, "base64"),
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return { ok: false, status: 401, error: "Invalid relay request signature" };
  }

  // The nonce is consumed only AFTER the signature check: a forged request
  // must not be able to burn the nonces of a legitimate in-flight request.
  // The unique constraint is the replay verdict; expired rows are housekept
  // opportunistically, like the other throttle tables.
  const { error: nonceError } = await supabase
    .from("forge_relay_nonces")
    .insert({ nonce, expires_at: new Date(now + 2 * RELAY_TIMESTAMP_TOLERANCE_MS).toISOString() });
  if (nonceError) {
    return { ok: false, status: 401, error: "Replayed relay request" };
  }
  if (Math.random() < 0.01) {
    await supabase
      .from("forge_relay_nonces")
      .delete()
      .lt("expires_at", new Date(now).toISOString());
  }

  return { ok: true, instance: { id: row.id, name: row.name }, timestamp };
}

/**
 * Validates and normalizes an Ed25519 public key at registration time: PEM
 * (SPKI) as produced instance-side, or raw base64 DER which is wrapped. The
 * return value is the canonical PEM stored in `forge_relay_instances`.
 */
export function normalizeRelayPublicKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Public key is required");
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    // Throws on a key that is not a valid SPKI structure or not Ed25519-compatible.
    const key = crypto.createPublicKey(trimmed);
    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error("Relay instance keys must be Ed25519 public keys");
    }
    return trimmed.replace(/\r\n/g, "\n").endsWith("\n") ? trimmed : `${trimmed}\n`;
  }
  const der = Buffer.from(trimmed, "base64");
  const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Relay instance keys must be Ed25519 public keys");
  }
  return key.export({ format: "pem", type: "spki" }).toString().trim() + "\n";
}
