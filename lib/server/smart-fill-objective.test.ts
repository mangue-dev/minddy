import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smart Fill for objectives (MIN-919): what is kept of a model's answer, the
 * gates of the call, and the guarantee that a field the author set is never
 * written. The model call itself is mocked.
 */

const { forcedToolCall, hasUsageBudget, resolveConfiguredModel, getUserById } = vi.hoisted(() => ({
  getUserById: vi.fn(),
  forcedToolCall: vi.fn(),
  hasUsageBudget: vi.fn(),
  resolveConfiguredModel: vi.fn(async () => ({ model: "test/model" as string | null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ auth: { admin: { getUserById } } }),
}));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({ forcedToolCall }));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget }));
vi.mock("@/lib/server/model-config", () => ({ resolveConfiguredModel }));
vi.mock("@/lib/server/smart-fill", () => ({ MAX_DESCRIPTION_CHARS: 4000 }));

import {
  buildObjectiveFillPrompt,
  cleanObjectiveName,
  fallbackObjectiveName,
  MAX_OBJECTIVE_NAME_CHARS,
  objectiveFillClock,
  objectiveFillParameters,
  resolveObjectiveSmartFillPayer,
  resolveTargetDate,
  runObjectiveSmartFill,
  sanitizeObjectiveFill,
} from "./smart-fill-objective";

const ALL = ["name", "color", "target_date"] as const;
const TODAY = "2026-11-09";

describe("sanitizeObjectiveFill", () => {
  const paris = objectiveFillClock("Europe/Paris", new Date(`${TODAY}T12:00:00Z`));

  it("keeps a palette color, a future date and a cleaned name", () => {
    expect(
      sanitizeObjectiveFill(
        { color: "#22C55E", target_date: "2027-01-31", name: '"Refonte de l\'onboarding."' },
        { empty: ALL, clock: paris },
      ),
    ).toEqual({
      color: "#22c55e",
      // Local midnight in Paris: the app reads it as a day without a time.
      target_date: "2027-01-30T23:00:00.000Z",
      name: "Refonte de l'onboarding",
    });
  });

  it("drops a color outside the palette, a missing, impossible or past date", () => {
    const empty = { empty: ALL, clock: paris };
    expect(sanitizeObjectiveFill({ color: "#123456", target_date: "none", name: "" }, empty)).toEqual({});
    expect(sanitizeObjectiveFill({ target_date: "2027-02-30" }, empty)).toEqual({});
    expect(sanitizeObjectiveFill({ target_date: "2026-01-31" }, empty)).toEqual({});
    expect(sanitizeObjectiveFill({ target_date: "end of January" }, empty)).toEqual({});
    expect(sanitizeObjectiveFill({ target_date: "2026-11-30T25:00" }, empty)).toEqual({});
  });

  it("never writes a field the author already set", () => {
    expect(
      sanitizeObjectiveFill(
        { color: "#22c55e", target_date: "2027-01-31", name: "Something else" },
        { empty: ["color"], clock: paris },
      ),
    ).toEqual({ color: "#22c55e" });
  });

  it("returns an empty patch without an answer", () => {
    expect(sanitizeObjectiveFill(null, { empty: ALL, clock: paris })).toEqual({});
  });
});

describe("resolveTargetDate", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("keeps the time the author wrote, in the author's time zone", () => {
    // "November 30 at 7:30 pm" written from Paris (UTC+1 in winter).
    expect(resolveTargetDate("2026-11-30T19:30", objectiveFillClock("Europe/Paris", now))).toBe(
      "2026-11-30T18:30:00.000Z",
    );
    expect(resolveTargetDate("2026-11-30T19:30", objectiveFillClock("America/New_York", now))).toBe(
      "2026-12-01T00:30:00.000Z",
    );
  });

  it("stores a bare day as the author's local midnight, not as UTC midnight", () => {
    expect(resolveTargetDate("2026-11-30", objectiveFillClock("Europe/Paris", now))).toBe(
      "2026-11-29T23:00:00.000Z",
    );
  });

  it("accepts today, but not a time of today already past", () => {
    const paris = objectiveFillClock("Europe/Paris", now); // 13:00 in Paris
    expect(resolveTargetDate(TODAY, paris)).toBe("2026-11-08T23:00:00.000Z");
    expect(resolveTargetDate(`${TODAY}T18:00`, paris)).toBe("2026-11-09T17:00:00.000Z");
    expect(resolveTargetDate(`${TODAY}T09:00`, paris)).toBeNull();
  });

  it("reads an unknown zone as UTC", () => {
    const clock = objectiveFillClock("Not/AZone", now);
    expect(clock.timeZone).toBe("UTC");
    expect(resolveTargetDate("2026-11-30T19:30", clock)).toBe("2026-11-30T19:30:00.000Z");
  });
});

