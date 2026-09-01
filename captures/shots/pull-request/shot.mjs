/**
 * workflowPr — Numo's pull request on AUR-2, Files tab.
 *
 * See `intent.md`: the diff of a PR is read LIVE at GitHub, so no
 * sown data cannot make it. We open the REAL page and respond to the
 * position of the network on three readings. No writing, no `pr_number` set.
 *
 * node captures/shots/pull-request/shot.mjs # produces the PNGs
 *   node captures/shots/pull-request/shot.mjs --publish   # + livre
 */
import {
  openPage,
  settle,
  shoot,
  CAPTURE,
  CAPTURE_VARIANTS,
} from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";
import {
  COMMENTS,
  COMMITS,
  DETAIL_RESPONSE,
  FILES,
  LIST_RESPONSE,
  PR_ID,
  PR_NUMBER,
  REVIEW_COMMENTS,
  REVIEW_THREADS,
  RUN_ID,
  TIMELINE,
  TOTALS,
} from "./fixture.mjs";

const SLOT = "workflowPr";
const OUT = "captures/shots/pull-request/out";
const VIEWPORT = { width: 1447, height: 1085 };

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

const json = (route, body) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/**
 * Readings responded to by capture. They are ALL indexed by the PR
 * since MIN-143 (`/api/pull-requests/{prId}/…`): the page also shows the PRs
 * human, which have no runs, and `agent-runs/{runId}/pr/*` routes do not
 * are more than facades that she does not call.
 *
 * We aim by the EXACT PATH, not by a glob: `**\/pull-requests/*` picks up
 * aussi bien `/comments` que `/commits` selon l'ordre d'enregistrement.
 *
 * The last net catches ALL the rest of the family and refuses to serve it:
 * an unknown road would leave if not for real, with its real
 * consequences — a call to GitHub on behalf of the demo account.
 */
