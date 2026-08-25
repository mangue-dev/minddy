import { describe, expect, it } from "vitest";

import {
  routineForAssistantTool,
  routinesForAssistantTool,
  type RoutineToolSource,
} from "./routine-tool-result";

const routine: RoutineToolSource = {
  id: "routine-1",
  title: "Review dependencies",
  prompt: "A very long instruction that must only be loaded on demand.",
  model: null,
  max_spend_percent: 15,
  frequency: "weekly",
  hour: 9,
  minute: 0,
  weekdays: [1],
  days_of_month: [],
  timezone: "Europe/Paris",
  enabled: true,
  next_run_at: "2026-08-31T07:00:00.000Z",
  last_run_at: null,
  last_error: null,
};

describe("routineForAssistantTool", () => {
  it("omits the instruction from compact routine lists", () => {
    const result = routinesForAssistantTool([routine]);

    expect(result?.[0]).not.toHaveProperty("prompt");
    expect(result?.[0]).toMatchObject({ id: routine.id, title: routine.title });
  });

  it("includes the full instruction for a targeted routine", () => {
    expect(routinesForAssistantTool([routine], routine.id)?.[0]).toHaveProperty(
      "prompt",
      routine.prompt,
    );
  });

  it("does not return a routine outside the supplied project collection", () => {
    expect(routinesForAssistantTool([routine], "routine-2")).toBeNull();
  });

  it("keeps full routine serialization for create and update results", () => {
    expect(routineForAssistantTool(routine)).toHaveProperty("prompt", routine.prompt);
  });
});
