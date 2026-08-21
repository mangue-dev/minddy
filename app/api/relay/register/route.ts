import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { getServiceClient } from "@/lib/supabase-service";
import { normalizeRelayPublicKey } from "@/lib/server/forge-relay/protocol";

/**
 * `POST /api/relay/register` — self-service instance registration
 * (docs/managed-forge-relay-plan.md). A self-hosted instance with no
 * operator-owned forge app provisions its relay identity automatically, on
 * first connect: it generates an Ed25519 keypair, sends the PUBLIC key here,
 * and stores the returned instance id in its own database. No minddy account,
 * no environment variable.
 *
 * Open by design, bounded by guardrails: per-IP rate limit below, one
 * identity per public key (idempotent retries return the same instance), and
 * every registration lands in the audit ledger so the operator's dashboard
 * can revoke abusive instances unilaterally.
 */

/** Registration attempts accepted per IP per hour. Provisioning happens once
 * per instance, so even a chatty NAT never comes close; this only exists to
 * keep a script from filling the table. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60_000;
/** Hard ceiling on tracked IPs: the key comes from `x-forwarded-for` and is
 * therefore client-controlled, so the map must not grow without bound. */
const RATE_LIMIT_MAX_IPS = 10_000;

const rateLimiter = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  if (rateLimiter.size >= RATE_LIMIT_MAX_IPS) {
    // First drop expired entries, then — still full — the least recently
    // active ones (a Map iterates in insertion order, and every hit re-inserts).
    for (const [key, hits] of rateLimiter) {
      if (!hits.some((at) => now - at < RATE_LIMIT_WINDOW_MS)) {
        rateLimiter.delete(key);
      }
      if (rateLimiter.size < RATE_LIMIT_MAX_IPS) break;
    }
    while (rateLimiter.size >= RATE_LIMIT_MAX_IPS) {
      const oldest = rateLimiter.keys().next().value;
      if (oldest === undefined) break;
      rateLimiter.delete(oldest);
    }
  }
  const hits = (rateLimiter.get(ip) ?? []).filter(
    (at) => now - at < RATE_LIMIT_WINDOW_MS,
  );
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimiter.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateLimiter.delete(ip);
  rateLimiter.set(ip, hits);
  return false;
}

export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json(
      { error: "Managed forge relay is not configured" },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  if (rateLimited(ip, Date.now())) {
    return NextResponse.json({ error: "Too many registrations" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    publicKey?: unknown;
    name?: unknown;
  } | null;
  if (!body || typeof body.publicKey !== "string") {
    return NextResponse.json({ error: "publicKey is required" }, { status: 400 });
  }
  let publicKey: string;
  try {
    publicKey = normalizeRelayPublicKey(body.publicKey);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "self-hosted";

  const supabase = getServiceClient();
  const { data: inserted, error } = await supabase
    .from("forge_relay_instances")
    .insert({ name, public_key: publicKey })
    .select("id")
    .single();
  if (!error && inserted) {
    // The registration stands either way, but a broken audit ledger must be
    // visible: the operator's revocation dashboard reads it.
    const { error: auditError } = await supabase.from("forge_relay_audit").insert({
      instance_id: inserted.id as string,
      action: "instance_registered",
      detail: { name, selfService: true },
    });
    if (auditError) {
      console.error("[relay/register] audit insert failed:", auditError.message);
    }
    return NextResponse.json({ instanceId: inserted.id });
  }

  // The public key identifies at most one instance (unique index): a retry of
  // an already-registered key returns the EXISTING id instead of failing.
  const { data: existing } = await supabase
    .from("forge_relay_instances")
    .select("id, status")
    .eq("public_key", publicKey)
    .maybeSingle();
  const row = existing as { id: string; status: string } | null;
  if (row) {
    if (row.status !== "active") {
      return NextResponse.json(
        { error: "This relay instance has been revoked" },
        { status: 403 },
      );
    }
    return NextResponse.json({ instanceId: row.id });
  }

  console.error("[relay/register] insert failed:", error.message);
  return NextResponse.json({ error: "Registration failed" }, { status: 500 });
}
