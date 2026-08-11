import "server-only";

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

/** La page entière en markdown, en-tête (titre + icône) compris. */
export async function pageToMarkdownServer(page: {
  title: string;
  icon: string | null;
  content: JSONContent | null;
}): Promise<string> {
  await ensurePageDom();
  const { pageToMarkdown } = await import("@/lib/pages-markdown");
  return pageToMarkdown(page);
}

/** Le corps seul en markdown — pour une surface qui a déjà le titre. */
export async function pageBodyToMarkdownServer(
  content: JSONContent | null
): Promise<string> {
  await ensurePageDom();
  const { bodyToMarkdown } = await import("@/lib/pages-markdown");
  return bodyToMarkdown(content);
}

/** Le markdown relu en page : titre, icône, corps ProseMirror. */
export async function markdownToPageServer(markdown: string): Promise<{
  title: string;
  icon: string | null;
  content: JSONContent | null;
}> {
  await ensurePageDom();
  const { markdownToPage } = await import("@/lib/pages-markdown");
  return markdownToPage(markdown);
}

/** Le corps seul, relu depuis du markdown. */
export async function bodyFromMarkdownServer(
  markdown: string
): Promise<JSONContent> {
  await ensurePageDom();
  const { bodyFromMarkdown } = await import("@/lib/pages-markdown");
  return bodyFromMarkdown(markdown);
}