describe("cleanObjectiveName", () => {
  it("keeps a short noun phrase and caps a sentence at a whole word", () => {
    expect(cleanObjectiveName("Name: Onboarding redesign!")).toBe("Onboarding redesign");
    const long = "Redesign the whole onboarding flow for new teams joining from the marketing site this winter";
    const name = cleanObjectiveName(long)!;
    expect(name.length).toBeLessThanOrEqual(MAX_OBJECTIVE_NAME_CHARS);
    expect(long.startsWith(name)).toBe(true);
  });

  it("keeps version names and technical identifiers intact", () => {
    expect(cleanObjectiveName('"0.40 - AI update."')).toBe("0.40 - AI update");
    expect(cleanObjectiveName("Name: Migration to v2.1")).toBe("Migration to v2.1");
    expect(cleanObjectiveName("MIN-42 OAuth 2.1 support")).toBe("MIN-42 OAuth 2.1 support");
  });

  it("names an objective from its description when no model answers", () => {
    expect(fallbackObjectiveName("## Refonte de l'onboarding\nLivraison fin janvier.")).toBe(
      "Refonte de l'onboarding",
    );
    expect(fallbackObjectiveName("   ")).toBeNull();
  });
});

describe("objectiveFillParameters", () => {
  it("requires every field, since small models skip optional ones", () => {
    const schema = objectiveFillParameters() as { properties: Record<string, unknown>; required: string[] };
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it("tells the model today's date and the meaning of each color", () => {
    const prompt = buildObjectiveFillPrompt("Minddy", objectiveFillClock("Europe/Paris", new Date(`${TODAY}T12:00:00Z`)));
    expect(prompt).toContain(`It is ${TODAY} 13:00 in the author's time zone (Europe/Paris)`);
    expect(prompt).toContain("#22c55e (green)");
    // What identifies the objective survives in its name.
    expect(prompt).toContain("version name");
    expect(prompt).toContain("technical identifier");
  });
});

describe("runObjectiveSmartFill", () => {
  const base = {
    projectId: "project-1",
    projectName: "Minddy",
    billToUserId: "user-1",
    name: "",
    description: "Refonte de l'onboarding, livraison fin janvier",
    empty: ALL,
    now: new Date(`${TODAY}T12:00:00Z`),
  };

  beforeEach(() => {
    forcedToolCall.mockReset();
    hasUsageBudget.mockReset().mockResolvedValue(true);
    resolveConfiguredModel.mockReset().mockResolvedValue({ model: "test/model" });
  });

  it("bills the creator and returns the sanitized patch", async () => {
    forcedToolCall.mockResolvedValue({ color: "#22c55e", target_date: "2027-01-31", name: "Refonte de l'onboarding" });
    await expect(runObjectiveSmartFill({ ...base, timeZone: "Europe/Paris" })).resolves.toEqual({
      color: "#22c55e",
      target_date: "2027-01-30T23:00:00.000Z",
      name: "Refonte de l'onboarding",
    });
    const options = forcedToolCall.mock.calls[0][5];
    expect(options.record).toEqual({ feature: "smart_fill", billTo: { userId: "user-1" }, projectId: "project-1" });
  });

  it("spends nothing without a budget, a model, or text to read", async () => {
    hasUsageBudget.mockResolvedValueOnce(false);
    await expect(runObjectiveSmartFill(base)).resolves.toEqual({});
    resolveConfiguredModel.mockResolvedValueOnce({ model: null });
    await expect(runObjectiveSmartFill(base)).resolves.toEqual({});
    await expect(runObjectiveSmartFill({ ...base, description: null })).resolves.toEqual({});
    await expect(runObjectiveSmartFill({ ...base, empty: [] })).resolves.toEqual({});
    expect(forcedToolCall).not.toHaveBeenCalled();
  });

  it("never throws: a failed call leaves an empty patch", async () => {
    forcedToolCall.mockRejectedValue(new Error("provider down"));
    await expect(runObjectiveSmartFill(base)).resolves.toEqual({});
  });
});

describe("resolveObjectiveSmartFillPayer", () => {
  it("writes names by the objective switch, not by the issue title switch", async () => {
    getUserById.mockResolvedValue({ data: { user: { user_metadata: { smart_fill_title: false } } }, error: null });
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1" })).resolves.toEqual({ userId: "user-1", name: true });
    getUserById.mockResolvedValue({
      data: { user: { user_metadata: { smart_fill_objective_name: false } } },
      error: null,
    });
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1" })).resolves.toEqual({ userId: "user-1", name: false });
  });

  const withMeta = (meta: Record<string, unknown>) =>
    getUserById.mockResolvedValue({ data: { user: { user_metadata: meta } }, error: null });

  it("follows the account's Fill created objectives switch, on by default", async () => {
    withMeta({});
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1" })).resolves.toEqual({ userId: "user-1", name: true });
    withMeta({ smart_fill_objectives: false });
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1" })).resolves.toBeNull();
  });

  it("lets the form re-arm one objective, but never past the master switch", async () => {
    withMeta({ smart_fill_objectives: false, smart_fill_objective_name: false });
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1", explicit: true })).resolves.toEqual({
      userId: "user-1",
      name: false,
    });
    withMeta({ smart_fill: false });
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1", explicit: true })).resolves.toBeNull();
    await expect(resolveObjectiveSmartFillPayer({ actorId: "user-1", explicit: false })).resolves.toBeNull();
  });
});
