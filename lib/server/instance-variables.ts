import "server-only";

import { getDeploymentEdition } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase-service";
import { clearAppConfigValue, getAppConfigValues, setAppConfigValue } from "@/lib/server/app-config";
import { hasAdminRole } from "@/lib/server/admin";
import { displayName } from "@/lib/display-name";
import {
  CONFIG_OVERRIDES_SWITCH,
  INSTANCE_VARIABLES,
  adminListIncludes,
  checkInstanceVariable,
  getInstanceVariable,
  isOverridableKey,
  secretHint,
  type InstanceVariable,
} from "@/lib/instance-variables";

/**
 * Instance variables overridden from the admin dashboard (MIN-847).
 *
 * The override WINS over the environment file: it is how a self-hosted
 * administrator configures the instance without touching the host. Each
 * value is an `app_config` row (`instance_variable:<KEY>`), so it is encrypted
 * at rest by the system-scope codec whenever content encryption is on, and
 * only `service_role` can read it (RLS on, no policy). Its last versions are
 * kept next to it (`instance_variable_history:<KEY>`) for the audit trail and
 * the rollback.
 *
 * The layer exists only on a self-hosted edition whose environment file sets
 * `MINDDY_CONFIG_OVERRIDES=1`. That switch, like every key absent from the
 * allowlist of `lib/instance-variables.ts`, is never read from the database.
 *
 * How it applies: `instrumentation.ts` snapshots the file values, then merges
 * the overrides into `process.env` and refreshes them every minute. The app
 * reads its variables when it needs them, so a change reaches every server
 * process within a minute — at once in the one that wrote it.
 */

const VALUE_PREFIX = "instance_variable:";
const HISTORY_PREFIX = "instance_variable_history:";
const HISTORY_LIMIT = 10;
const REFRESH_MS = 60_000;

/**
 * Process-wide state. Next.js may load this module more than once (the
 * instrumentation hook and the route bundles), but they share `process.env`:
 * the snapshot of the FILE values must therefore be taken once, before any
 * override is applied, and shared through `globalThis`.
 */
interface ProcessState {
  fileValues: Map<string, string>;
  timer?: ReturnType<typeof setInterval>;
}
const STATE_KEY = Symbol.for("minddy.instanceVariables");

function processState(): ProcessState {
  const holder = globalThis as unknown as Record<symbol, ProcessState | undefined>;
  let state = holder[STATE_KEY];
  if (!state) {
    state = { fileValues: new Map() };
    for (const variable of INSTANCE_VARIABLES) {
      const value = process.env[variable.key];
      if (value !== undefined && value !== "") state.fileValues.set(variable.key, value);
    }
    holder[STATE_KEY] = state;
  }
  return state;
}

export type InstanceOverridesStatus = "enabled" | "disabled" | "cloud";

/** Whether this instance lets the admin dashboard override its variables. */
export function instanceOverridesStatus(): InstanceOverridesStatus {
  if (getDeploymentEdition() === "cloud") return "cloud";
  return process.env[CONFIG_OVERRIDES_SWITCH]?.trim() === "1" ? "enabled" : "disabled";
}

const valueKey = (key: string) => `${VALUE_PREFIX}${key}`;
const historyKey = (key: string) => `${HISTORY_PREFIX}${key}`;

/** The stored overrides, by variable key. Only allowlisted keys are ever read. */
async function readOverrides(): Promise<Map<string, string>> {
  const keys = INSTANCE_VARIABLES.map((variable) => variable.key).filter(isOverridableKey);
  const values = await getAppConfigValues(keys.map(valueKey));
  const overrides = new Map<string, string>();
  for (const key of keys) {
    const value = values[valueKey(key)];
    if (typeof value === "string" && value !== "") overrides.set(key, value);
  }
  return overrides;
}

function apply(overrides: Map<string, string>): void {
  const { fileValues } = processState();
  for (const variable of INSTANCE_VARIABLES) {
    const value = overrides.get(variable.key) ?? fileValues.get(variable.key);
    if (value === undefined) delete process.env[variable.key];
    else process.env[variable.key] = value;
  }
}

/**
 * Merges the overrides into `process.env`. A failed read keeps the values in
 * place and never throws: an unreachable database must not stop the app from
 * starting on its file values.
 */
export async function hydrateInstanceVariables(): Promise<void> {
  processState();
  if (instanceOverridesStatus() !== "enabled") {
    apply(new Map());
    return;
  }
  try {
    apply(await readOverrides());
  } catch (error) {
    console.error("[instance-variables] overrides unreadable, keeping current values:", (error as Error).message);
  }
}

