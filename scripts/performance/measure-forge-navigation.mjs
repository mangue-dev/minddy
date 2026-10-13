import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { id } from "./seed.mjs";
import { optionalSecondaryWorkload } from "./secondary-navigation-workload.mjs";

const PROJECT = "a3dc2a22-68d1-403a-946a-a4bb519b00d5";
const FILES = ["docs/minddy-pr-performance-validation.md", "docs/minddy-pr-performance-measurements.csv"];
export const forgeLinkFingerprint = (link) => createHash("sha256").update(JSON.stringify(link)).digest("hex");

export async function loadConnectedBoardWorkload(api, fixture, secondary) {
  if (secondary === undefined) secondary = await optionalSecondaryWorkload(api, fixture);
  const board = await api("/api/me/board");
  const marked = board.issues.filter((issue) => fixture.projects.includes(issue.project_id));
  const originals = new Set(Array.from({ length: 6 }, (_, project) =>
    Array.from({ length: 100 }, (_, issue) => id(`issue-${project}-${issue}`))).flat());
  assert.equal(marked.filter((issue) => originals.has(issue.id)).length, 600, "Preserve all original synthetic issue identities");
  const extraIds = new Set(secondary ? [...secondary.entities.triage, ...secondary.entities.tasks].map((issue) => issue.id) : []);
  assert.ok(marked.every((issue) => originals.has(issue.id) || extraIds.has(issue.id)), "Refuse unrecognized synthetic issues");
  assert.equal(marked.length, 600 + extraIds.size, "Verify the complete original and secondary fixture source");
  assert.equal(new Set(marked.map((issue) => issue.id)).size, marked.length);
  assert.ok(board.issues.every((issue) => fixture.projects.includes(issue.project_id) || issue.project_id === PROJECT));
  // Digest protected content without publishing the shared project's text.
  const contentFingerprint = forgeLinkFingerprint([...board.issues].sort((a, b) => a.id.localeCompare(b.id)));
  const kanban = board.issues.filter((issue) => !["triage", "duplicate"].includes(issue.status));
  const triage = board.issues.filter((issue) => issue.status === "triage");
  if (secondary?.counts) {
    assert.equal(board.issues.length, secondary.counts.allSourceIssues, "Keep the complete populated source workload stable");
    assert.equal(kanban.length, secondary.counts.allBoardCards, "Verify actual populated kanban source count");
  }
  const perProject = Object.fromEntries(fixture.projects.map((projectId) => [projectId, {
    issues: marked.filter((issue) => issue.project_id === projectId).length,
    cards: kanban.filter((issue) => issue.project_id === projectId).length,
    triage: triage.filter((issue) => issue.project_id === projectId).length,
    cardIds: kanban.filter((issue) => issue.project_id === projectId).map((issue) => issue.id).sort(),
  }]));
  return { cards: kanban.length, markedCards: kanban.filter((issue) => originals.has(issue.id) || extraIds.has(issue.id)).length,
    sharedCards: kanban.filter((issue) => !fixture.projects.includes(issue.project_id)).length,
    sourceIssues: board.issues.length, triageIssues: triage.length, perProject,
    cardIds: kanban.map((issue) => issue.id).sort(), contentFingerprint };
}

/** Verify the explicitly authorized small GitHub cohort through ordinary reads. */
export async function loadForgeWorkload(api) {
  const { link } = await api(`/api/projects/${PROJECT}/git-link`);
  assert.equal(link?.provider, "github");
  assert.equal(link.repo_full_name, "mangue-dev/pingmeif");
  const list = await api("/api/pull-requests");
  const prs = list.pullRequests.filter((pr) => pr.project?.id === PROJECT);
  assert.equal(prs.length, 5, "Wait for the five real cohort PRs to be ingested");
  assert.deepEqual(prs.map((pr) => pr.pr_number).sort(), [1, 2, 3, 4, 5]);
  assert.ok(prs.every((pr) => pr.pr_state === "draft" &&
    pr.title === `docs: add Minddy PR performance validation workload ${pr.pr_number}`));
  assert.deepEqual(list.pullRequests.slice(0, 5).map((pr) => pr.prId), prs.map((pr) => pr.prId),
    "The cohort must occupy the existing five-recent-PR preparation window");
  return { project: PROJECT, prs: prs.map(({ prId, pr_number, title }) => ({ prId, number: pr_number, title })),
    files: FILES, commits: 2, repoCount: list.repoCount, linkFingerprint: forgeLinkFingerprint(link) };
}

