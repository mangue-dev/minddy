import { describe, expect, it } from "vitest";
import {
  PROMPT_COPY_AUTO_START_META_KEY,
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
  shouldAutoStartTask,
} from "@/lib/prompt-copy-auto-start";

describe("resolvePromptCopyAutoStart", () => {
  it("is enabled by default, including without metadata", () => {
    expect(resolvePromptCopyAutoStart(undefined)).toBe(true);
    expect(resolvePromptCopyAutoStart(null)).toBe(true);
    expect(resolvePromptCopyAutoStart({})).toBe(true);
  });

  it("ne s'éteint que sur un `false` explicite", () => {
    expect(
      resolvePromptCopyAutoStart({ [PROMPT_COPY_AUTO_START_META_KEY]: false })
    ).toBe(false);
    expect(
      resolvePromptCopyAutoStart({ [PROMPT_COPY_AUTO_START_META_KEY]: true })
    ).toBe(true);
  });
});

describe("shouldAutoStartOnPromptCopy", () => {
  it("n'avance que les statuts d'avant-travail", () => {
    expect(shouldAutoStartOnPromptCopy("triage")).toBe(true);
    expect(shouldAutoStartOnPromptCopy("backlog")).toBe(true);
    expect(shouldAutoStartOnPromptCopy("todo")).toBe(true);
  });

  it("never brings back an already started or closed ticket", () => {
    for (const status of ["in_progress", "in_review", "done", "canceled", "duplicate"] as const) {
      expect(shouldAutoStartOnPromptCopy(status)).toBe(false);
    }
  });
});

describe("shouldAutoStartTask", () => {
  it("starts only a scratchpad task that has not started yet", () => {
    expect(shouldAutoStartTask("pending")).toBe(true);
  });

  it("leaves an in-progress, checked, or cancelled task in place", () => {
    expect(shouldAutoStartTask("in_progress")).toBe(false);
    expect(shouldAutoStartTask("completed")).toBe(false);
    expect(shouldAutoStartTask("cancelled")).toBe(false);
  });
});
