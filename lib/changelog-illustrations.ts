import type { ChangelogIllustration, ChangelogIllustrationName } from "./changelog-types";

export const CHANGELOG_ASPECT_RATIOS: Record<ChangelogIllustrationName, number> = {
  shield: 1.15, board: 1.35, assistant: 1.15, pages: 1.3, connections: 1.4,
  activity: 1.3, desktop: 1.4, "smart-fill": 1.5, "smart-assign": 1.2,
  microphone: 1.3, relations: 1.4, "pull-request": 1.3, tabs: 1.5,
  triage: 1.35, providers: 1.4, performance: 1.35, merge: 1.3, deadline: 1.25,
};

/** Presentation-only upgrades also cover immutable releases served by the remote catalog. */
const HISTORICAL_ART: Record<string, ChangelogIllustration> = {
  "encrypted-workspace-content": { kind: "icon", name: "shield" },
  "mcp-catalog": { kind: "code", name: "connections" },
  performance: { kind: "icon", name: "performance" },
  "family-boards": { kind: "code", name: "board" },
  "smart-triage": { kind: "code", name: "triage" },
  "smart-fill-everywhere": { kind: "icon", name: "smart-fill" },
  "byok-providers": { kind: "code", name: "providers" },
  "voice-dictation": { kind: "icon", name: "microphone" },
  "objective-relations": { kind: "code", name: "relations" },
  "pr-page": { kind: "code", name: "pull-request" },
  "app-tabs": { kind: "code", name: "tabs" },
  "unified-numo": { kind: "icon", name: "assistant" },
  "merge-readiness": { kind: "code", name: "merge" },
  "steadier-workspace-0111": { kind: "code", name: "board" },
  "clearer-code-reviews-0111": { kind: "code", name: "pull-request" },
  "numo-delivery-follow-up-0111": { kind: "icon", name: "assistant" },
  "ai-budget-overview-0111": { kind: "code", name: "activity" },
  "relations-at-creation-0111": { kind: "code", name: "relations" },
  "objective-deadline-progress-0111": { kind: "code", name: "deadline" },
  "creation-and-csv-previews-0111": { kind: "code", name: "pages" },
  "workspace-navigation-0111": { kind: "code", name: "tabs" },
};

export function resolveChangelogIllustration(id: string, illustration: ChangelogIllustration): ChangelogIllustration {
  // Explicit images/icons remain the release author's choice.
  return illustration.kind === "code" && Object.hasOwn(HISTORICAL_ART, id)
    ? HISTORICAL_ART[id] : illustration;
}
