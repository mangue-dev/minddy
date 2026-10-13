import assert from "node:assert/strict";
import test from "node:test";
import { loadConnectedBoardWorkload } from "./measure-forge-navigation.mjs";
import { id } from "./seed.mjs";
import { renderedFixtureText, secondaryReadiness, secondaryEvidence, secondaryJourneyIds } from "./secondary-navigation-workload.mjs";

const fixture = { projects: Array.from({ length: 6 }, (_, index) => id(`project-${index}`)) };
function source() {
  const original = fixture.projects.flatMap((project_id, project) => Array.from({ length: 100 }, (_, issue) =>
    ({ id: id(`issue-${project}-${issue}`), project_id, status: "todo", title: "Original fixture" })));
  const triage = Array.from({ length: 12 }, (_, index) => ({ id: `triage-${index}`, project_id: fixture.projects[0], status: "triage" }));
  const tasks = Array.from({ length: 12 }, (_, index) => ({ id: `task-${index}`, project_id: fixture.projects[0], status: "todo" }));
  return { issues: [...original, ...triage, ...tasks], secondary: { entities: { triage, tasks } } };
}
test("separates complete issue source, triage and actual kanban counts", async () => {
  const { issues, secondary } = source();
  const workload = await loadConnectedBoardWorkload(async () => ({ issues }), fixture, secondary);
  assert.equal(workload.sourceIssues, 624); assert.equal(workload.triageIssues, 12); assert.equal(workload.cards, 612);
  assert.equal(workload.perProject[fixture.projects[0]].cards, 112);
  assert.equal(workload.perProject[fixture.projects[0]].issues, 124);
  assert.equal(workload.perProject[fixture.projects[1]].cards, 100);
  assert.equal(workload.cardIds.length, 612);
});
test("refuses replacement original identities and undeclared accumulated fixture issues", async () => {
  const { issues, secondary } = source();
  await assert.rejects(loadConnectedBoardWorkload(async () => ({ issues: [...issues, { id: "unknown", project_id: fixture.projects[0], status: "todo" }] }), fixture, secondary), /unrecognized/);
  issues[0] = { ...issues[0], id: "replacement" };
  await assert.rejects(loadConnectedBoardWorkload(async () => ({ issues }), fixture, secondary), /original synthetic/);
});
test("hydrates exact default and all feedback identities without publishing descriptions", () => {
  const workload = { marker: "fixture", entities: { feedback: [{ id: "open", status: "open" }, { id: "resolved", status: "shipped" }] },
    readiness: { feedback: { listIds: ["open", "resolved"], details: [{ id: "open", title: "Fixture", bodyText: "<!-- private marker -->\n\n## Scenario\n\nUseful text.",
      commentIds: ["comment"], comments: [{ id: "comment", body: "<!-- hidden -->\n\nActual review." }] }] } } };
  assert.equal(renderedFixtureText(workload.readiness.feedback.details[0].bodyText), "Scenario Useful text.");
  assert.deepEqual(secondaryReadiness(workload, "feedback").listIds, ["open"]);
  assert.deepEqual(secondaryReadiness(workload, "feedback", { allFeedback: true }).listIds, ["open", "resolved"]);
  assert.equal(secondaryReadiness(workload, "feedback").details[0].comments[0].bodyText, "Actual review.");
  assert.ok(!("readiness" in secondaryEvidence(workload)));
});
test("declares bounded repeatable detail samples while retaining complete large collection counts", () => {
  const ids = Array.from({ length: 120 }, (_, index) => `fixture-${index}`);
  assert.deepEqual(secondaryJourneyIds(ids), ["fixture-0", "fixture-1", "fixture-60", "fixture-119"]);
  assert.deepEqual(secondaryJourneyIds(ids), secondaryJourneyIds([...ids]));
  assert.deepEqual(secondaryJourneyIds([]), []);
  assert.deepEqual(secondaryJourneyIds(["one"]), ["one"]);
});
