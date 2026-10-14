import assert from "node:assert/strict";
import test from "node:test";
import { EMAIL, MARKER } from "./seed.mjs";
import { fingerprint, secondaryFixtureProjectIds, SCALED_SECONDARY_MARKER } from "./enrich-secondary-workload.mjs";
import { enrichRoutinesWorkload, ROUTINES_MARKER, ROUTINE_PROMPT, routineDefinition, selectRoutine } from "./enrich-routines-workload.mjs";

const fixture = { email: EMAIL, marker: MARKER, userId: "fixture-owner", projects: [...secondaryFixtureProjectIds] };
const routine = (patch = {}) => ({ id: "routine-a", project_id: fixture.projects[0], owner_id: fixture.userId,
  title: "Workspace readiness", prompt: "An existing representative disabled fixture instruction. ".repeat(3),
  enabled: false, next_run_at: null, trigger: { type: "schedule" }, timezone: "Europe/Paris", ...patch });
const marked = () => {
  const input = routineDefinition(fixture.projects[0]);
  return routine({ prompt: ROUTINE_PROMPT, trigger: input.trigger, frequency: input.frequency,
    hour: input.hour, minute: input.minute, weekdays: input.weekdays, days_of_month: input.daysOfMonth,
    max_spend_percent: input.maxSpendPercent, prompt_mentions: [], last_run_at: null, last_error: null });
};

test("routine preparation prefers complete paused fixture content without creating another record", () => {
  const existing = routine();
  assert.equal(selectRoutine([existing], fixture), existing);
  assert.equal(selectRoutine([routine({ id: "routine-z" }), existing], fixture), existing);
  for (const patch of [{ enabled: true }, { next_run_at: "2026-10-20" }, { owner_id: "another-owner" },
    { project_id: fixture.projects[1] }, { prompt: "Too short" }, { trigger: { type: "event" } }]) {
    assert.equal(selectRoutine([routine(patch)], fixture), undefined);
  }
});

test("routine journal refuses missing, changed or newly active accepted content", () => {
  const existing = routine();
  const journal = { routineId: existing.id, rowFingerprint: fingerprint(existing) };
  assert.equal(selectRoutine([existing], fixture, journal), existing);
  assert.throws(() => selectRoutine([], fixture, journal), /do not recreate/);
  assert.throws(() => selectRoutine([routine({ title: "Changed title" })], fixture, journal), /retained routine changed/);
  assert.throws(() => selectRoutine([routine({ enabled: true })], fixture, journal), /paused/);
});

test("ambiguous creation cannot issue another POST unless its exact marked result is found", () => {
  const journal = { operation: { phase: "ambiguous" } };
  assert.throws(() => selectRoutine([routine()], fixture, journal), /reconcile the journal/);
  const accepted = marked();
  assert.equal(selectRoutine([accepted], fixture, journal), accepted);
  assert.throws(() => selectRoutine([accepted, { ...accepted, id: "duplicate" }], fixture, journal), /duplicate marked/);
  assert.throws(() => selectRoutine([{ ...accepted, max_spend_percent: 100 }], fixture, journal));
});

test("the sole creation payload is scoped, paused and carries a deterministic marked instruction", () => {
  const input = routineDefinition(fixture.projects[0]);
  assert.equal(input.enabled, false); assert.equal(input.maxSpendPercent, 1);
  assert.ok(input.prompt.includes(`<!-- ${ROUTINES_MARKER} -->`));
  assert.deepEqual(input.trigger, { type: "schedule" });
  assert.equal(input.timezone, "Europe/Paris");
  assert.ok(!("model" in input) && !("reasoningLevel" in input));
  assert.throws(() => routineDefinition(fixture.projects[1]));
});

test("identity rejection prevents every API read and mutation", async () => {
  let calls = 0;
  await assert.rejects(enrichRoutinesWorkload({ fixture,
    stable: { userId: fixture.userId, email: EMAIL, marker: MARKER },
    secondary: { userId: fixture.userId, email: EMAIL, marker: SCALED_SECONDARY_MARKER,
      status: "complete", projectId: fixture.projects[0], counts: { projectSourceIssues: 670, allSourceIssues: 1206 } },
    getIdentity: async () => ({ id: "another-user", email: EMAIL, user_metadata: { performance_fixture: MARKER } }),
    api: async () => { calls++; }, apply: true,
  }), /Wrong authenticated fixture ID/);
  assert.equal(calls, 0);
});
