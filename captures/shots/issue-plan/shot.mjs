/**
 * workflowIssue — AUR-2 ouvert sur son plan d'implémentation.
 *
 * Voir `intent.md` : la consigne du catalogue décrit une page de détail qui
 * n'existe pas, et une vue « description + plan » que les onglets rendent
 * impossible. On photographie l'onglet Plan, qui est ce que la landing décrit.
 *
 *   node captures/shots/issue-plan/shot.mjs             # produit les PNG
 *   node captures/shots/issue-plan/shot.mjs --publish   # + livre sur la landing
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

/**
 * Débranché de la landing depuis le 2026-07-26 : `workflowIssue` est servi par
 * `shots/issue-create`. Le drapeau est lu par `publish.mjs --shots`, qui saute
 * ce dossier — sans lui, l'ordre du disque déciderait laquelle des deux images
 * part en production. Voir `intent.md`.
 */
const RETIRED = true;

const SLOT = "workflowIssue";
const OUT = "captures/shots/issue-plan/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/**
 * 4/3, le rapport du cadre — obligatoire : `<ScreenshotSlot>` rend l'image en
 * `object-cover`, et une capture 16/10 y perdrait 145 px sur la droite, soit le
 * tiers du panneau. La hauteur reste celle des autres captures ; c'est la
 * largeur qui cède. Voir `intent.md`.
 */
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * Ancres de contenu : des chemins de fichiers écrits dans le plan. Ce sont des
 * DONNÉES, donc identiques en français et en anglais — contrairement à « À
 * faire » ou « terminée », qui casseraient une variante sur deux.
 */
const PLAN_ANCHORS = [
  "lib/palette/actions.ts",
  "components/palette/row.tsx",
  "components/palette/provider.tsx",
];

const PUBLISH = process.argv.includes("--publish");

// `workflowIssue` est servi par `shots/issue-create` depuis le 2026-07-26 — voir
// `intent.md`. Ce script vise donc le MÊME emplacement qu'un autre, et publier
// écraserait la modale de création par le plan, sans un mot. Produire les PNG
// reste permis : le script est gardé en état de marche, seul le raccordement à
// la landing est coupé.
if (PUBLISH) {
  console.error(
    "captures: `issue-plan` n'alimente plus la landing.\n" +
      "L'emplacement `workflowIssue` est servi par `captures/shots/issue-create`, et\n" +
      "publier d'ici l'écraserait. Pour remettre le plan sur la page, il lui faut son\n" +
      "propre emplacement dans screenshot-slots.ts — voir intent.md.",
  );
  process.exit(1);
}
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

async function capture({ locale, theme }) {
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-1" });

    // Le board est le décor : on le veut complet avant d'ouvrir le panneau. Sa
    // barre d'onglets arrive par une requête séparée, plus tard que les cartes.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Ouvrir le ticket comme un utilisateur : en cliquant sa carte. L'ancre est
    // l'identifiant, pas un titre — il ne dépend d'aucune traduction.
    await page.getByText("AUR-2", { exact: true }).first().click();
    const panel = page.getByRole("dialog").first();
    await panel.waitFor({ state: "visible", timeout: 10_000 });

    // Le panneau s'ouvre toujours sur Description (initialTab). L'onglet Plan
    // se désigne par son RANG : son libellé porte le compteur « 2/6 » collé.
    const planTab = page.getByRole("tab").nth(1);
    await planTab.click();
    await planTab.waitFor({ state: "visible" });

    if ((await planTab.getAttribute("aria-selected")) !== "true") {
      throw new Error(`${locale}/${theme} — l'onglet Plan n'est pas sélectionné.`);
    }

    // Le curseur reste sur l'onglet après le clic : on le pose sur le voile, qui
    // n'a aucun état de survol, pour ne pas allumer une ligne de tâche.
    await page.mouse.move(400, 1200);

    // Contrôle du CONTENU : les tâches nomment-elles vraiment des fichiers ?
    const check = await page.evaluate((anchors) => {
      const dialog = document.querySelector('[role="dialog"]');
      const text = dialog?.textContent || "";
      // Le barré est posé sur le CONTENEUR de la tâche, pas sur son texte : en
      // CSS la décoration se propage à l'affichage mais pas au style calculé
      // des descendants. On interroge donc les conteneurs.
      const struck = [...(dialog?.querySelectorAll("*") || [])].filter(
        (el) =>
          el.textContent.trim() &&
          getComputedStyle(el).textDecorationLine.includes("line-through"),
      ).length;
      return {
        missing: anchors.filter((a) => !text.includes(a)),
        // Sans limite de mot : `textContent` recolle les nœuds voisins, et le
        // compteur de l'onglet sort en « Plan2/6 ».
        progress: /2\s*\/\s*6/.test(text),
        struck,
      };
    }, PLAN_ANCHORS);

    if (check.missing.length > 0) {
      throw new Error(
        `${locale}/${theme} — le plan ne montre pas ${check.missing.join(", ")}. ` +
          `L'onglet affiché n'est pas le bon, ou le plan d'AUR-2 a changé.`,
      );
    }
    if (!check.progress) {
      throw new Error(
        `${locale}/${theme} — le compteur « 2/6 » est absent : la progression du ` +
          `plan ne se lit pas, c'est pourtant ce que l'image doit prouver.`,
      );
    }
    if (check.struck === 0) {
      throw new Error(
        `${locale}/${theme} — aucune tâche barrée : les états des tâches ne se ` +
          `distinguent pas à l'œil.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme, struck: check.struck };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · plan 2/6 · ${r.struck} tâche(s) barrée(s)`);
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
