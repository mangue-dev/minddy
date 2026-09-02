import { openPage, settle, CAPTURE } from "../../lib/browser.mjs";
import {
  COMMENTS,
  COMMITS,
  DETAIL_RESPONSE,
  FILES,
  LIST_RESPONSE,
  PR_ID,
  REVIEW_COMMENTS,
  REVIEW_THREADS,
  TIMELINE,
} from "./fixture.mjs";

const FILE_COUNT = 60;
const source = FILES[0];
const files = Array.from({ length: FILE_COUNT }, (_, index) => ({
  ...source,
  filename: `performance/file-${String(index + 1).padStart(3, "0")}.ts`,
  // A unified diff represents an unchanged empty line with a single space.
  patch: source.patch.replace(/^$/gm, " "),
}));

const json = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

async function serve(page) {
  const endpoint = `/api/pull-requests/${PR_ID}`;
  await page.route(
    (url) => url.pathname.startsWith("/api/pull-requests"),
    (route) => route.abort(),
  );
  await page.route(
    (url) => url.pathname === "/api/pull-requests",
    (route) => json(route, LIST_RESPONSE),
  );
  await page.route(
    (url) => url.pathname === endpoint,
    (route) => json(route, { ...DETAIL_RESPONSE, files, reviewThreads: [] }),
  );
  await page.route(
    (url) => url.pathname === `${endpoint}/comments`,
    (route) => json(route, { comments: COMMENTS, timeline: TIMELINE, reactions: [] }),
  );
  await page.route(
    (url) => url.pathname === `${endpoint}/commits`,
    (route) => json(route, { commits: COMMITS, truncated: false }),
  );
  await page.route(
    (url) => url.pathname === `${endpoint}/review-comments`,
    (route) => json(route, { comments: REVIEW_COMMENTS, threads: REVIEW_THREADS, reactions: [] }),
  );
  await page.route(
    (url) => url.pathname === `${endpoint}/ai-review`,
    (route) => json(route, { run: null, reviewedHeadSha: null, model: null }),
  );
  for (const commit of COMMITS) {
    await page.route(
      (url) => url.pathname === `${endpoint}/commits/${commit.sha}`,
      (route) =>
        json(route, {
          files,
          additions: files.reduce((total, file) => total + file.additions, 0),
          deletions: files.reduce((total, file) => total + file.deletions, 0),
          url: commit.url ?? null,
          parentSha: commit.parentSha ?? null,
          message: commit.message,
          author: commit.author,
          authorName: commit.authorName,
          authoredAt: commit.authoredAt,
          provider: "github",
        }),
    );
  }
}

async function diffStats(page) {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll('[data-testid="pr-diff-view"]')].filter(
      (root) => root.getBoundingClientRect().width > 0,
    );
    const root = roots.at(-1);
    return {
      cards: root?.querySelectorAll('[id^="pr-file-"]').length ?? 0,
      rendered: root?.querySelectorAll("diffs-container").length ?? 0,
      deferred: root?.querySelectorAll('[data-testid="pr-diff-deferred-body"]').length ?? 0,
    };
  });
}

async function assertLazySurface(page, surface) {
  await page.waitForFunction(() => document.querySelector("diffs-container") !== null);
  await page.waitForTimeout(150);
  const stats = await diffStats(page);
  if (stats.cards !== FILE_COUNT || stats.rendered > 12 || stats.deferred < FILE_COUNT - 12) {
    throw new Error(`${surface} eagerly rendered a large diff: ${JSON.stringify(stats)}`);
  }

  const lastFilename = files.at(-1).filename;
  await page.getByText(lastFilename, { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (filename) => {
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes(filename) && candidate.getBoundingClientRect().width > 0,
      );
      return !!button?.parentElement?.querySelector("diffs-container");
    },
    lastFilename,
  );
  return stats;
}

const { browser, page } = await openPage({
  locale: "en",
  theme: "dark",
  viewport: { width: 1_200, height: 900 },
});

try {
  await serve(page);
  await page.goto(`${CAPTURE.baseUrl}/pull-requests`, { waitUntil: "domcontentloaded" });
  await settle(page, { expect: "text=#128" });

  await page.getByRole("tab").nth(2).click();
  const filesStarted = performance.now();
  const filesStats = await assertLazySurface(page, "Pull request files");
  const filesElapsed = Math.round(performance.now() - filesStarted);

  await page.getByRole("tab").nth(1).click();
  await page.getByText("Declare shortcuts on the action itself", { exact: true }).click();
  const sidebarStarted = performance.now();
  const sidebarStats = await assertLazySurface(page, "Commit diff sidebar");
  const sidebarElapsed = Math.round(performance.now() - sidebarStarted);

  console.log(
    JSON.stringify(
      {
        files: { ...filesStats, firstAndLastReadyMs: filesElapsed },
        commitSidebar: { ...sidebarStats, firstAndLastReadyMs: sidebarElapsed },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
