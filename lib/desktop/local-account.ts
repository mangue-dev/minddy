/**
 * The account of a minddy the desktop app installed on this computer (MIN-781).
 *
 * A local instance has one person in front of it, so asking that person to
 * create an account and sign in is ceremony. The installer creates the account
 * itself in the local Supabase (service key, already in the clone's
 * `.env.local`), keeps a generated password in the system keychain
 * (`safeStorage`), and signs in on its own whenever the window shows that
 * instance. The account is a real one: settings, ownership and
 * administration work as on any instance.
 *
 * Only an instance the app installed gets this. A folder chosen as an
 * existing installation keeps its own accounts, and a remote server always
 * signs in normally.
 *
 * Everything here is pure; `desktop/src/local-account.ts` runs it.
 */

/** Where the app serves the local instance it manages (`pnpm self-host:local`). */
export const LOCAL_INSTANCE_ORIGIN = "http://localhost:6463";

/** One owner per local instance; a reinstall over kept data finds it again. */
export const LOCAL_ACCOUNT_EMAIL = "owner@local.minddy.app";

/** What the window's page receives: a session, never the password. */
export interface LocalAccountSession {
  access_token: string;
  refresh_token: string;
}

/** Reads `KEY=value` lines of an env file; quotes are stripped, comments ignored. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export interface LocalSupabaseKeys {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/** The local Supabase the launcher prepared, or null when `.env.local` lacks it. */
export function localSupabaseKeys(env: Record<string, string>): LocalSupabaseKeys | null {
  const url = env.MINDDY_PUBLIC_SUPABASE_URL;
  const anonKey = env.MINDDY_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  try {
    const { hostname, protocol } = new URL(url);
    // The managed account lives on THIS computer; never send its password away.
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) || !/^https?:$/.test(protocol)) return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ""), anonKey, serviceRoleKey };
}

/** The name the account starts with: the computer's account name, tidied. */
export function localDisplayName(fullName: string | undefined, username: string): string {
  const name = (fullName ?? "").trim() || username.trim();
  return name.slice(0, 80) || "minddy";
}

/**
 * Only the window's top document on the instance the app manages may ask for
 * its session: the page of a remote server, or any other origin, gets nothing.
 */
export function mayReceiveLocalSession(senderUrl: string, localOrigin: string, selectedOrigin: string | null): boolean {
  if (selectedOrigin !== localOrigin) return false;
  try {
    return new URL(senderUrl).origin === new URL(localOrigin).origin;
  } catch {
    return false;
  }
}

/** The GoTrue answer of a password grant, reduced to what the page needs. */
export function sessionFromTokenResponse(body: unknown): LocalAccountSession | null {
  if (typeof body !== "object" || body === null) return null;
  const { access_token, refresh_token } = body as Record<string, unknown>;
  return typeof access_token === "string" && typeof refresh_token === "string"
    ? { access_token, refresh_token }
    : null;
}

/** The id of the owner in a GoTrue admin user list, when it already exists. */
export function ownerIdFromUserList(body: unknown, email = LOCAL_ACCOUNT_EMAIL): string | null {
  const users = (body as { users?: unknown })?.users;
  if (!Array.isArray(users)) return null;
  const owner = users.find(
    (user) => typeof user === "object" && user !== null && (user as { email?: unknown }).email === email,
  ) as { id?: unknown } | undefined;
  return typeof owner?.id === "string" ? owner.id : null;
}
