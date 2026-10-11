import type { NativeCredentialProfile, NativeHarness } from "./native-agent-prototype";

export const PROFILE_LIMIT = 64 * 1024;
const paths = { codex: ["auth.json"], claude_code: [".credentials.json", ".claude.json"] } as const;

export function validateNativeProfile(value: unknown, expectedEngine: NativeHarness): NativeCredentialProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid profile");
  const profile = value as NativeCredentialProfile;
  const engine = profile.engine;
  if ((engine !== "codex" && engine !== "claude_code") || engine !== expectedEngine) throw new Error("Invalid profile engine");
  if (profile.version !== 1 || !Array.isArray(profile.files) || profile.files.length < 1 || profile.files.length > paths[engine].length || Object.keys(profile).some((key) => !["version", "engine", "files"].includes(key))) throw new Error("Invalid profile");
  let size = 0;
  const seen = new Set<string>();
  for (const file of profile.files) {
    if (!file || typeof file !== "object" || Array.isArray(file) || !(paths[engine] as readonly string[]).includes(file.path) || seen.has(file.path) || typeof file.content !== "string" || Object.keys(file).some((key) => !["path", "content"].includes(key))) throw new Error("Invalid profile file");
    seen.add(file.path);
    size += Buffer.byteLength(file.content);
    if (size > PROFILE_LIMIT) throw new Error("Profile is too large");
    let data;
    try { data = JSON.parse(file.content); } catch { throw new Error("Invalid native authentication"); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid native authentication");
    const nativeTokens = engine === "codex" ? [data.tokens?.refresh_token, data.tokens?.access_token] : [data.claudeAiOauth?.accessToken, data.claudeAiOauth?.refreshToken];
    if (file.path !== ".claude.json" && (nativeTokens.some((token) => typeof token !== "string" || !token) || (engine === "codex" && data.OPENAI_API_KEY != null))) throw new Error("Native subscription authentication required");
  }
  if (!seen.has(engine === "codex" ? "auth.json" : ".credentials.json")) throw new Error("Native authentication file is required");
  if (Buffer.byteLength(JSON.stringify(profile)) > PROFILE_LIMIT) throw new Error("Profile is too large");
  return { version: 1, engine, files: profile.files.map(({ path, content }) => ({ path, content })) };
}


/** Reject account replacement during renewal; native CLIs remain responsible for token validation. */
export function assertNativeProfileContinuity(before: NativeCredentialProfile, after: NativeCredentialProfile) {
  if (before.engine !== after.engine) throw new Error("Native subscription account changed");
  const identity = (profile: NativeCredentialProfile): unknown => {
    const path = profile.engine === "codex" ? "auth.json" : ".claude.json";
    const file = profile.files.find((item) => item.path === path);
    if (!file) return undefined;
    const data = JSON.parse(file.content);
    return profile.engine === "codex" ? data.tokens?.account_id : data.oauthAccount?.accountUuid;
  };
  const original = identity(before);
  if (original !== undefined && original !== null && (typeof original !== "string" || !original || identity(after) !== original)) {
    throw new Error("Native subscription account changed");
  }
}
