import "server-only";

import { createRequire } from "node:module";
import path from "node:path";

import type { JSONContent } from "@tiptap/core";

/**
 * La projection markdown des pages, MONTABLE DANS UNE FONCTION SERVEUR (MIN-273).
 *
 * `lib/pages-markdown.ts` fait tout le travail, et le dit lui-même : il suppose
 * un DOM (`window.DOMParser`, `document.createElement`), parce que tiptap lit le
 * markdown en passant par du HTML et qu'un éditeur — même sans une ligne de
 * rendu — se monte sur un élément. Dans un navigateur et sous jsdom, il est là.
 * Dans une fonction Vercel, il n'y a rien.
 *
 * Ce module est ce « rien » comblé, une fois pour toutes : il installe un DOM
 * jsdom sur les globales au premier appel, puis rend la projection en async. Les
 * six outils de page (MCP, Numo, agent de code) passent tous par ici — un
 * deuxième chemin serait un deuxième DOM, donc deux comportements pour une même
 * page.
 *
 * Pourquoi jsdom et pas un DOM minimal écrit à la main : le sens LECTURE
 * traverse `DOMParser` puis le `parseHTML` de chaque nœud du registre (le
 * dépliant et la sous-page se projettent en HTML, cf. `Markdown.configure({
 * html: true })`). Un faux DOM qui couvre « la plupart » des cas se rate
 * justement sur les blocs riches, c'est-à-dire sur ce que MIN-269 promet de ne
 * pas perdre. jsdom, lui, est exactement ce que joue le test d'aller-retour.
 *
 * L'installation est GLOBALE et non annulée : jsdom monte une fenêtre par
 * process, réutilisée par tous les appels. La détruire entre deux projections
 * coûterait le montage à chaque page lue, pour rien — le document, lui, est
 * jetable et créé par appel (cf. `pageEditor`).
 *
 * ⚠️ **jsdom est bloqué en 26.x, et ce n'est pas de la paresse de mise à jour.**
 * La fonction Vercel tourne sur Node 24, mais lancé avec
 * `--no-experimental-require-module` : l'interop `require()` d'un module ESM y
 * est COUPÉE (relevé sur `process.execArgv`, en production). Or jsdom 27+ a fait
 * passer des dépendances en ESM-only (`@exodus/bytes` via
 * `html-encoding-sniffer@6`, `@csstools/css-calc` via `@asamuzakjp/css-color`) :
 * le `require` interne de jsdom lève `ERR_REQUIRE_ESM`, et l'`import()`
 * ci-dessous échoue en bloc. Ça n'a AUCUN symptôme en local — le loader de Vite
 * et le Node du poste chargent très bien jsdom 30 — et ça casse en production
 * toute écriture de page, sur les quatre surfaces à la fois.
 * `lib/server/pages-projection-loadable.test.ts` rejoue la condition exacte :
 * s'il tombe, c'est la version de jsdom qu'il faut redescendre, pas le test.
 *
 * ⚠️ **Et `lib/pages-markdown.ts` n'est PAS importé — il est chargé par chemin,
 * depuis un bundle esbuild à part.** Deuxième piège de build, cousin du premier
 * (MIN-295) : le bundler de Next substitue `typeof window` → `"undefined"` côté
 * serveur, ce qui réduit `elementFromString` de `@tiptap/core` à un `throw`
 * inconditionnel. Le DOM installé plus bas n'y peut rien — la décision est prise
 * à la COMPILATION, avant que jsdom n'existe. Voir `scripts/build-pages-md.mjs`,
 * qui porte la mesure et les deux routes écartées.
 */

let installing: Promise<void> | null = null;

/**
 * Les globales à poser. Tout ce qui commence par une majuscule vient des
 * constructeurs du DOM (`DOMParser`, `Node`, `Element`, `MutationObserver`,
 * `Range`…) : les copier en bloc évite d'en découvrir un manquant par une
 * exception à la première page qui porte un dépliant. Le reste est nommé, parce
 * qu'y copier `window` en entier ferait atterrir `close`, `name`, `length` et
 * `top` sur `globalThis`, où ils ne veulent rien dire.
 */
