// Ce qui, dans un texte, EST une mention — la règle, en un seul endroit.
//
// Elle sert deux fois pour un même commentaire : pendant qu'on l'écrit (le
// composer repose une pilule sur chaque mention qu'il relit) et une fois publié
// (le rendu markdown fait pareil). Deux surfaces, deux moments, une seule règle :
// dupliquer l'expression rationnelle, c'était se donner un contrat de plus à
// tenir entre deux fichiers, avec pour seul symptôme visible une pilule qui
// apparaît d'un côté et pas de l'autre.

import { displayName } from "@/lib/display-name";
import type { Member } from "@/lib/types";

/** Ce qui s'écrit après le « @ » pour citer un membre. */
export function memberLabel(m: Member): string {
  return displayName(m);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* « @numo » s'écrit comme on veut : c'est ainsi que le serveur le reconnaît
   (mentionsNumo, lib/server/assistant/comment-agent.ts). Un nom de membre, lui,
   se reconnaît à sa casse EXACTE — c'est ce que extractMentions notifie, et une
   pilule doit dire vrai sur qui a été prévenu. Deux règles, une seule passe :
   comme JS n'a pas de drapeau par branche, la casse libre de « numo » s'écrit
   lettre par lettre. */
const NUMO_PATTERN = "[Nn][Uu][Mm][Oo]";

export type ScannedMention =
  | { type: "numo"; member?: undefined }
  | { type: "member"; member: Member };

/** Un morceau de texte nu, ou une mention reconnue. Jamais les deux. */
export type MentionSegment =
  | { text: string; mention?: undefined }
  | { text?: undefined; mention: ScannedMention };

/** Prépare le découpage pour une liste de membres donnée. L'expression
    rationnelle se construit une fois pour toutes les relectures qui suivent. */
export function mentionScanner(
  members: Member[],
): (value: string) => MentionSegment[] {
  // Du plus long au plus court : « Jean Dupont » doit gagner sur « Jean ».
  const byLength = [...members].sort(
    (a, b) => memberLabel(b).length - memberLabel(a).length,
  );
  const byName = new Map(byLength.map((m) => [memberLabel(m), m]));
  const names = byLength.map((m) => escapeRegExp(memberLabel(m)));
  // Sans membre, pas de branche de noms : un « (|) » vide matcherait la chaîne
  // vide, et chaque « @ » du texte deviendrait une pilule.
  const re = new RegExp(
    names.length
      ? `@(?:(${NUMO_PATTERN})\\b|(${names.join("|")}))`
      : `@(${NUMO_PATTERN})\\b`,
    "g",
  );

  return (value: string): MentionSegment[] => {
    const out: MentionSegment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(value)) !== null) {
      const numo = !!m[1];
      // Même garde que côté serveur : « clement@numo.dev » ne cite personne.
      if (numo && m.index > 0 && !/[\s(>]/.test(value[m.index - 1])) continue;
      const member = numo ? null : byName.get(m[2]);
      if (!numo && !member) continue;
      if (m.index > last) out.push({ text: value.slice(last, m.index) });
      out.push({
        mention: numo ? { type: "numo" } : { type: "member", member: member! },
      });
      last = m.index + m[0].length;
    }
    if (last < value.length) out.push({ text: value.slice(last) });
    return out;
  };
}
