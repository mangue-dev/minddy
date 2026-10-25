import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, safeStorage } from "electron";

import {
  LOCAL_ACCOUNT_EMAIL,
  localDisplayName,
  localSupabaseKeys,
  ownerIdFromUserList,
  parseEnvFile,
  sessionFromTokenResponse,
  type LocalAccountSession,
  type LocalSupabaseKeys,
} from "@/lib/desktop/local-account";

const ACCOUNT_FILE = "local-account.json";

interface StoredAccount {
  email: string;
  /** The password, encrypted with the system keychain (`safeStorage`). */
  password: string;
  root: string;
}

function accountFile(): string {
  return path.join(app.getPath("userData"), ACCOUNT_FILE);
}

function readKeys(root: string): LocalSupabaseKeys | null {
  try {
    return localSupabaseKeys(parseEnvFile(readFileSync(path.join(root, ".env.local"), "utf8")));
  } catch {
    return null;
  }
}

function readStored(): StoredAccount | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(accountFile(), "utf8"));
    const value = raw as Partial<StoredAccount>;
    return typeof value.email === "string" && typeof value.password === "string" && typeof value.root === "string"
      ? (value as StoredAccount)
      : null;
  } catch {
    return null;
  }
}

/** The display name of the person signed in to this computer. */
function computerDisplayName(): string {
  const { username } = os.userInfo();
  let fullName: string | undefined;
  if (process.platform === "darwin") {
    try {
      // `id -F` prints the macOS account's full name.
      fullName = execFileSync("id", ["-F"], { encoding: "utf8", timeout: 3_000 });
    } catch {
      fullName = undefined;
    }
  }
  return localDisplayName(fullName, username);
}

async function admin(keys: LocalSupabaseKeys, pathname: string, init: RequestInit): Promise<Response> {
  return fetch(`${keys.url}/auth/v1${pathname}`, {
    ...init,
    headers: {
      apikey: keys.serviceRoleKey,
      Authorization: `Bearer ${keys.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Creates the owner of a freshly installed local instance, or gives it a new
 * password when its data survived a reinstall, then keeps the password in the
 * keychain. Throws when the local Supabase cannot do it, so the installer
 * shows the step as failed rather than leaving a window that cannot sign in.
 */
export async function ensureLocalAccount(root: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("The system keychain is unavailable.");
  const keys = readKeys(root);
  if (!keys) throw new Error("The local Supabase keys are missing from .env.local.");
  const password = randomBytes(32).toString("base64url");
  const created = await admin(keys, "/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: LOCAL_ACCOUNT_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: computerDisplayName() },
    }),
  });
  if (!created.ok) {
    // Already there: the clone was reinstalled over data Supabase kept.
    const list = await admin(keys, "/admin/users?page=1&per_page=1000", { method: "GET" });
    const id = list.ok ? ownerIdFromUserList(await list.json()) : null;
    if (!id) throw new Error(`The local account could not be created (HTTP ${created.status}).`);
    const updated = await admin(keys, `/admin/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!updated.ok) throw new Error(`The local account could not be updated (HTTP ${updated.status}).`);
  }
  const stored: StoredAccount = {
    email: LOCAL_ACCOUNT_EMAIL,
    password: safeStorage.encryptString(password).toString("base64"),
    root,
  };
  writeFileSync(accountFile(), `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

/**
 * Signs the managed account in against the local Supabase and returns the
 * session for the page, or null when this instance has no managed account
 * (an existing installation the person chose) or it cannot sign in.
 */
export async function localAccountSession(root: string | null): Promise<LocalAccountSession | null> {
  const stored = readStored();
  if (!root || !stored || path.resolve(stored.root) !== path.resolve(root)) return null;
  const keys = readKeys(root);
  if (!keys || !safeStorage.isEncryptionAvailable()) return null;
  let password: string;
  try {
    password = safeStorage.decryptString(Buffer.from(stored.password, "base64"));
  } catch {
    return null;
  }
  try {
    const response = await fetch(`${keys.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: keys.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: stored.email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? sessionFromTokenResponse(await response.json()) : null;
  } catch {
    return null;
  }
}