async function serveFixture(page) {
  const served = [];
  const unexpected = [];
  let reviewResolved = false;
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
      : DETAIL_RESPONSE;

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
        reviewResolved = true;
        return json(r, { ok: true, resolved: true });
      }
      return json(r, {
        comments: reviewResolved ? [] : REVIEW_COMMENTS,
        threads: reviewResolved ? [] : REVIEW_THREADS,
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

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({
    theme,
    locale,
    viewport: VIEWPORT,
  });
  try {
    const { served, unexpected } = await serveFixture(page);

    await page.goto(`${CAPTURE.baseUrl}/pull-requests`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page, { expect: `text=#${PR_NUMBER}` });

    // The header usage badge displays “…” as long as the billing
    // did not respond, and this page doubles it on the thread. One run got it
    // photographed while loading. We wait for her to finish, whatever
    // the language — it is the character that we look for, not a wording.
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].some(
          (b) => b.textContent?.trim() === "…",
        ),
      undefined,
      { timeout: 15_000 },
    );

    const headerLayout = await page.evaluate(() => {
      const header = document.querySelector(".app-content-header");
      const buttons = [...(header?.querySelectorAll("button") ?? [])]
        .filter((button) => getComputedStyle(button).display !== "none")
        .map((button) => ({
          label:
            button.getAttribute("aria-label") ||
            button.textContent?.trim() ||
            "",
          box: button.getBoundingClientRect().toJSON(),
        }));
      const overlaps = [];
      for (let left = 0; left < buttons.length; left++) {
        for (let right = left + 1; right < buttons.length; right++) {
          const a = buttons[left].box;
          const b = buttons[right].box;
          if (
            a.right > b.left &&
            b.right > a.left &&
            a.bottom > b.top &&
            b.bottom > a.top
          ) {
            overlaps.push([buttons[left].label, buttons[right].label]);
          }
        }
      }
      return { overlaps, labels: buttons.map((button) => button.label) };
    });
    if (headerLayout.overlaps.length > 0) {
      throw new Error(
        `${locale}/${theme} — overlapping PR header actions: ${JSON.stringify(headerLayout.overlaps)}`,
      );
    }
    if (headerLayout.labels.length < 2) {
      throw new Error(
        `${locale}/${theme} — readiness and primary actions are missing from the PR header.`,
      );
    }

    if (
      (await page.getByTestId("pr-issue-link-icon").count()) !== 1 ||
      (await page.getByTestId("pr-sidebar-issue-link-icon").count()) !== 1
    ) {
      throw new Error(
        `${locale}/${theme} — the PR-to-issue association is not represented as a link in both headers.`,
      );
    }

    await page.getByTestId("pr-edit-title").hover();
    await page.getByRole("tooltip").waitFor({ state: "visible" });

    const checksBanner = page.getByTestId("pr-checks");
    await checksBanner.locator("button").first().click();
    const requiredCheck = checksBanner.locator('[data-testid="pr-check"][data-required="true"]');
    const optionalCheck = checksBanner.locator('[data-testid="pr-check"][data-required="false"]');
    if (
      (await requiredCheck.getByTestId("pr-check-requirement").count()) !== 1 ||
      (await optionalCheck.getByTestId("pr-check-requirement").count()) !== 0
    ) {
      throw new Error(
        `${locale}/${theme} — CI requiredness labels must appear only on required checks.`,
      );
    }

    const composerPlacement = await page
      .getByTestId("pr-comment-composer-region")
      .evaluate((region) => ({
        insideConversation: region.closest('[role="tabpanel"]') !== null,
        position: getComputedStyle(region).position,
        docked: region.classList.contains("dock-above-nav"),
      }));
    if (
      !composerPlacement.insideConversation ||
      composerPlacement.position === "fixed" ||
      composerPlacement.position === "sticky" ||
      composerPlacement.docked
    ) {
      throw new Error(
        `${locale}/${theme} — the conversation composer is still docked to the viewport.`,
      );
    }

    await page.getByTestId("pr-more-actions").click();
    const actionIds = [
      "pr-action-numo-request",
      "pr-action-numo-review",
      "pr-action-approve",
      "pr-action-comment",
      "pr-action-convert-to-draft",
      "pr-action-close",
    ];
    const actionTops = [];
    for (const id of actionIds) {
      const box = await page.getByTestId(id).boundingBox();
      if (!box) throw new Error(`${locale}/${theme} — overflow action ${id} is missing.`);
      actionTops.push(box.y);
    }
    if (!actionTops.every((top, index) => index === 0 || top > actionTops[index - 1])) {
      throw new Error(
        `${locale}/${theme} — overflow actions are not grouped Numo, review, then PR state.`,
      );
    }
    if ((await page.getByRole("menu").locator('[role="separator"]').count()) !== 2) {
      throw new Error(
        `${locale}/${theme} — overflow action sections are not separated correctly.`,
      );
    }
    await page.getByTestId("pr-action-convert-to-draft").click();
    const openPullRequest = page.getByTestId("pr-ready-for-review");
    await openPullRequest.waitFor({ state: "visible" });
    if ((await page.getByTestId("pr-readiness-control").count()) !== 0) {
      throw new Error(
        `${locale}/${theme} — a draft still shows readiness instead of its open action.`,
      );
    }
    await openPullRequest.click();
    await page.getByTestId("pr-readiness-control").waitFor({ state: "visible" });
    for (const toast of await page.locator('[data-sonner-toast]').all()) {
      const close = toast.locator('[data-close-button]');
      if (await close.count()) await close.click();
    }

    const readinessControl = page.getByTestId("pr-readiness-control");
    await readinessControl.click();
    const readinessPopover = page.getByTestId("pr-readiness-popover");
    await readinessPopover.waitFor({ state: "visible" });
    if (
      (await readinessPopover
        .getByTestId("pr-readiness-condition-passed")
        .count()) < 3
    ) {
      throw new Error(
        `${locale}/${theme} — the readiness popover does not list passed conditions.`,
      );
    }
    if (await readinessPopover.getByTestId("pr-readiness-merge").isDisabled()) {
      throw new Error(
        `${locale}/${theme} — the ready PR cannot be merged from its readiness popover.`,
      );
    }
    const readinessTrigger = await readinessControl.evaluate((button) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const background = getComputedStyle(button).backgroundColor;
      if (context) {
        context.fillStyle = background;
        context.fillRect(0, 0, 1, 1);
      }
      return {
        state: button.getAttribute("data-state"),
        background,
        channels: context
          ? Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
          : null,
      };
    });
    if (
      readinessTrigger.state !== "open" ||
      !readinessTrigger.channels ||
      readinessTrigger.channels.every((channel) => channel > 235)
    ) {
      throw new Error(
        `${locale}/${theme} — the open readiness trigger lost its state color (${readinessTrigger.background}).`,
      );
    }
    await page.keyboard.press("Escape");

    await page
      .getByText("export type KeyHint", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    const embeddedSelection = await page.evaluate(() => {
      for (const host of document.querySelectorAll(".diff-selectable *")) {
        const root = host.shadowRoot;
        if (!root) continue;
        const line = [...root.querySelectorAll("[data-line]")].find((candidate) =>
          candidate.textContent?.includes("export type KeyHint"),
        );
        if (!line) continue;
        const nodes = [line, ...line.querySelectorAll("*")];
        return nodes.every((node) => getComputedStyle(node).userSelect !== "none");
      }
      return false;
    });
    if (!embeddedSelection) {
      throw new Error(
        `${locale}/${theme} — embedded review diff text still inherits user-select: none.`,
      );
    }

    const resolveConversation = page.getByTestId("resolve-conversation");
    await resolveConversation.waitFor({ state: "visible" });
    await resolveConversation.click();
    await resolveConversation.waitFor({ state: "detached" });

    // Files tab: designated by its rank, its wording is translated and carries
    // the file counter. This is the THIRD since a tab
    // “Commit” slipped between Conversation and Files — aim for
    // second opened the commits list, and the diff check failed
    // sans dire pourquoi.
    const filesTab = page.getByRole("tab").nth(2);
    await filesTab.click();
    if ((await filesTab.getAttribute("aria-selected")) !== "true") {
      throw new Error(
        `${locale}/${theme} — l'onglet Fichiers n'est pas sélectionné.`,
      );
    }

    // The diff is rendered by a parser: we expect a line of code, not the title
    // of the file — this is displayed before the patch is split into hunks.
    await page
      .getByText("export type KeyHint", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    const diffInspection = await page.evaluate(() => {
      const visit = (root) => {
        for (const line of root.querySelectorAll("[data-line]")) {
          if (line.textContent?.includes("export type KeyHint")) return line;
        }
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) {
            const found = visit(element.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      const line = visit(document);
      if (!line)
        return { selectable: false, hostBackground: null, hostChannels: null };
      const root = line.getRootNode();
      const range = document.createRange();
      range.selectNodeContents(line);
      const selection =
        root instanceof ShadowRoot && typeof root.getSelection === "function"
          ? root.getSelection()
          : window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const selected = selection?.toString() ?? "";
      selection?.removeAllRanges();
      const host = root instanceof ShadowRoot ? root.host : line;
      const background = host ? getComputedStyle(host).backgroundColor : null;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context && background) {
        context.fillStyle = background;
        context.fillRect(0, 0, 1, 1);
      }
      const hostChannels = context && background
        ? Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
        : null;
      return {
        selectable: selected.includes("export type KeyHint"),
        computedSelectable: [line, ...line.querySelectorAll("*")].every(
          (node) => getComputedStyle(node).userSelect !== "none",
        ),
        hostBackground: background,
        hostChannels,
      };
    });
    if (!diffInspection.selectable || !diffInspection.computedSelectable) {
      throw new Error(
        `${locale}/${theme} — diff code text cannot be selected and copied.`,
      );
    }
    await page.waitForTimeout(400);
    const renderedIdentifier = await page.evaluate(() => {
      const visit = (root) => {
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) {
            const found = visit(element.shadowRoot);
            if (found) return found;
          }
          if (
            element.hasAttribute("data-line") &&
            element.textContent?.trim() === "id: string;"
          ) {
            return element;
          }
        }
        return null;
      };
      const line = visit(document);
      if (!line) return null;
      const root = line.getRootNode();
      const identifierNode = [...line.childNodes].find(
        (child) => child.textContent?.trim().startsWith("id:") === true,
      );
      const element = identifierNode instanceof Element ? identifierNode : line;
      const color = getComputedStyle(element).webkitTextFillColor;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
      }
      return {
        color,
        colorScheme:
          root instanceof ShadowRoot
            ? getComputedStyle(root.host).colorScheme
            : null,
        componentScheme: document
          .querySelector('[data-testid="pr-diff-view"]')
          ?.getAttribute("data-color-scheme"),
        channels: context
          ? Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
          : null,
      };
    });
    if (
      renderedIdentifier?.colorScheme !== theme ||
      renderedIdentifier.componentScheme !== theme
    ) {
      throw new Error(
        `${locale}/${theme} — the diff renderer is using ${renderedIdentifier?.colorScheme ?? "no"} color scheme.`,
      );
    }
    if (theme === "dark") {
      const channels = diffInspection.hostChannels;
      if (
        !channels ||
        channels.reduce((sum, channel) => sum + channel, 0) / 3 > 120
      ) {
        throw new Error(
          `${locale}/${theme} — the diff shadow surface is not dark (${diffInspection.hostBackground}).`,
        );
      }
      if (
        !renderedIdentifier?.channels ||
        renderedIdentifier.channels.reduce((sum, channel) => sum + channel, 0) / 3 < 150
      ) {
        throw new Error(
          `${locale}/${theme} — unstyled diff identifiers are unreadable (${renderedIdentifier?.color}).`,
        );
      }
    }

    await page.mouse.move(120, 60);

    const check = await page.evaluate(
      ({ files, totals }) => {
        const main = document.querySelector("main");
        const text = main?.textContent || "";
        // The colors of the diff: we count the lines actually painted rather
        // than trusting a class.
        //
        // Two things changed under this control, and each made it
        // silently wrong — it rendered 0 on a perfectly colored diff.
        //
        // 1. The diff is rendered by `@pierre/diffs`, IN A SHADOW DOM
        // (see app/globals.css and its `--diffs-*` variables).
        // `main.querySelectorAll` do not cross it: you have to go down
        // in the `shadowRoot` by hand. The Playwright locators
        // percent — hence the expectation of “export type KeyHint” which passed
        // while counting failed.
        // 2. The calculated colors are no longer in `rgb()`. The variables
        // `--diffs-*` are set to `oklch`, and `getComputedStyle` makes
        // then `oklab(0.627 -0.167 0.099 / 0.1)` or `lab(…)`: reading
        // of the triple by regular expression no longer recognized a
        // only color of the page. We therefore no longer parse anything — it is the
        // browser which converts, via a canvas, and that will be valid for the
        //    prochaine notation qu'il adoptera.
        const everyElement = (root, out = []) => {
          for (const el of root.querySelectorAll("*")) {
            out.push(el);
            if (el.shadowRoot) everyElement(el.shadowRoot, out);
          }
          return out;
        };
        const ctx = document.createElement("canvas").getContext("2d", {
          willReadFrequently: true,
        });
        const toRgba = (color) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return ctx.getImageData(0, 0, 1, 1).data;
        };
        const painted = everyElement(main ?? document).filter((el) => {
          const [r, g, b, a] = toRgba(getComputedStyle(el).backgroundColor);
          if (a === 0) return false;
          // A clear green or red: one component clearly dominates.
          return (g > r + 12 && g > b + 12) || (r > g + 12 && r > b + 12);
        }).length;
        return {
          missingFiles: files.filter((f) => !text.includes(f)),
          painted,
          hasTotals:
            text.includes(`+${totals.additions}`) ||
            text.includes(String(totals.additions)),
        };
      },
      { files: FILES.map((f) => f.filename), totals: TOTALS },
    );

    if (check.missingFiles.length > 0) {
      throw new Error(
        `${locale}/${theme} — fichier(s) absent(s) du diff : ${check.missingFiles.join(", ")}`,
      );
    }
    if (check.painted < 10) {
      throw new Error(
        `${locale}/${theme} — seulement ${check.painted} ligne(s) colorée(s) : le diff ne ` +
          `se lit pas comme un diff. Un patch mal formé n'est pas découpé en hunks.`,
      );
    }
    if (unexpected.length > 0) {
      throw new Error(
        `${locale}/${theme} — route(s) de PR non prévue(s) par le fixture : ` +
          `${[...new Set(unexpected)].join(", ")}. Ajoute-les à serveFixture, sinon la ` +
          `capture appelle la forge pour de vrai.`,
      );
    }
    if (served.length < 3) {
      throw new Error(
        `${locale}/${theme} — ${served.length} lecture(s) servie(s) au lieu de 3 : ` +
          `la page a peut-être appelé la forge pour de vrai. Servies : ${served.join(", ")}`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return {
      path,
      locale,
      theme,
      painted: check.painted,
      served: served.length,
    };
  } finally {
    await browser.close();
  }
}

console.log(
  `PR #${PR_NUMBER} (${PR_ID}, run ${RUN_ID}) · ${FILES.length} fichiers · ` +
    `+${TOTALS.additions} −${TOTALS.deletions} (mêmes totaux que la capture agent)\n`,
);

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(
    `  ${r.locale}/${r.theme} → ${r.path} · ${r.painted} lignes colorées · ${r.served} lectures servies`,
  );
  results.push(r);
}

if (PUBLISH) {
  console.log("\nLivraison sur la landing :");
  for (const { locale, theme, path } of results) {
    const published = await publishShot({
      slot: SLOT,
      lang: locale,
      theme,
      input: path,
    });
    console.log(
      `  ${published.name} — ${(published.bytes / 1024).toFixed(0)} Ko`,
    );
  }
  const { published } = await writeManifest();
  console.log(`\nManifeste : ${published.length} variante(s) publiée(s).`);
} else {
  console.log(
    "\nRegarde les images, puis relance avec --publish pour les livrer.",
  );
}
