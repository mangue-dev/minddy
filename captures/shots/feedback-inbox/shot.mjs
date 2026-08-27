/**
 * feedbackInbox — feedback seen on the team side, with its suggestion of a merge.
 *
 * See `intent.md`: it’s “Can we get notified in Slack?” » that we open, and
 * not another — the merger suggestion only exists on that one.
 *
 * node captures/shots/feedback-inbox/shot.mjs # produces the PNGs
 *   node captures/shots/feedback-inbox/shot.mjs --publish   # + livre
 */
import { openPage, settle, shoot, CAPTURE, CAPTURE_VARIANTS } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "feedbackInbox";
const OUT = "captures/shots/feedback-inbox/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";
const VIEWPORT = { width: 1736, height: 1085 };

/** The return which carries the suggestion of fusion. Title = data, therefore bilingual. */
const POST = "Can we get notified in Slack?";
const MERGE_TARGET = "Slack alerts when an incident opens";

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = CAPTURE_VARIANTS;

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}/feedback`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page, { expect: `text=${MERGE_TARGET}` });

    await page.getByText(POST, { exact: false }).first().click();

    // The merge banner renders WITH the detail, not with the list: without
    // this wait we photograph the return without what justifies it. THE
    // percentage is a given (0.91), therefore a valid anchor in FR as in EN.
    await page.getByText("91", { exact: false }).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });

    await page.mouse.move(880, 60);
    await page.waitForTimeout(400);

    const check = await page.evaluate(
      ({ post, target }) => {
        const main = document.querySelector("main");
        const text = main?.textContent || "";
        return {
          hasPost: text.includes(post),
          hasSuggestion: text.includes(target) && /91\s*%/.test(text),
          // The demo pattern has nothing more to do here (see 011-votants-emails).
          leaksDemoEmail: /captures-demo/.test(text),
          votes: /(^|\D)5(\D|$)/.test(text),
        };
      },
      { post: POST, target: MERGE_TARGET },
    );

    if (!check.hasPost) {
      throw new Error(`${locale}/${theme} — « ${POST} » n'est pas ouvert.`);
    }
    if (!check.hasSuggestion) {
      throw new Error(
        `${locale}/${theme} — la suggestion de fusion (91 %) est absente : ` +
          `c'est pourtant ce que cet emplacement doit montrer. Vérifier que ` +
          `les colonnes d'analyse du retour sont toujours renseignées.`,
      );
    }
    if (check.leaksDemoEmail) {
      throw new Error(
        `${locale}/${theme} — une adresse « captures-demo » s'affiche à l'écran. ` +
          `Relancer captures/world/seed/011-votants-emails.mjs.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · fusion suggérée à 91 %`);
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
