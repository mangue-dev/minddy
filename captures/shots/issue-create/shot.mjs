/**
 * workflowIssue — la modale de création, remplie avec AUR-2, avant le clic.
 *
 * Voir `intent.md` : cette capture a remplacé l'onglet Plan
 * (`shots/issue-plan`), qui montrait le travail de l'agent sous une légende
 * annonçant celui de l'utilisateur.
 *
 *   node captures/shots/issue-create/shot.mjs             # produit les PNG
 *   node captures/shots/issue-create/shot.mjs --publish   # + livre sur la landing
 */
import { openPage, settle, shoot, CAPTURE, DEFAULT_VIEW_NAMES } from "../../lib/browser.mjs";
import { publishShot, writeManifest } from "../../lib/publish.mjs";

const SLOT = "workflowIssue";
const OUT = "captures/shots/issue-create/out";
const AURORA = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/** 4/3, le rapport du cadre. Règle commune aux cinq emplacements 4/3. */
const VIEWPORT = { width: 1447, height: 1085 };

/**
 * Le ticket saisi est AUR-2, mot pour mot : le run de l'agent et la pull request
 * photographiés dans les deux temps suivants portent le MÊME ticket. Ce sont
 * aussi des données — donc identiques en français et en anglais, et à ce titre
 * les seules ancres de vérification qui ne cassent pas une variante sur deux.
 */
const ISSUE = {
  title: "Add keyboard shortcuts to the command palette",
  description:
    "Power users live in the palette but still reach for the mouse to run an action. " +
    "Show the shortcut next to each row, and make it work from anywhere in the app.",
  category: "Feature",
  effort: "M",
};

/**
 * Libellés accessibles de la rangée de propriétés, et le seul libellé d'option
 * qui soit traduit (la priorité — les efforts sont des lettres, les catégories
 * des données). Les raccourcis clavier S/P/E/L auraient évité cette table, mais
 * ils sont filtrés tant que le focus est dans le titre ou la description.
 */
const ARIA = {
  fr: {
    dialog: "Nouveau ticket",
    priority: "Changer la priorité",
    effort: "Changer l'effort",
    categories: "Modifier les catégories",
    highPriority: "Haute",
  },
  en: {
    dialog: "New issue",
    priority: "Change priority",
    effort: "Change effort",
    categories: "Edit categories",
    highPriority: "High",
  },
};

/**
 * Vrai tant qu'une surcouche flottante (sélecteur ouvert, infobulle) occupe
 * l'écran. Toutes passent par le même conteneur Radix, ce qui donne un seul
 * invariant pour la prise : RIEN ne flotte au-dessus de la modale.
 *
 * Le seuil de 8 px écarte le doublon de 1 × 1 que Radix laisse dans le DOM pour
 * les lecteurs d'écran — il porte `role="tooltip"` sans rien afficher, et
 * l'interroger par ce rôle rendait le contrôle toujours vrai.
 */
const FLOATING = () =>
  [...document.querySelectorAll("[data-radix-popper-content-wrapper]")].some(
    (el) => el.getBoundingClientRect().width > 8,
  );

