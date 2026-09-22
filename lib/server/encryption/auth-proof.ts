import "server-only";

import { createHmac } from "node:crypto";
import { requireSecret } from "@/lib/server/env-secrets";

/** A database snapshot must not be sufficient to forge an authentication proof. */
export function authenticationProof(
  purpose: "share_unlock" | "feedback_otp",
  parts: readonly string[],
): string {
  return createHmac("sha256", requireSecret("SUPABASE_SERVICE_ROLE_KEY"))
    .update(JSON.stringify(["minddy-auth-proof-v1", purpose, ...parts]))
    .digest("hex");
}
