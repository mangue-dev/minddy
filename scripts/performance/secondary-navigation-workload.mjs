import { readFile } from "node:fs/promises";
import { loadSecondaryWorkload, secondaryManifestPath } from "./enrich-secondary-workload.mjs";

/** Existing empty cohorts remain explicit; incomplete enrichment fails closed. */
export async function optionalSecondaryWorkload(api, fixture) {
  let manifest;
  try { manifest = JSON.parse(await readFile(secondaryManifestPath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  return loadSecondaryWorkload(api, fixture, manifest);
}

/** Compare rendered fixture prose without HTML markers or Markdown syntax. */
export const renderedFixtureText = (value) => String(value).replace(/<!--[\s\S]*?-->/g, "")
  .replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();

/** Declare a bounded, deterministic UI sample without claiming exhaustive detail coverage. */
export function secondaryJourneyIds(ids) {
  return [...new Set([0, 1, Math.floor(ids.length / 2), ids.length - 1].filter((index) => index >= 0 && index < ids.length).map((index) => ids[index]))];
}

export function secondaryReadiness(workload, kind, { allFeedback = false } = {}) {
  const unresolved = new Set(workload.entities.feedback.filter((entry) => !["shipped", "declined", "spam"].includes(entry.status)).map((entry) => entry.id));
  const source = workload.readiness[kind];
  const listIds = kind === "feedback" && !allFeedback ? source.listIds.filter((id) => unresolved.has(id)) : source.listIds;
  const noun = kind === "triage" ? listIds.length === 1 ? "issue" : "issues" : kind === "feedback" ? "feedback" : listIds.length === 1 ? "objective" : "objectives";
  return { listIds, journeyIds: secondaryJourneyIds(listIds), collectionPlaceholder: `Filter ${listIds.length} ${noun}…`,
    details: source.details.map(({ comments, ...entry }) => {
      const tasks = kind === "objectives" ? workload.entities.tasks.filter((task) => task.objectiveId === entry.id) : null;
      return { ...entry, bodyText: renderedFixtureText(entry.bodyText),
        ...(tasks ? { taskCount: tasks.length, doneCount: tasks.filter((task) => ["done", "canceled", "duplicate"].includes(task.status)).length } : {}),
        comments: comments.map((comment) => ({ id: comment.id, bodyText: renderedFixtureText(comment.body) })) };
    }) };
}

/** Never serialize hydrated descriptions or comment bodies into public evidence. */
export function secondaryEvidence(workload) {
  if (!workload) return null;
  const { readiness: _readiness, ...manifest } = workload;
  return manifest;
}
