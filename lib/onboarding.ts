// minddy — MIN-74 : onboarding du nouveau compte.
//
// Five steps, completed on `/home`: create or join your first project,
// enter your first tickets (by hand or by CSV import, MIN-98),
// connect an agent to the MCP server, set its API key (MIN-149), activate the
// cycles. Three of them are checked ONLY from real data (the
// project exists, a ticket exists, a key is registered); the others are
// explicitly acknowledged by the user — import their backlog, connect
// an agent and bringing your key are propositions, not obligations.
//
// NOTHING IS BLOCKED. This is the lesson of AutoKap, whose onboarding required
// GitHub connection from step 1: a single onboarding completed in 120 days.
// Here each step can be taken and the entire onboarding takes place.
//
// The state lives in `user_metadata` (Supabase auth), like the preferences of
// cycles: no table, no migration. Server-safe (no React import) —
// the resolver can be shared with a route handler if the need arises.

export const ONBOARDING_STEPS = ["project", "tickets", "mcp", "key", "cycles"] as const;

/** The four stages before MIN-149, in their then order. They are used to
 * recognize an account which had ALREADY finished its onboarding when `key` was added to it
 * — cf. `isCompleted` below. */
const PRE_KEY_STEPS = ONBOARDING_STEPS.filter((id) => id !== "key");

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

/** Step ids disappeared, still present in the metadata of accounts that
 * started onboarding before the “first ticket” + “import”
 * merge into a single step `tickets`. They are no longer steps — only traces to be reread so as not to reopen an already advanced onboarding. */
const LEGACY_ACK_IDS = ["issue", "import"] as const;

/** Steps acknowledged by hand (ID table) — the others are deduced. */
export const ONBOARDING_STEPS_META_KEY = "onboarding_steps";
/** “Skip onboarding”: it no longer reappears, even incomplete. */
export const ONBOARDING_DISMISSED_META_KEY = "onboarding_dismissed";
/** Asked the first time the onboarding is displayed — see `eligible`. */
export const ONBOARDING_STARTED_META_KEY = "onboarding_started";

/** Actual signals read in the app — what the user actually did. */
export interface OnboardingSignals {
  projectCount: number;
  issueCount: number;
  /** A BYOK key is registered on the account (`user_ai_keys`). */
  hasAiKey: boolean;
  cyclesEnabled: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  completed: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  /** First step not taken, or null if everything is done. */
  currentStepId: OnboardingStepId | null;
  /** Rank 1 - based on current step, for "Step 2 of 5". */
  currentStepNumber: number;
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  dismissed: boolean;
  /** The account was new when onboarding first saw it. */
  eligible: boolean;
  /** New eligible account whose entry is not yet engraved: the caller
 * must set `onboarding_started` (otherwise creating project + ticket would make the
 * account “installed” and remove it from onboarding along the way). */
  needsStartStamp: boolean;
  /** Only thing the home needs to know to display the map. */
  visible: boolean;
}

function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return (ONBOARDING_STEPS as readonly unknown[]).includes(value);
}

/** The raw table, including unknown ids: this is where the missing
 * steps live (`LEGACY_ACK_IDS`), which must be reread to resume the accounts
 * started before the merge. Nothing else should use it. */
function readRawAcknowledged(
  meta: Record<string, unknown> | null | undefined
): Set<string> {
  const raw = meta?.[ONBOARDING_STEPS_META_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is string => typeof v === "string"));
}

/** Steps acknowledged, read defensively: the auth metadata is free JSON
 *, an absent table / incorrectly typed / carrying unknown ids must not
 * bring down the home. */
export function readAcknowledgedSteps(
  meta: Record<string, unknown> | null | undefined
): Set<OnboardingStepId> {
  const raw = meta?.[ONBOARDING_STEPS_META_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter(isOnboardingStepId));
}