/** Selection identity, real description/activity, and genuine detail subview clicks. */
export async function measureForgeNavigation({ page, tabs, workload, repeats, clickMeasured, results, allSubviews = false }) {
  results.protocol = allSubviews ? "min683-forge-v3-all-subviews" : "min683-forge-v2-complete-loading";
  const tab = tabs[1].id;
  await page.evaluate(({ tab, homeTab, files, allSubviews }) => { window.__instant.forge = { tab, homeTab, files, allSubviews }; }, { tab, homeTab: tabs[0].id, files: workload.files, allSubviews });
  const detailReady = ({ pr }) => {
    const selected = document.querySelector(`[data-navigation-href="/pull-requests?pr=${pr.prId}"][aria-current="true"]`);
    const description = [...document.querySelectorAll('[data-testid="pr-description"]')].find((node) =>
      node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    return !!document.querySelector(`[data-app-tab-id="${window.__instant.forge.tab}"][aria-selected="true"]`) &&
      !!selected?.getClientRects().length && !!description?.textContent.includes("documentation-only draft") &&
      [...document.querySelectorAll("h1")].some((node) => node.getClientRects().length && node.textContent.trim() === pr.title);
  };
  const activityReady = (args) => {
    if (!window.__instant.forge.detailReady(args)) return false;
    if (window.__instant.forge.allSubviews && !["comments", "review-comments"].every((kind) => window.__instant.forgeReads?.[`${args.pr.number}:${kind}`])) return false;
    const visible = (node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
    if ([...document.querySelectorAll('[data-testid="pr-activity-skeleton"]')].some(visible)) return false;
    return [...document.querySelectorAll('[data-testid="pr-activity-timeline"], p')].some((node) =>
      visible(node) && (node.dataset.testid === "pr-activity-timeline" || node.textContent.trim() === "No comments yet."));
  };
  const filesReady = () => {
    const diff = [...document.querySelectorAll('[data-testid="pr-diff-view"]')].find((node) =>
      node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    return !!diff && window.__instant.forge.files.every((path) => !!diff.querySelector(`[id="pr-file-${path}"]`)) &&
      [...diff.querySelectorAll("diffs-container")].some((node) => node.shadowRoot?.textContent.includes("Minddy pull request performance validation"));
  };
  await page.evaluate((source) => { window.__instant.forge.detailReady = new Function("args", `return (${source})(args)`); }, detailReady.toString());
  const beforeClick = results.network.filter((entry) => entry.method === "GET" && entry.status === 200);
  results.preparedForgeReads = workload.prs.map(({ prId, number }) => ({ number,
    detail: beforeClick.some((entry) => entry.path === `/api/pull-requests/${prId}`),
    activity: beforeClick.some((entry) => entry.path === `/api/pull-requests/${prId}/comments`),
    commits: beforeClick.some((entry) => entry.path === `/api/pull-requests/${prId}/commits`),
    reviewComments: beforeClick.some((entry) => entry.path === `/api/pull-requests/${prId}/review-comments`),
  }));
  await clickMeasured("first-real-pr", page.locator(`[data-app-tab-id="${tab}"]`), detailReady,
    { pr: workload.prs[0] }, activityReady);
  async function subviews(pr) {
    const start = results.measurements.length;
    await clickMeasured("pr-activity-to-files", page.getByRole("tab", { name: /^Changes/ }), filesReady, null);
    await clickMeasured("pr-open-commits", page.getByTestId("pr-commits-trigger"), () => {
      const popover = document.querySelector('[data-testid="pr-commits-popover"]');
      return !!popover?.getClientRects().length && popover.querySelectorAll('li[role="button"]').length === 2;
    }, null);
    if (allSubviews) {
      const head = results.forgeReadProof?.find((read) => read.number === pr.number && read.kind === "detail" && read.verified)?.headSha;
      assert.match(head ?? "", /^[a-f0-9]{40}$/);
      const popover = page.getByTestId("pr-commits-popover");
      const rows = popover.locator('li[role="button"]');
      assert.equal(await rows.count(), 2);
      assert.ok((await rows.allTextContents()).some((text) => text.includes(head.slice(0, 7))), "The visible commits must include the current PR head");
      (results.forgeReadProof ??= []).push({ number: pr.number, kind: "commits", verified: true, commits: 2, headSha: head, source: "visible-commits-popover" });
    }
    await page.keyboard.press("Escape");
    await page.getByTestId("pr-commits-popover").waitFor({ state: "hidden" });
    await page.getByTestId("pr-file-tree-trigger").click();
    await page.getByTestId("pr-file-tree-popover").waitFor();
    await clickMeasured("pr-change-file", page.getByTestId("pr-file-tree-popover").getByRole("button").filter({ hasText: "minddy-pr-performance-measurements.csv" }), () => {
      const card = document.getElementById("pr-file-docs/minddy-pr-performance-measurements.csv");
      const bounds = card?.getBoundingClientRect();
      return !!bounds && bounds.top >= 0 && bounds.top < innerHeight &&
        [...card.querySelectorAll("diffs-container")].some((node) => node.shadowRoot?.textContent.includes("paint_opportunity_ms"));
    }, null);
    await clickMeasured("pr-files-to-activity", page.getByRole("tab", { name: /^Description and activity/ }), activityReady,
      { pr });
    for (const sample of results.measurements.slice(start)) sample.destinationNumber = pr.number;
  }
  // Published selections can consume their address. Determine identity from
  // the selected sidebar row instead of relying on a remaining URL parameter.
  if (allSubviews) await subviews(workload.prs[0]);
  for (let round = 0; round < repeats; round++) {
    for (const [index, pr] of workload.prs.entries()) {
      if (round === 0 && index === 0) continue;
      await clickMeasured(round === 0 ? "first-real-pr-switch" : "real-pr-switch",
        page.locator(`[data-navigation-href="/pull-requests?pr=${pr.prId}"]:visible`), detailReady,
        { pr }, activityReady);
      results.measurements.at(-1).destinationNumber = pr.number;
      if (allSubviews) await subviews(pr);
    }
    const selected = await page.locator('[data-navigation-href][aria-current="true"]').getAttribute("data-navigation-href");
    const pr = workload.prs.find((pr) => selected?.includes(pr.prId));
    assert.ok(pr);
    // Keep the selected identity available across address consumption.
    await page.evaluate((pr) => { window.__instant.forge.current = pr; }, pr);
    if (!allSubviews) await subviews(pr);
    await clickMeasured("real-pr-to-home", page.locator(`[data-app-tab-id="${tabs[0].id}"]`), () =>
      !!document.querySelector(`[data-app-tab-id="${window.__instant.forge.homeTab}"][aria-selected="true"]`) &&
      [...document.querySelectorAll('[contenteditable][aria-placeholder*="Numo"]')].some((node) => node.getClientRects().length), null);
    await clickMeasured("return-real-pr", page.locator(`[data-app-tab-id="${tab}"]`), detailReady, { pr }, activityReady);
    await page.waitForTimeout(350);
  }
  results.verification = { sameTabPreserved: true, fiveRealPrIdentitiesVerified: true, filePatchesAndTwoCommitsVerified: true, ...(allSubviews ? { allFiveSubviewIdentitiesVerified: true } : {}) };
}
