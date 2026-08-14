/**
 * Ce qu'on accepte d'AFFICHER, et ce qu'on se contente de rendre (MIN-340).
 *
 * Un fichier téléversé porte deux types MIME, et aucun des deux n'est une
 * mesure : celui que le navigateur ANNONCE au moment de l'envoi, et celui qu'on
 * range dans la ligne. Les deux viennent du client. Servir un fichier « en
 * `inline` » sur la foi de l'un d'eux, c'est laisser un membre choisir ce que
 * son fichier sera : un `.png` qui contient du HTML, ou un SVG portant un
 * `<script>`, devient un DOCUMENT exécuté par le navigateur de qui l'ouvre.
 *
 * D'où deux gardes, et il faut les deux :
 *
 *  - une ALLOWLIST ({@link isInlineSafeMimeType}) — hors liste, la réponse porte
 *    `Content-Disposition: attachment`, qui ne rend jamais rien ;
 *  - un SNIFF des octets ({@link resolveUploadedMimeType}) partout où on tient
 *    le contenu à l'enregistrement, pour que le type rangé décrive ce que le
 *    fichier EST plutôt que ce qu'il prétend.
 *
 * `image/svg+xml` est volontairement hors liste : c'est un document XML avec des
 * scripts et des liens, pas une image bitmap. Il s'affiche toujours dans un
 * `<img>` (la disposition ne gouverne que la navigation) ; ce qu'elle empêche,
 * c'est de l'ATTEINDRE directement.
 *
 * Ce module est pur : pas de base, pas de storage, pas de `server-only` — la
 * même règle sert au serveur qui signe une URL et au test qui la vérifie.
 */

/**
 * Les types servis TELS QUELS. Ce qui reste ici est ce que nos vues affichent
 * vraiment — les images bitmap — plus les deux formats qu'on ouvre sans y
 * penser. Le reste se télécharge, ce qu'un lien de pièce jointe fait déjà.
 */
export const INLINE_SAFE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "text/plain",
]);

/** `Image/PNG; charset=utf-8` → `image/png`. Le paramètre ne décide rien. */
export function normalizeMimeType(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.split(";")[0].trim().toLowerCase();
}

/** Ce type peut-il être servi sans `Content-Disposition: attachment` ? */
export function isInlineSafeMimeType(raw: string | null | undefined): boolean {
  return INLINE_SAFE_MIME_TYPES.has(normalizeMimeType(raw));
}

/** Le type sous lequel un fichier sera SERVI (cf. l'allowlist ci-dessus). */
export function servedMimeType(raw: string | null | undefined): string {
  const type = normalizeMimeType(raw);
  return INLINE_SAFE_MIME_TYPES.has(type) ? type : "application/octet-stream";
}

/** Les octets qui identifient un format à coup sûr, dans l'ordre où on les
    teste. Un `null` en position d'octet veut dire « n'importe lequel ». */
const MAGIC: { mime: string; offset: number; bytes: (number | null)[] }[] = [
  // \x89PNG\r\n\x1a\n
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // RIFF ???? WEBP
  {
    mime: "image/webp",
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  // ???? ftypavif / ftypavis (boîte ISOBMFF)
  {
    mime: "image/avif",
    offset: 4,
    bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69],
  },
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

/** Combien d'octets de tête suffisent à trancher — tout ce qui suit est du
    contenu, et le sniff n'a rien à y chercher. */
export const MIME_SNIFF_BYTES = 1024;

/** Les entêtes textuelles qui font d'un fichier un DOCUMENT, quel que soit le
    nom qu'il porte. Le `<?xml` est là pour le SVG déclaré proprement. */
const MARKUP_PREFIXES: { mime: string; starts: string[] }[] = [
  { mime: "image/svg+xml", starts: ["<svg"] },
  {
    mime: "text/html",
    starts: ["<!doctype html", "<html", "<head", "<body", "<script", "<iframe", "<a href"],
  },
];

/**
 * Le type que les OCTETS révèlent, ou `null` quand ils ne révèlent rien.
 *
 * Les formats binaires se lisent sur leur signature ; le texte, lui, se lit sur
 * son premier élément — un `<?xml … ?>` puis un `<svg>` reste un SVG, d'où le
 * saut du prologue et des commentaires avant de comparer.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  for (const sig of MAGIC) {
    if (bytes.length < sig.offset + sig.bytes.length) continue;
    let hit = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      const expected = sig.bytes[i];
      if (expected !== null && bytes[sig.offset + i] !== expected) {
        hit = false;
        break;
      }
    }
    if (hit) return sig.mime;
  }

  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, MIME_SNIFF_BYTES))
    // BOM, espaces, prologue XML et commentaires : du décor avant l'élément.
    .replace(/^﻿/, "")
    .replace(/^\s+/, "")
    .replace(/^<\?xml[^>]*\?>/i, "")
    .replace(/^(?:\s|<!--[\s\S]*?-->)*/, "")
    .toLowerCase();

  for (const { mime, starts } of MARKUP_PREFIXES) {
    if (starts.some((s) => head.startsWith(s))) return mime;
  }
  return null;
}

/**
 * Le type à RANGER pour un fichier dont on tient les octets.
 *
 * Trois cas, et le troisième est celui qui compte : les octets tranchent quand
 * ils le peuvent ; sinon un type déclaré hors allowlist est gardé tel quel (il
 * ne sera jamais servi `inline`, et il nomme correctement l'icône du fichier) ;
 * sinon — un type d'affichage que les octets ne CONFIRMENT pas — on retombe sur
 * `application/octet-stream`. C'est exactement le `.png` qui n'en est pas un.
 *
 * `text/plain` est la seule exception, faute de signature : du texte sans
 * balise de tête reste du texte.
 */
export function resolveUploadedMimeType(
  declared: string | null | undefined,
  bytes: Uint8Array
): string {
  const sniffed = sniffMimeType(bytes);
  if (sniffed) return sniffed;
  const type = normalizeMimeType(declared);
  if (!type) return "application/octet-stream";
  if (type === "text/plain") return type;
  return INLINE_SAFE_MIME_TYPES.has(type) ? "application/octet-stream" : type;
}
