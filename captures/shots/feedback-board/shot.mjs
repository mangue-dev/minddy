/**
 * feedbackBoard — le board public d'Aurora, vu par un visiteur déconnecté.
 *
 * Voir `intent.md`, notamment pour la « réponse d'équipe dépliée » du
 * catalogue : la liste du board n'en rend aucune, c'est la page d'un retour
 * qui la porte.
 *
 *   node captures/shots/feedback-board/shot.mjs             # produit les PNG
 *   node captures/shots/feedback-board/shot.mjs --publish   # + livre
 */
import { openPage, settle, shoot, CAPTURE } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "feedbackBoard";
const OUT = "captures/shots/feedback-board/out";
const BOARD = "/f/CTxGSyqeTTB85z8crWBwyw";
const VIEWPORT = { width: 1736, height: 1085 };

/** Les retours attendus, du plus voté au moins voté. Titres = données. */
const TOP = [
  { title: "Let me use my own domain for the status page", votes: 24 },
  { title: "Slack alerts when an incident opens", votes: 18 },
  { title: "The uptime percentage is wrong after a partial outage", votes: 15 },
];

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

async function capture({ locale, theme }) {
  // DÉCONNECTÉ : connecté, l'en-tête montrerait l'identité du visiteur et la
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

    // Le dernier retour de la liste prouve qu'elle est rendue en entier, pas
    // seulement sa tête.
    await page
      .getByText("An RSS feed of incidents", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    const check = await page.evaluate((top) => {
      const text = document.body.textContent || "";
      const items = [...document.querySelectorAll("main li")];
      return {
        missing: top.filter((p) => !text.includes(p.title)).map((p) => p.title),
        // Le tri par votes est le sujet : le premier retour doit être le plus voté.
        firstIsTop: (items[0]?.textContent || "").includes(top[0].title),
        votes: top.filter((p) => !text.includes(String(p.votes))).map((p) => p.votes),
        count: items.length,
        // Un visiteur déconnecté ne doit voir aucune trace de compte.
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