const LOWERCASE_GLOBALS = [
  "document",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

async function installDom(): Promise<void> {
  // Un navigateur, ou un test sous jsdom : le DOM est déjà là, on n'y touche pas.
  if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
    return;
  }

  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://minddy.app/",
  });
  const win = dom.window as unknown as Record<string, unknown>;
  const target = globalThis as unknown as Record<string, unknown>;

  const put = (key: string, bind: boolean) => {
    if (key in target && target[key] !== undefined) return;
    const value = win[key];
    if (value === undefined) return;
    target[key] =
      bind && typeof value === "function" ? (value as () => void).bind(win) : value;
  };

  target.window = win;
  // Les CONSTRUCTEURS se posent tels quels, jamais liés : une fonction liée perd
  // les propriétés statiques de sa cible, et `Node.TEXT_NODE` deviendrait
  // `undefined`. tiptap-markdown compare justement `nextSibling?.nodeType` à
  // cette constante — avec `undefined` des deux côtés, un `nextSibling` absent
  // passe pour un nœud texte, et la lecture du markdown tombe une ligne plus bas.
  for (const key of Object.getOwnPropertyNames(win)) {
    if (/^[A-Z]/.test(key)) put(key, false);
  }
  for (const key of LOWERCASE_GLOBALS) put(key, true);
}

/** Le DOM en place, quel que soit le nombre d'appels concurrents. */
export function ensurePageDom(): Promise<void> {
  installing ??= installDom();
  return installing;
}

/* ── La projection, chargée par CHEMIN ────────────────────────────────── */

/** Ce que le bundle expose — la surface de `lib/pages-markdown.ts`, à la lettre. */
type PagesMarkdown = typeof import("@/lib/pages-markdown");

/**
 * Où le bundle est lu. Produit par `prebuild` et `predev`
 * (`scripts/build-pages-md.mjs`), embarqué dans les fonctions par
 * `outputFileTracingIncludes` (next.config.mjs), et construit avant la suite par
 * le `globalSetup` de vitest.
 */
const BUNDLE_PATH = path.join(process.cwd(), ".pages-md", "main.js");

/**
 * `createRequire` plutôt qu'un `import()` : c'est le seul appel que le bundler
 * ne peut pas suivre. Un `import()` d'un chemin calculé le ferait quand même
 * essayer, et surtout un `import()` de ce module-ci le ramènerait dans le
 * graphe — donc sous la substitution qu'on cherche précisément à fuir.
 */
const requireFromRepo = createRequire(path.join(process.cwd(), "noop.js"));

let bundle: PagesMarkdown | null = null;

/**
 * Le bundle chargé, une fois par instance de fonction.
 *
 * **Pas de repli sur `import("@/lib/pages-markdown")` si le fichier manque**, et
 * c'est le cœur du correctif : ce repli est exactement le code mort de MIN-295.
 * Il rendrait la panne silencieuse au premier oubli de câblage — un `prebuild`
 * qui saute, une ligne de `outputFileTracingIncludes` perdue dans un refactor —
 * et on reviendrait à un wiki qu'aucun agent ne peut écrire, sans rien dans les
 * logs qui le dise. Une erreur qui nomme le script à lancer vaut mieux.
 */
function pagesMarkdown(): PagesMarkdown {
  if (bundle) return bundle;
  try {
    bundle = requireFromRepo(BUNDLE_PATH) as PagesMarkdown;
  } catch (err) {
    throw new Error(
      `bundle de la projection des pages introuvable à ${BUNDLE_PATH} — lancer \`npm run build:pages-md\` (câblé en \`prebuild\` et \`predev\`) : ${(err as Error).message}`
    );
  }
  return bundle;
}

/** Le DOM posé ET la projection chargée — le préalable de toutes les surfaces. */
async function projection(): Promise<PagesMarkdown> {
  await ensurePageDom();
  return pagesMarkdown();
}

/** La page entière en markdown, en-tête (titre + icône) compris. */
export async function pageToMarkdownServer(page: {
  title: string;
  icon: string | null;
  content: JSONContent | null;
}): Promise<string> {
  return (await projection()).pageToMarkdown(page);
}

/** Le corps seul en markdown — pour une surface qui a déjà le titre. */
export async function pageBodyToMarkdownServer(
  content: JSONContent | null
): Promise<string> {
  return (await projection()).bodyToMarkdown(content);
}

/** Le markdown relu en page : titre, icône, corps ProseMirror. */
export async function markdownToPageServer(markdown: string): Promise<{
  title: string;
  icon: string | null;
  content: JSONContent | null;
}> {
  return (await projection()).markdownToPage(markdown);
}

/** Le corps seul, relu depuis du markdown. */
export async function bodyFromMarkdownServer(
  markdown: string
): Promise<JSONContent> {
  return (await projection()).bodyFromMarkdown(markdown);
}