/** Adds a step to the acknowledged list, in canonical order and without
 * duplicate — the patch to write to `user_metadata`. */
export function withAcknowledgedStep(
  meta: Record<string, unknown> | null | undefined,
  step: OnboardingStepId
): OnboardingStepId[] {
  const acknowledged = readAcknowledgedSteps(meta);
  acknowledged.add(step);
  return ONBOARDING_STEPS.filter((id) => acknowledged.has(id));
}

/**
 * Merges persisted acknowledgments with actual signals.
 *
 * ELIGIBILITY. Onboarding is aimed at NEW accounts: it takes the place of the
 * body of the home, which only makes sense when there is nothing to show there. An account already installed (projects, tickets) must not have its home confiscated for a “connect an agent” step that it never requested. The account is eligible if it is empty at first glance — and the
 * then remains thanks to `onboarding_started`, otherwise creating your project and its
 * ticket would switch it to "installed" and take it out of onboarding
 * just after checking its first two steps.
 */
export function resolveOnboardingState({
  meta,
  projectCount,
  issueCount,
  hasAiKey,
  cyclesEnabled,
}: OnboardingSignals & {
  meta: Record<string, unknown> | null | undefined;
}): OnboardingState {
  const acknowledged = readAcknowledgedSteps(meta);
  const raw = readRawAcknowledged(meta);

  const isCompleted = (id: OnboardingStepId): boolean => {
    if (acknowledged.has(id)) return true;
    // `key` arrived AFTER the other four (MIN-149). An account that had
    // already crossed these had finished his onboarding: return him his home
    // confiscated for a step added after the fact would be exactly the
    // reconfiscation against which `onboarding_started` exists. The test is
    // done on the four steps then, not on `allComplete` — which counts
    // `key` and would go around in circles.
    //
    // During onboarding itself, this branch cannot bite: the
    // cycles are opt-in (`resolveCyclePrefs`), so the last step is not
    // never crossed before we arrive at `key`.
    if (id === "key") {
      return hasAiKey || PRE_KEY_STEPS.every((step) => isCompleted(step));
    }
    switch (id) {
      case "project":
        return projectCount > 0;
      // A ticket exists: created by hand or imported, the distinction is not visible
      // not in the data and should not be seen here. Without a ticket, the stage
      // pass explicitly (“Skip this step” → acknowledgment).
      //
      // RESUMPTION OF STARTED ACCOUNTS. The two steps merged here were
      // `issue` (auto) and `import` (acknowledged). An account that carried one of
      // these brands were already FURTHER than the new `tickets` stage: the
      // reread avoids sending it back. Same for `mcp`, which followed
      // both — therefore involved them.
      case "tickets":
        return (
          issueCount > 0 ||
          acknowledged.has("mcp") ||
          LEGACY_ACK_IDS.some((legacy) => raw.has(legacy))
        );
      // Connecting an agent does not leave a usable trace on the client side: this
      // step is informative and validates on “Continue” (acknowledgment).
      case "mcp":
        return false;
      case "cycles":
        return cyclesEnabled;
    }
  };

  const steps = ONBOARDING_STEPS.map((id) => ({ id, completed: isCompleted(id) }));
  const currentIndex = steps.findIndex((s) => !s.completed);
  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = currentIndex === -1;
  const dismissed = meta?.[ONBOARDING_DISMISSED_META_KEY] === true;

  const started = meta?.[ONBOARDING_STARTED_META_KEY] === true;
  const blankAccount = projectCount === 0 && issueCount === 0;
  const eligible = started || blankAccount;
  const visible = eligible && !dismissed && !allComplete;

  return {
    steps,
    currentStepId: allComplete ? null : steps[currentIndex].id,
    currentStepNumber: allComplete ? steps.length : currentIndex + 1,
    completedCount,
    totalCount: steps.length,
    allComplete,
    dismissed,
    eligible,
    needsStartStamp: visible && !started,
    visible,
  };
}
