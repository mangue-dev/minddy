/** Only public wizard choices belong in help context; hosts and credentials stay in the form. */
export const SELF_HOSTING_HELP_STEPS = [
  "overview", "desktop-app", "route", "encryption-choice", "migration-choice", "migration-export",
  "team-access", "team-backend", "capacity", "method", "agent", "local-tools", "local-install",
  "team-prepare", "team-release", "team-fetch", "team-installer", "team-email", "local-verify",
  "team-verify", "team-open", "migration-import", "done",
] as const;

export type SelfHostingHelpStep = typeof SELF_HOSTING_HELP_STEPS[number];
export interface SelfHostingHelpContext {
  stepId: SelfHostingHelpStep;
  path: "local" | "team" | null;
  method: "agent" | "manual" | null;
  serverAccess: "private" | "public";
  supabaseMode: "managed" | "full";
  migrate: boolean | null;
}

export const SELF_HOSTING_OVERVIEW: SelfHostingHelpContext = {
  stepId: "overview", path: null, method: null, serverAccess: "private", supabaseMode: "managed", migrate: null,
};

/** Reject invalid selections and discard fields outside the public help contract. */
export function parseSelfHostingHelpContext(raw: unknown): SelfHostingHelpContext | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!SELF_HOSTING_HELP_STEPS.includes(value.stepId as SelfHostingHelpStep)
    || ![null, "local", "team"].includes(value.path as string | null)
    || ![null, "agent", "manual"].includes(value.method as string | null)
    || !["private", "public"].includes(value.serverAccess as string)
    || !["managed", "full"].includes(value.supabaseMode as string)
    || ![null, true, false].includes(value.migrate as boolean | null)) return null;
  return { stepId: value.stepId as SelfHostingHelpStep, path: value.path as SelfHostingHelpContext["path"],
    method: value.method as SelfHostingHelpContext["method"], serverAccess: value.serverAccess as SelfHostingHelpContext["serverAccess"],
    supabaseMode: value.supabaseMode as SelfHostingHelpContext["supabaseMode"], migrate: value.migrate as boolean | null };
}
