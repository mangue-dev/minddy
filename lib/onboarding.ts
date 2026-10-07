// Account onboarding combines real project/issue signals with optional acknowledgments.
// Metadata remains compatible with the previous home onboarding; no migration is needed.

export const ONBOARDING_STEPS = ["project", "tickets", "numo", "mcp", "cycles"] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEPS_META_KEY = "onboarding_steps";
export const ONBOARDING_DISMISSED_META_KEY = "onboarding_dismissed";
export const ONBOARDING_CURRENT_VERSION = 2;
export const ONBOARDING_VERSION_META_KEY = "onboarding_version";
export const ONBOARDING_STARTED_META_KEY = "onboarding_started";

export interface OnboardingSignals {
  projectCount: number;
  issueCount: number;
  /** Accepted for callers resolving historical account signals. Numo needs no BYOK key. */
  hasAiKey?: boolean;
  cyclesEnabled: boolean;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  completed: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  currentStepId: OnboardingStepId | null;
  currentStepNumber: number;
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
  dismissed: boolean;
  eligible: boolean;
  needsStartStamp: boolean;
  visible: boolean;
}

function readRawAcknowledged(meta: Record<string, unknown> | null | undefined): Set<string> {
  const raw = meta?.[ONBOARDING_STEPS_META_KEY];
  return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);
}

/** Translate retired steps before writing progress, so older accounts keep their place. */
export function readAcknowledgedSteps(
  meta: Record<string, unknown> | null | undefined,
): Set<OnboardingStepId> {
  const raw = readRawAcknowledged(meta);
  if (raw.has("key")) raw.add("numo");
  if (raw.has("issue") || raw.has("import") || (raw.has("mcp") && meta?.[ONBOARDING_VERSION_META_KEY] !== ONBOARDING_CURRENT_VERSION)) raw.add("tickets");
  return new Set(ONBOARDING_STEPS.filter((id) => raw.has(id)));
}

export function withAcknowledgedStep(
  meta: Record<string, unknown> | null | undefined,
  step: OnboardingStepId,
): OnboardingStepId[] {
  const acknowledged = readAcknowledgedSteps(meta);
  acknowledged.add(step);
  return ONBOARDING_STEPS.filter((id) => acknowledged.has(id));
}

export function resolveOnboardingState({
  meta, projectCount, issueCount, cyclesEnabled,
}: OnboardingSignals & { meta: Record<string, unknown> | null | undefined }): OnboardingState {
  const acknowledged = readAcknowledgedSteps(meta);
  const completed: Record<OnboardingStepId, boolean> = {
    project: acknowledged.has("project") || projectCount > 0,
    tickets: acknowledged.has("tickets") || issueCount > 0,
    numo: acknowledged.has("numo"),
    mcp: acknowledged.has("mcp"),
    cycles: acknowledged.has("cycles") || cyclesEnabled,
  };
  // Accounts that finished the old four- or five-step journey stay finished.
  const legacySteps: OnboardingStepId[] = ["project", "tickets", "mcp", "cycles"];
  if (meta?.[ONBOARDING_VERSION_META_KEY] !== ONBOARDING_CURRENT_VERSION && legacySteps.every((id) => completed[id])) {
    completed.numo = true;
  }

  const steps = ONBOARDING_STEPS.map((id) => ({ id, completed: completed[id] }));
  const currentIndex = steps.findIndex((step) => !step.completed);
  const completedCount = steps.filter((step) => step.completed).length;
  const allComplete = currentIndex === -1;
  const dismissed = meta?.[ONBOARDING_DISMISSED_META_KEY] === true;
  const started = meta?.[ONBOARDING_STARTED_META_KEY] === true;
  const eligible = started || (projectCount === 0 && issueCount === 0);
  const visible = eligible && !dismissed && !allComplete;

  return {
    steps,
    currentStepId: allComplete ? null : steps[currentIndex].id,
    currentStepNumber: allComplete ? steps.length : currentIndex + 1,
    completedCount, totalCount: steps.length, allComplete, dismissed, eligible,
    needsStartStamp: visible && !started,
    visible,
  };
}
