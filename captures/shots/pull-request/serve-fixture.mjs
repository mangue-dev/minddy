/** The fixture readings of the capture (moved out of shot.mjs for reuse). */
import {
  COMMENTS,
  COMMITS,
  DETAIL_RESPONSE,
  LIST_RESPONSE,
  REVIEW_COMMENTS,
  REVIEW_THREADS,
  TIMELINE,
} from "./fixture.mjs";

const CAPTURE_ONLY = process.argv.includes("--capture-only");

const json = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

export async function serveFixture(page) {
  const served = [];
  const unexpected = [];
  let reviewResolved = CAPTURE_ONLY;
  let draft = false;

  const listResponse = () => ({
    ...LIST_RESPONSE,
    pullRequests: LIST_RESPONSE.pullRequests.map((item) => ({
      ...item,
      pr_state: draft ? "draft" : "open",
    })),
  });
  const detailResponse = () =>
    draft
      ? {
          ...DETAIL_RESPONSE,
          pr: {
            ...DETAIL_RESPONSE.pr,
            draft: true,
            mergeable: false,
            mergeableState: "blocked",
            mergeabilityReason: "draft",
          },
          readiness: {
            ...DETAIL_RESPONSE.readiness,
            state: "draft",
            blockers: [
              {
                id: "draft",
                kind: "draft",
                required: true,
                status: "blocked",
                source: "pull_request",
                action: "mark_ready",
              },
            ],
            mergeAllowed: false,
          },
        }
      : reviewResolved
        ? DETAIL_RESPONSE
        : {
            ...DETAIL_RESPONSE,
            readiness: {
              ...DETAIL_RESPONSE.readiness,
              state: "unresolved_conversations",
              blockers: [
                {
                  id: "conversations-unresolved",
                  kind: "conversations",
                  required: true,
                  status: "blocked",
                  source: "conversations",
                  action: "resolve_conversations",
                  count: REVIEW_THREADS.length,
                },
              ],
              mergeAllowed: false,
            },
          };

  const on = (test, handler) =>
    page.route(
      (url) => test(url.pathname),
      async (route) => {
        served.push(new URL(route.request().url()).pathname);
        await handler(route);
      },
    );

  const under = (suffix) => new RegExp(`^/api/pull-requests/[^/]+${suffix}$`);

  // Safety net, installed FIRST and therefore consulted LAST: Playwright
  // tries its handlers in REVERSE order of registration, the most
  // recent first. Placed last, this net passed in front of all the others and
  // aborted the list itself — the page rendered its screen blank, and the message
  // error was talking about a `#128` not found.
  await page.route(
    (url) => url.pathname.startsWith("/api/pull-requests"),
    async (route) => {
      unexpected.push(new URL(route.request().url()).pathname);
      await route.abort();
    },
  );

  await on(
    (p) => p === "/api/pull-requests",
    (r) => json(r, listResponse()),
  );
  await on(
    (p) => under("").test(p),
    (r) => {
      if (r.request().method() === "POST") {
        const body = r.request().postDataJSON();
        if (body.action === "convert_to_draft") draft = true;
        else if (body.action === "ready_for_review") draft = false;
        return json(r, { ok: true, pr_state: draft ? "draft" : "open" });
      }
      return json(r, detailResponse());
    },
  );
  await on(
    (p) => under("/comments").test(p),
    // The wire is FLAT on the forge side: `comments` is the conversation, `timeline`
    // events (assignments, labels, etc.) and `reactions` emoji. Both
    // The latter are empty — the demo world has neither.
    (r) => json(r, { comments: COMMENTS, timeline: TIMELINE, reactions: [] }),
  );
  await on(
    (p) => under("/commits").test(p),
    (r) => json(r, { commits: COMMITS, truncated: false }),
  );
  await on(
    (p) => under("/review-comments").test(p),
    (r) => {
      if (r.request().method() === "PATCH") {
        reviewResolved = r.request().postDataJSON().resolved;
        return json(r, { ok: true, resolved: reviewResolved });
      }
      return json(r, {
        comments: REVIEW_COMMENTS,
        threads: REVIEW_THREADS.map((thread) => ({
          ...thread,
          resolved: reviewResolved,
          resolvedBy: reviewResolved ? "camille" : null,
        })),
        reactions: [],
      });
    },
  );
  // Rereading by Numo (MIN-168): no session on this PR, therefore nothing to
  // announce in the thread. The hook stops polling as soon as `working` is false.
  await on(
    (p) => under("/ai-review").test(p),
    (r) => json(r, { run: null, reviewedHeadSha: null, model: null }),
  );

  return { served, unexpected };
}
