/**
 * Lire le `<head>` d'une page distante sans se faire piéger par elle (MIN-336).
 *
 * Ce module analyse du HTML **choisi par un utilisateur**. La contrainte n'est
 * donc pas la justesse du parsing — un `<link>` mal formé n'est pas grave — mais
 * le **temps** : chaque fonction ici doit être linéaire en la taille de
 * l'entrée, quelle que soit cette entrée.
 *
 * Les regex qui vivaient ici ne l'étaient pas. `/<link\b[^>]*>/g` sur un
 * mégaoctet sans le moindre `>` repart d'un `[^>]*` complet à chaque `<link`
 * rencontré : 66 secondes d'event loop bloqué, sur une instance partagée par
 * tout le monde. `/<meta[^>]*property\s*=\s*["']og:title["'][^>]*>/` était pire
 * — deux `[^>]*` autour d'un littéral, un backtracking cubique, 25 secondes
 * pour 52 Ko.
 *
 * D'où la forme du code : des `indexOf` et des curseurs, pas de quantificateur
 * imbriqué. Un balayage, une seule fois, sans retour en arrière — et des bornes
 * explicites sur la longueur d'une balise et d'un titre, pour qu'une page
 * pathologique coûte le prix de sa taille et rien de plus.
 */

/** Au-delà, ce n'est plus une balise de `<head>` mais une charge. */
const MAX_TAG_LENGTH = 8 * 1024;
/** Un titre plus long que ça est tronqué : personne n'en lira la suite. */
const MAX_TITLE_LENGTH = 4 * 1024;

/**
 * Le contenu (entre le nom et le `>`) de chaque balise ouvrante portant ce nom.
 *
 * Linéaire : le curseur ne recule jamais. Après une balise, on repart APRÈS son
 * `>` — donc les `<link` empilés avant un même `>` ne sont lus qu'une fois — et
 * une balise jamais fermée arrête le balayage au lieu de le refaire.
 */
export function* scanTags(html: string, name: string): Generator<string> {
  const needle = `<${name}`;
  const lower = html.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf(needle, from);
    if (start === -1) return;
    const end = html.indexOf(">", start + needle.length);
    if (end === -1) return; // plus aucune balise complète après ce point
    from = end + 1;
    // `<linkedin>` n'est pas un `<link>` : le nom doit être suivi d'un délimiteur.
    const next = html[start + needle.length];
    if (next !== undefined && next !== ">" && next !== "/" && !/\s/.test(next)) continue;
    if (end - start > MAX_TAG_LENGTH) continue;
    yield html.slice(start + needle.length, end);
  }
}

/**
 * Les attributs d'une balise, nom en minuscules. Première occurrence gagnante,
 * valeurs entre guillemets simples, doubles ou nues. Un seul passage, sans
 * regex sur l'entrée.
 */
export function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);
  let i = 0;
  while (i < tag.length) {
    while (isSpace(tag[i])) i++;
    const nameStart = i;
    while (i < tag.length && !isSpace(tag[i]) && tag[i] !== "=" && tag[i] !== "/") i++;
    if (i === nameStart) {
      i++; // caractère isolé (`/`, `=` orphelin) : on avance, sinon on boucle
      continue;
    }
    const name = tag.slice(nameStart, i).toLowerCase();
    while (isSpace(tag[i])) i++;
    if (tag[i] !== "=") {
      if (!attributes.has(name)) attributes.set(name, "");
      continue;
    }
    i++;
    while (isSpace(tag[i])) i++;
    const quote = tag[i];
    let value: string;
    if (quote === '"' || quote === "'") {
      const valueStart = i + 1;
      const closing = tag.indexOf(quote, valueStart);
      const stop = closing === -1 ? tag.length : closing;
      value = tag.slice(valueStart, stop);
      i = stop + 1;
    } else {
      const valueStart = i;
      while (i < tag.length && !isSpace(tag[i])) i++;
      value = tag.slice(valueStart, i);
    }
    if (!attributes.has(name)) attributes.set(name, value);
  }
  return attributes;
}

/** Le texte brut d'un `<title>` (entités non décodées), borné en longueur. */
export function extractTitleText(html: string): string | null {
  const lower = html.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf("<title", from);
    if (start === -1) return null;
    const open = html.indexOf(">", start + 6);
    if (open === -1) return null;
    from = open + 1;
    const next = html[start + 6];
    if (next !== undefined && next !== ">" && !/\s/.test(next)) continue;
    const close = lower.indexOf("</title", open + 1);
    const end = close === -1 ? html.length : close;
    return html.slice(open + 1, Math.min(end, open + 1 + MAX_TITLE_LENGTH));
  }
}

/** Le `content` de la première balise `<meta>` déclarant cette propriété
    Open Graph (`property=` ou, chez les approximatifs, `name=`). */
export function extractMetaContent(html: string, property: string): string | null {
  for (const tag of scanTags(html, "meta")) {
    const attributes = parseAttributes(tag);
    const declared = attributes.get("property") ?? attributes.get("name");
    if (declared?.trim().toLowerCase() !== property) continue;
    const content = attributes.get("content");
    if (content) return content.slice(0, MAX_TITLE_LENGTH);
  }
  return null;
}
