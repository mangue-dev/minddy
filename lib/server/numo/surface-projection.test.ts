import { describe, expect, it } from "vitest";

import {
  numoSurfaceProjectionDisposition,
  surfaceAskUserQuestions,
} from "./surface-projection";

describe("Numo shared-surface response lifecycle", () => {
  it.each(["queued", "running", "waiting_work"] as const)(
    "keeps the response private while a %s turn is still working",
    (status) => {
      expect(numoSurfaceProjectionDisposition(status)).toBe("wait");
    },
  );

  it.each(["waiting_input", "completed"] as const)(
    "projects only the intended final response for a %s turn",
    (status) => {
      expect(numoSurfaceProjectionDisposition(status)).toBe("reply");
    },
  );

  it.each(["stopping", "stopped", "retryable", "reconciling", "failed"] as const)(
    "fails the placeholder for a terminal or interrupted %s turn",
    (status) => {
      expect(numoSurfaceProjectionDisposition(status)).toBe("fail");
    },
  );

  it("extracts only the explicit questions from a durable ask_user result", () => {
    expect(surfaceAskUserQuestions(JSON.stringify({
      status: "awaiting_user_response",
      questions: ["Which branch should I use?", "Should the API remain compatible?"],
      private_result: "not projected",
    }))).toEqual([
      "Which branch should I use?",
      "Should the API remain compatible?",
    ]);
    expect(surfaceAskUserQuestions("not-json")).toEqual([]);
  });
});
