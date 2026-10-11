import { randomUUID } from "node:crypto";
import { validateNativeProfile, PROFILE_LIMIT } from "../../../../native-agent-profile";
export { PROFILE_LIMIT } from "../../../../native-agent-profile";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export type NativeEngine = "codex" | "claude_code";
export type NativeProfile = { version: 1; engine: NativeEngine; files: { path: string; content: string }[] };
const paths = { codex: ["auth.json"], claude_code: [".credentials.json", ".claude.json"] } as const;

export function parseEngine(value: unknown): NativeEngine {
  if (value !== "codex" && value !== "claude_code") throw new Error("Invalid engine");
  return value;
}

export function validateProfile(value: unknown): NativeProfile {
  const engine = parseEngine((value as NativeProfile | null)?.engine);
  return validateNativeProfile(value, engine);
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
    const temp = `${target}.${randomUUID()}.import`;
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      try { await handle.writeFile(file.content); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, target);
      const directory = await open(join(root, profile.engine), constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
    } finally { await rm(temp, { force: true }); }
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
