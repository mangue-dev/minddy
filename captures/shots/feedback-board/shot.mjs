/**
 * feedbackBoard — Aurora's public board, viewed by a disconnected visitor.
 *
 * See `intent.md`, especially for the “unfolded team response” of the
 * catalog: the board list does not show any, it is a return page
 * who wears it.
 *
 * node captures/shots/feedback-board/shot.mjs # produces the PNGs
 *   node captures/shots/feedback-board/shot.mjs --publish   # + livre
 */
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "feedbackBoard";
const OUT = "captures/shots/feedback-board/out";
const BOARD = "/f/CTxGSyqeTTB85z8crWBwyw";
const VIEWPORT = { width: 1736, height: 1085 };

/** The expected returns, from the most voted to the least voted. Titles = data. */
const TOP = [
  { title: "Let me use my own domain for the status page", votes: 24 },
  { title: "Slack alerts when an incident opens", votes: 18 },
  { title: "The uptime percentage is wrong after a partial outage", votes: 15 },
];

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

async function capture({ locale, theme }) {
  // DISCONNECTED: When logged in, the header would show the visitor's identity and
  // page n'aurait plus l'air publique.
  const { browser, page } = await openPage({
    theme,
    locale,
    viewport: VIEWPORT,
    authed: false,
  });
  try {
    await page.goto(`${CAPTURE.baseUrl}${BOARD}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: `text=${TOP[0].title}` });

    // The last return of the list proves that it is rendered in full, not
    // only his head.
    await page
      .getByText("An RSS feed of incidents", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    const check = await page.evaluate((top) => {
      const text = document.body.textContent || "";
      const items = [...document.querySelectorAll("main li")];
      return {
        missing: top.filter((p) => !text.includes(p.title)).map((p) => p.title),
        // Sorting by votes is the subject: the first return must be the most voted.
        firstIsTop: (items[0]?.textContent || "").includes(top[0].title),
        votes: top.filter((p) => !text.includes(String(p.votes))).map((p) => p.votes),
        count: items.length,
        // A logged out visitor should not see any trace of an account.
        leaksSession: text.includes("Camille") || /captures-demo/.test(text),
      };
    }, TOP);

    if (check.missing.length > 0) {
      throw new Error(`${locale}/${theme} — retour(s) absent(s) : ${check.missing.join(", ")}`);
    }
    if (!check.firstIsTop) {
      throw new Error(
        `${locale}/${theme} — le board n'est pas trié par votes : le retour le plus ` +
          `voté n'est pas en tête. L'image ne montrerait pas ce qu'elle doit montrer.`,
      );
    }
    if (check.votes.length > 0) {
      throw new Error(
        `${locale}/${theme} — compteur(s) de votes absent(s) : ${check.votes.join(", ")}`,
      );
    }
    if (check.count < 8) {
      throw new Error(`${locale}/${theme} — ${check.count} retours affichés, 8 attendus.`);
    }
    if (check.leaksSession) {
      throw new Error(
        `${locale}/${theme} — une identité de compte s'affiche sur une page publique : ` +
          `la capture n'est pas partie déconnectée.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, count: check.count };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · ${r.count} retours, triés par votes`);
  results.push(r);
}

if (PUBLISH) {
  console.log("\nLivraison sur la landing :");
  for (const { locale, theme, path } of results) {
    const published = await publishShot({ slot: SLOT, lang: locale, theme, input: path });
    console.log(`  ${published.name} — ${(published.bytes / 1024).toFixed(0)} Ko`);
  }
  const { published } = await writeManifest();
  console.log(`\nManifeste : ${published.length} variante(s) publiée(s).`);
} else {
  console.log("\nRegarde les images, puis relance avec --publish pour les livrer.");
}