/** Called once by `instrumentation.ts`: hydrate now, then every minute. */
export async function startInstanceVariables(): Promise<void> {
  await hydrateInstanceVariables();
  const state = processState();
  if (state.timer || instanceOverridesStatus() !== "enabled") return;
  state.timer = setInterval(() => void hydrateInstanceVariables(), REFRESH_MS);
  state.timer.unref?.();
}

// ── reading for the admin screen ──────────────────────────────────────────

export interface InstanceVariableHistoryEntry {
  action: "set" | "clear" | "rollback";
  actorId: string | null;
  at: string;
  /** The value after the action; `null` when the override was removed. */
  value: string | null;
}

async function readHistory(key: string): Promise<InstanceVariableHistoryEntry[]> {
  const raw = (await getAppConfigValues([historyKey(key)]))[historyKey(key)];
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InstanceVariableHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export interface InstanceVariableView {
  key: string;
  theme: InstanceVariable["theme"];
  kind: InstanceVariable["kind"];
  applies: InstanceVariable["applies"];
  choices?: readonly string[];
  multiline?: boolean;
  sensitive?: boolean;
  source: "database" | "file" | "both" | "unset";
  /** Non-secret values in full; secrets as their last characters only. */
  value: string | null;
  fileValue: string | null;
  history: Array<{ index: number; action: InstanceVariableHistoryEntry["action"]; actorName: string | null; at: string; value: string | null }>;
}

const shown = (variable: InstanceVariable, value: string | undefined | null) =>
  value ? (variable.kind === "secret" ? secretHint(value) : value) : null;

/** Display names of the administrators in the history; unknown accounts read as `null`. */
async function actorNames(ids: Set<string>): Promise<Map<string, string>> {
  const service = getServiceClient();
  const names = new Map<string, string>();
  await Promise.all([...ids].map(async (id) => {
    const user = (await service.auth.admin.getUserById(id)).data?.user;
    if (!user) return;
    const metadata = user.user_metadata ?? {};
    names.set(id, displayName({
      full_name: (metadata.display_name ?? metadata.full_name) as string | undefined,
      email: user.email,
    }, "—"));
  }));
  return names;
}

export async function listInstanceVariables(): Promise<InstanceVariableView[]> {
  const overrides = await readOverrides();
  const { fileValues } = processState();
  const histories = new Map(await Promise.all(
    INSTANCE_VARIABLES.map(async (variable) => [variable.key, await readHistory(variable.key)] as const),
  ));
  const names = await actorNames(new Set(
    [...histories.values()].flat().map((entry) => entry.actorId).filter((id): id is string => !!id),
  ));
  return Promise.all(
    INSTANCE_VARIABLES.filter((variable) => isOverridableKey(variable.key)).map(async (variable) => {
      const override = overrides.get(variable.key);
      const file = fileValues.get(variable.key);
      const history = histories.get(variable.key) ?? [];
      return {
        key: variable.key,
        theme: variable.theme,
        kind: variable.kind,
        applies: variable.applies,
        ...(variable.choices ? { choices: variable.choices } : {}),
        ...(variable.multiline ? { multiline: true } : {}),
        ...(variable.sensitive ? { sensitive: true } : {}),
        source: override && file ? "both" : override ? "database" : file ? "file" : "unset",
        value: shown(variable, override ?? file),
        fileValue: shown(variable, file),
        history: history.map((entry, index) => ({
          index,
          action: entry.action,
          actorName: entry.actorId ? names.get(entry.actorId) ?? null : null,
          at: entry.at,
          value: shown(variable, entry.value),
        })),
      } satisfies InstanceVariableView;
    }),
  );
}

// ── writing ───────────────────────────────────────────────────────────────

export interface InstanceVariableActor {
  id: string;
  email: string | null;
  appMetadata: unknown;
}

export type InstanceVariableWrite =
  | { ok: true; key: string; previousAdminEmails?: string | null; unchanged?: true }
  | { ok: false; status: number; reason: string };

/**
 * An administrator cannot take away their own access: a new `ADMIN_EMAILS`
 * must still name them, unless the admin role grants it anyway.
 */
function keepsActorAdmin(actor: InstanceVariableActor, nextAdminEmails: string | null): boolean {
  if (hasAdminRole({ app_metadata: actor.appMetadata as Record<string, unknown> })) return true;
  return adminListIncludes(nextAdminEmails, actor.email);
}

async function record(key: string, entry: InstanceVariableHistoryEntry): Promise<void> {
  const history = await readHistory(key);
  await setAppConfigValue(historyKey(key), JSON.stringify([entry, ...history].slice(0, HISTORY_LIMIT)));
}

async function store(key: string, value: string | null, action: InstanceVariableHistoryEntry["action"], actor: InstanceVariableActor): Promise<InstanceVariableWrite> {
  if (instanceOverridesStatus() !== "enabled") return { ok: false, status: 409, reason: "disabled" };
  if (!isOverridableKey(key)) return { ok: false, status: 400, reason: "not_overridable" };
  const { fileValues } = processState();
  const previous = (await readOverrides()).get(key) ?? null;

  // Saving the value already stored changes nothing: no history entry, no
  // notification — otherwise every repeated save would read as a change.
  if (value === previous) return { ok: true, key, unchanged: true };
  if (key === "ADMIN_EMAILS") {
    const next = value ?? fileValues.get(key) ?? null;
    if (!keepsActorAdmin(actor, next)) return { ok: false, status: 409, reason: "cannot_remove_self" };
  }
  if (value === null) await clearAppConfigValue(valueKey(key));
  else await setAppConfigValue(valueKey(key), value);
  await record(key, { action, actorId: actor.id, at: new Date().toISOString(), value });
  // This process applies at once; the others within a minute.
  await hydrateInstanceVariables();
  return {
    ok: true,
    key,
    ...(key === "ADMIN_EMAILS" ? { previousAdminEmails: previous ?? fileValues.get(key) ?? null } : {}),
  };
}

export async function setInstanceVariable(key: string, raw: unknown, actor: InstanceVariableActor): Promise<InstanceVariableWrite> {
  const check = checkInstanceVariable(key, raw);
  if (!check.ok) return { ok: false, status: 400, reason: check.reason };
  return store(key, check.value, "set", actor);
}

/** Removes the override: the file value, if any, applies again. */
export function clearInstanceVariable(key: string, actor: InstanceVariableActor): Promise<InstanceVariableWrite> {
  return store(key, null, "clear", actor);
}

/** Restores the value a history entry recorded. */
export async function rollbackInstanceVariable(key: string, index: unknown, actor: InstanceVariableActor): Promise<InstanceVariableWrite> {
  if (!getInstanceVariable(key)) return { ok: false, status: 400, reason: "not_overridable" };
  const history = await readHistory(key);
  const entry = typeof index === "number" && Number.isInteger(index) ? history[index] : undefined;
  if (!entry) return { ok: false, status: 404, reason: "no_such_version" };
  if (entry.value === null) return store(key, null, "rollback", actor);
  const check = checkInstanceVariable(key, entry.value);
  if (!check.ok) return { ok: false, status: 409, reason: check.reason };
  return store(key, check.value, "rollback", actor);
}

// ── who is told ───────────────────────────────────────────────────────────

/**
 * The administrators to tell about a change: the addresses of `ADMIN_EMAILS`
 * before and after it (a removed administrator learns it too), the accounts
 * that are administrators by role (`get_role_admin_accounts`), and the actor.
 * The caller decides which channel reaches the actor.
 */
export async function instanceAdminRecipients(actorId: string, previousAdminEmails?: string | null): Promise<Array<{ id: string; email: string | null }>> {
  const emails = new Set(
    [process.env.ADMIN_EMAILS ?? "", previousAdminEmails ?? ""]
      .join(",")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const service = getServiceClient();
  const recipients = new Map<string, { id: string; email: string | null }>();
  const actor = await service.auth.admin.getUserById(actorId);
  if (actor.data?.user) recipients.set(actorId, { id: actorId, email: actor.data.user.email ?? null });
  for (const email of emails) {
    const { data } = await service.rpc("get_admin_account", { p_email: email, p_user_id: null });
    const row = (data as Array<{ user_id: string; email: string | null; email_confirmed: boolean }> | null)?.[0];
    if (row?.email_confirmed) recipients.set(row.user_id, { id: row.user_id, email: row.email });
  }
  const { data: roleAdmins, error } = await service.rpc("get_role_admin_accounts");
  if (error) console.error("[instance-variables] role administrators unavailable:", error.message);
  for (const row of (roleAdmins as Array<{ user_id: string; email: string | null; email_confirmed: boolean }> | null) ?? []) {
    if (row.email_confirmed) recipients.set(row.user_id, { id: row.user_id, email: row.email });
  }
  return [...recipients.values()];
}
