// Rapprocher ce que le fichier NOMME de ce que le projet CONTIENT : les
// personnes avec ses membres, les étiquettes avec ses catégories.
//
// Les deux répondent au même besoin, et échouent de la même façon quand on ne
// les fait pas : un import qui ne reconnaît personne rend un backlog entier non
// assigné, et un import qui ne reconnaît aucune étiquette double toutes les
// catégories du projet (« Bugs » à côté de « Bug », « front » à côté de
// « Frontend »). Dans les deux cas le fichier était juste, et minddy a rangé à
// côté.
//
// Ce module ne fait que le rapprochement CERTAIN — une égalité, à la casse, aux
// accents et aux séparateurs près. Ce qui demande un jugement (« M. Dupont » et
// « Marie Dupont », « UI/UX » et « Design ») est laissé au modèle, qui reçoit
// les membres et les catégories du projet dans son résumé. Isomorphe : l'aperçu
// et le commit rapprochent pareil.

import { normalizeToken } from "@/lib/import/normalize";
import type { ImportMember } from "@/lib/import/types";

/** Comme `normalizeToken`, mais les ponctuations séparent aussi les mots :
 *  « Dupont, Marie » et « marie.dupont » deviennent comparables. */
const nameToken = (value: string): string =>
  normalizeToken(value.replace(/[.,;/\\|<>()[\]{}+_-]+/g, " "));

/** Les clés sous lesquelles un membre répond : e-mail, partie locale, nom. */
function memberKeys(member: ImportMember): string[] {
  const keys: string[] = [];
  const email = member.email?.trim().toLowerCase();
  if (email) {
    keys.push(email);
    const local = email.split("@")[0];
    if (local) keys.push(nameToken(local));
  }
  const name = member.name?.trim();
  if (name) {
    const token = nameToken(name);
    keys.push(token);
    // « Dupont Marie » pour un fichier qui inverse (export Jira trié par nom).
    const parts = token.split(" ");
    if (parts.length === 2) keys.push(`${parts[1]} ${parts[0]}`);
  }
  return keys;
}

/** Index des membres, construit une fois par import. */
export function buildMemberIndex(members: ImportMember[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const member of members) {
    for (const key of memberKeys(member)) {
      // Premier arrivé, premier servi : deux membres qui répondent à la même
      // clé sont ambigus, et le second ne doit pas voler le premier.
      if (key && !index.has(key)) index.set(key, member.userId);
    }
  }
  return index;
}

/** L'identifiant du membre que cette valeur désigne, ou `null`. */
export function matchMember(raw: string, index: Map<string, string>): string | null {
  const value = raw.trim();
  if (!value) return null;
  return index.get(value.toLowerCase()) ?? index.get(nameToken(value)) ?? null;
}

// ── Catégories ───────────────────────────────────────────────────────────────

/** Un pluriel naïf, suffisant pour « Bugs » → « Bug » et « Feature » → « Features ». */
const singular = (token: string): string =>
  token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;

/** Index des catégories existantes : jeton → nom exact tel qu'il est en base. */
export function buildCategoryIndex(categories: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const name of categories) {
    const token = nameToken(name);
    if (!token) continue;
    if (!index.has(token)) index.set(token, name);
    const stem = singular(token);
    if (stem && !index.has(stem)) index.set(stem, name);
  }
  return index;
}

/**
 * Le nom de la catégorie EXISTANTE que cette étiquette désigne, ou `null` s'il
 * faudra en créer une. On ne rapproche que du certain : l'égalité aux accents,
 * à la casse, aux séparateurs et au pluriel près.
 */
export function matchCategory(raw: string, index: Map<string, string>): string | null {
  const token = nameToken(raw);
  if (!token) return null;
  return index.get(token) ?? index.get(singular(token)) ?? null;
}