/** Attend que plus rien ne flotte. Silencieux : le contrôle final tranche. */
async function settleOverlays(page) {
  await page.waitForFunction(FLOATING_SOURCE, undefined, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

/** `waitForFunction` évalue dans la page : la fonction y part en source. */
const FLOATING_SOURCE = `() => !(${FLOATING.toString()})()`;

const PUBLISH = process.argv.includes("--publish");
const VARIANTS = [
  { locale: "fr", theme: "light" },
  { locale: "fr", theme: "dark" },
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
];

async function capture({ locale, theme }) {
  const words = ARIA[locale];
  const { browser, page } = await openPage({ theme, locale, viewport: VIEWPORT });
  try {
    await page.goto(`${CAPTURE.baseUrl}/projects/${AURORA}`, { waitUntil: "domcontentloaded" });
    await settle(page, { expect: "text=AUR-1" });

    // Le board est le décor : on le veut complet avant d'ouvrir la modale. Sa
    // barre d'onglets arrive par une requête séparée, plus tard que les cartes.
    await page
      .getByRole("button", { name: DEFAULT_VIEW_NAMES[locale], exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    // `c` — le raccourci de création, global (lib/create-context.tsx).
    await page.keyboard.press("c");
    const dialog = page.getByRole("dialog", { name: words.dialog });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // Le champ titre est `autoFocus` : on tape directement dedans.
    await page.keyboard.type(ISSUE.title, { delay: 6 });

    // La description est un éditeur ProseMirror, pas un textarea : on y entre
    // au clic, sinon la frappe continue d'arriver dans le titre.
    const editor = dialog.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(ISSUE.description, { delay: 3 });

    // ── Les propriétés ──────────────────────────────────────────────────────
    // La liste est reconstruite par cmdk au moment où elle s'ouvre : cliquer sur
    // l'option dès qu'elle apparaît tombe une fois sur deux sur un nœud déjà
    // détaché. On attend donc la liste, PUIS l'option.
    const pick = async (trigger, option) => {
      await dialog.getByRole("button", { name: trigger }).click();
      const list = page.getByRole("listbox").last();
      await list.waitFor({ state: "visible", timeout: 10_000 });
      const item = list.getByRole("option", { name: option, exact: true });
      await item.waitFor({ state: "visible", timeout: 10_000 });
      await item.click();
    };

    // Les catégories D'ABORD : c'est un multi-select, il reste ouvert après la
    // sélection et doit être refermé à la main. Les deux suivants se referment
    // seuls, donc rien ne traîne au moment de la prise.
    await pick(words.categories, ISSUE.category);
    await page.keyboard.press("Escape");
    if (!(await dialog.isVisible())) {
      throw new Error(
        `${locale}/${theme} — l'Échap qui devait fermer le sélecteur de catégories ` +
          `a fermé la modale. Le popover n'était donc pas ouvert au moment de la touche.`,
      );
    }

    await pick(words.priority, words.highPriority);
    await pick(words.effort, ISSUE.effort);

    // ── Éteindre tout ce qui flotte ─────────────────────────────────────────
    // Deux surcouches se disputent le milieu de la modale, et l'ordre compte.
    //
    // 1. Le sélecteur ne se ferme pas dans la foulée du clic, et en se fermant
    //    il REND LE FOCUS à son déclencheur.
    // 2. Ce déclencheur porte une infobulle qui affiche son raccourci clavier
    //    (« Effort E ») — ce que la landing ne dit plus, imprimé en plein
    //    milieu de l'image. Elle s'ouvre au focus autant qu'au survol.
    //
    // D'où la séquence : attendre la fermeture, PUIS relâcher le focus, PUIS
    // sortir le curseur. Relâcher avant que le popover se ferme ne sert à rien,
    // sa restitution de focus rallume l'infobulle juste après.
    await settleOverlays(page);
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(60, 1000);
    await settleOverlays(page);

    // ── Contrôles ───────────────────────────────────────────────────────────
    const check = await dialog.evaluate((el, { title, description, category }) => {
      const text = el.textContent || "";
      const titleField = el.querySelector("textarea");
      const submit = [...el.querySelectorAll("button")].find(
        (b) => b.type === "submit",
      );
      return {
        // La première phrase suffit : ProseMirror peut recouper les nœuds.
        hasTitle: (titleField?.value || "").includes(title),
        hasDescription: text.includes(description.split(". ")[0]),
        hasCategory: text.includes(category),
        // Sélecteur ouvert ou infobulle survivante : les deux se
        // photographieraient par-dessus la modale.
        floating: [
          ...document.querySelectorAll("[data-radix-popper-content-wrapper]"),
        ]
          .filter((f) => f.getBoundingClientRect().width > 8)
          .map((f) => (f.textContent || "").trim().slice(0, 30)),
        submitEnabled: !!submit && !submit.disabled,
      };
    }, ISSUE);

    if (!check.hasTitle) {
      throw new Error(
        `${locale}/${theme} — le titre n'est pas dans le champ. La frappe est ` +
          `partie ailleurs : la modale n'avait pas le focus, ou elle n'était pas ouverte.`,
      );
    }
    if (!check.hasDescription) {
      throw new Error(
        `${locale}/${theme} — la description est absente. Le clic dans l'éditeur ` +
          `ProseMirror n'a pas pris, la frappe est restée dans le titre.`,
      );
    }
    if (!check.hasCategory) {
      throw new Error(
        `${locale}/${theme} — la catégorie « ${ISSUE.category} » n'apparaît pas. ` +
          `Les catégories du projet de démo ne sont plus en anglais ?`,
      );
    }
    if (check.floating.length > 0) {
      throw new Error(
        `${locale}/${theme} — une surcouche flotte encore au-dessus de la modale : ` +
          `${check.floating.map((f) => `« ${f} »`).join(", ")}. Sélecteur resté ouvert, ` +
          `ou infobulle rallumée par la restitution de focus.`,
      );
    }
    if (!check.submitEnabled) {
      throw new Error(
        `${locale}/${theme} — le bouton de création est désactivé. L'image montrerait ` +
          `un formulaire qu'on ne peut pas envoyer, ce que la légende contredit.`,
      );
    }

    const path = `${OUT}/${locale}-${theme}.png`;
    await shoot(page, path);
    return { path, locale, theme };
  } finally {
    // Rien n'a été soumis : le contexte meurt avec le brouillon local.
    await browser.close();
  }
}

const results = [];
for (const variant of VARIANTS) {
  const r = await capture(variant);
  console.log(`  ${r.locale}/${r.theme} → ${r.path} · titre + 2 phrases · haute / M / Feature`);
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
