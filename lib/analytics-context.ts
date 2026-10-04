import { getAnalyticsClient, onAnalyticsReady } from "./analytics";
import { readConsent } from "./cookie-consent";

// Keep only current account/context state, never an event history. Anonymous
// measurement must not acquire account identifiers or person/group properties.
const context = new Map<string, () => void>();

export function setAnalyticsContext(key: string, apply: () => void): void {
  context.set(key, apply);
  onAnalyticsReady(() => {
    if (readConsent() === "accepted" && context.get(key) === apply) apply();
  });
}

export function replayAnalyticsContext(): void {
  if (readConsent() !== "accepted") return;
  context.get("identity")?.();
  for (const [key, apply] of context) {
    if (key !== "identity") apply();
  }
}

export function resetAnalyticsContext(groupsOnly = false): void {
  for (const key of context.keys()) {
    if (!groupsOnly || key.startsWith("group:")) context.delete(key);
  }
  onAnalyticsReady(() => {
    if (readConsent() !== "accepted") return;
    const client = getAnalyticsClient();
    if (groupsOnly) client?.resetGroups();
    else client?.reset();
  });
}
