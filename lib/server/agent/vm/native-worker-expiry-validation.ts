import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PROFILE_LIMIT, validateNativeProfile } from "../../../native-agent-profile";
import type { NativeCredentialProfile } from "../../../native-agent-prototype";

/** Private acceptance fixture only: this is never a provider-signed credential. */
export const EXPIRED_ACCESS_FIXTURE = [
  Buffer.from(JSON.stringify({ alg: "none", typ: "MINDDY_TEST_ONLY" })).toString("base64url"),
  Buffer.from(JSON.stringify({ exp: 1, iat: 0, sub: "minddy-expired-access-fixture" })).toString("base64url"),
  "not-a-provider-signature",
].join(".");

export function expiredCodexAccessFixture(value: unknown): NativeCredentialProfile {
  const profile = validateNativeProfile(value, "codex");
  return validateNativeProfile({ ...profile, files: profile.files.map((file) => {
    const auth = JSON.parse(file.content);
    if (typeof auth.tokens.id_token !== "string" || !auth.tokens.id_token) throw new Error("Native identity token required for expiry fixture");
    return { ...file, content: JSON.stringify({ ...auth, tokens: { ...auth.tokens, access_token: EXPIRED_ACCESS_FIXTURE } }) };
  }) }, "codex");
}

/** Replace only the fenced sandbox import, before the unmodified native supervisor consumes it. */
export async function stageExpiredCodexAccessFixture(importPath: string) {
  const handle = await open(importPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let profile: NativeCredentialProfile;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > PROFILE_LIMIT) throw new Error("Invalid private expiry fixture import");
    profile = validateNativeProfile(JSON.parse(await handle.readFile("utf8")), "codex");
  } finally { await handle.close(); }
  const original = JSON.parse(profile.files[0].content);
  const fixture = expiredCodexAccessFixture(profile);
  const staged = JSON.parse(fixture.files[0].content);
  const temp = `${importPath}.${randomUUID()}.expiry-fixture`;
  try {
    const output = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await output.writeFile(JSON.stringify(fixture)); await output.sync(); } finally { await output.close(); }
    await rename(temp, importPath);
  } finally { await rm(temp, { force: true }); }
  return {
    simulationKind: "synthetic_expired_access" as const,
    simulatedAccessExpired: JSON.parse(Buffer.from(staged.tokens.access_token.split(".")[1], "base64url").toString()).exp === 1,
    refreshTokenPreserved: original.tokens.refresh_token === staged.tokens.refresh_token,
    idTokenPreserved: original.tokens.id_token === staged.tokens.id_token,
    accountIdPreserved: original.tokens.account_id === staged.tokens.account_id,
    providerSignedClaimsModified: false,
    hostClockChanged: false,
  };
}
