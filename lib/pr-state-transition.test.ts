import { describe, expect, it } from "vitest";
import { prStateTransitionActions } from "./pr-state-transition";

describe("pull request state transitions", () => {
  it.each([
    ["open", "draft", false, ["convert_to_draft"]],
    ["draft", "open", true, ["ready_for_review"]],
    ["open", "closed", false, ["close"]],
    ["draft", "closed", true, ["close"]],
    ["closed", "open", false, ["reopen"]],
    ["closed", "open", true, ["reopen", "ready_for_review"]],
    ["closed", "draft", false, ["reopen", "convert_to_draft"]],
    ["closed", "draft", true, ["reopen"]],
    ["open", "open", false, []],
  ] as const)("changes %s to %s while preserving or normalizing draft=%s", (current, target, draft, actions) => {
    expect(prStateTransitionActions(current, target, draft)).toEqual(actions);
  });
});
