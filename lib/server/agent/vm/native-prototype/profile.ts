import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export type NativeEngine = "codex" | "claude_code";
export type NativeProfile = { version: 1; engine: NativeEngine; files: { path: string; content: string }[] };
export const PROFILE_LIMIT = 64 * 1024;
const paths = { codex: ["auth.json"], claude_code: [".credentials.json", ".claude.json"] } as const;

export function parseEngine(value: unknown): NativeEngine {
  if (value !== "codex" && value !== "claude_code") throw new Error("Invalid engine");
  return value;
}

export function validateProfile(value: unknown): NativeProfile {
  if (!value || typeof value !== "object") throw new Error("Invalid profile");
  const profile = value as NativeProfile;
  const engine = parseEngine(profile.engine);
  if (profile.version !== 1 || !Array.isArray(profile.files) || profile.files.length < 1 || profile.files.length > paths[engine].length || Object.keys(profile).some((key) => !["version", "engine", "files"].includes(key))) throw new Error("Invalid profile");
  let size = 0;
  const seen = new Set<string>();
  for (const file of profile.files) {
    if (!file || !(paths[engine] as readonly string[]).includes(file.path) || seen.has(file.path) || typeof file.content !== "string" || Object.keys(file).some((key) => !["path", "content"].includes(key))) throw new Error("Invalid profile file");
    seen.add(file.path);
    size += Buffer.byteLength(file.content);
    if (size > PROFILE_LIMIT) throw new Error("Profile is too large");
    const data = JSON.parse(file.content);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid native authentication");
    const nativeTokens = engine === "codex" ? [data.tokens?.refresh_token, data.tokens?.access_token] : [data.claudeAiOauth?.accessToken, data.claudeAiOauth?.refreshToken];
    if (file.path !== ".claude.json" && (nativeTokens.some((token) => typeof token !== "string" || !token) || (engine === "codex" && data.OPENAI_API_KEY != null))) throw new Error("Native subscription authentication required");
  }
  if (!seen.has(engine === "codex" ? "auth.json" : ".credentials.json")) throw new Error("Native authentication file is required");
  if (Buffer.byteLength(JSON.stringify(profile)) > PROFILE_LIMIT) throw new Error("Profile is too large");
  return { version: 1, engine, files: profile.files.map(({ path, content }) => ({ path, content })) };
}

export async function prepareProfileRoot(root: string) {
  if (!root.startsWith("/") || resolve(root) !== root || root === "/") throw new Error("Dedicated absolute profile root required");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Invalid private profile directory");
  await chmod(root, 0o700);
  for (const engine of ["codex", "claude_code"] as const) {
    await mkdir(join(root, engine), { mode: 0o700, recursive: true });
    const stat = await lstat(join(root, engine));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid native profile directory");
    await chmod(join(root, engine), 0o700);
  }
}

export async function importProfile(root: string, value: unknown) {
  const profile = validateProfile(value);
  await prepareProfileRoot(root);
  for (const file of profile.files) {
    const target = join(root, profile.engine, file.path);
    const temp = `${target}.import`;
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(file.content); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, target);
  }
}

export async function exportProfile(root: string, engine: NativeEngine): Promise<NativeProfile> {
  const files: NativeProfile["files"] = [];
  for (const path of paths[engine]) {
    let handle;
    try { handle = await open(join(root, engine, path), constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) { if (path === ".claude.json" && (error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > PROFILE_LIMIT) throw new Error("Invalid profile file");
      files.push({ path, content: await handle.readFile("utf8") });
    } finally { await handle.close(); }
  }
  return validateProfile({ version: 1, engine, files });
}

export async function eraseProfiles(root: string) { await rm(root, { recursive: true, force: true }); }
