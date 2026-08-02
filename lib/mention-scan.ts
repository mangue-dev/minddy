// Ce qui, dans un texte, EST une mention — la règle, en un seul endroit.
//
// Elle sert deux fois pour un même commentaire : pendant qu'on l'écrit (le
// composer repose une pilule sur chaque mention qu'il relit) et une fois publié
// (le rendu markdown fait pareil). Deux surfaces, deux moments, une seule règle :
// dupliquer l'expression rationnelle, c'était se donner un contrat de plus à
// tenir entre deux fichiers, avec pour seul symptôme visible une pilule qui
// apparaît d'un côté et pas de l'autre.

import { displayName } from "@/lib/display-name";
import { PROJECT_KEY_MAX, PROJECT_KEY_MIN } from "@/lib/project-key";
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

/* La FORME d'un identifiant de ticket : la clé du projet (2 à 5 majuscules,
   lib/project-key) et son numéro. La garde de queue empêche « @MIN-42x » et
   « @MIN-1234567890 » de se faire passer pour « @MIN-42 » suivi de rien. */
const ISSUE_IDENTIFIER_PATTERN = `[A-Z]{${PROJECT_KEY_MIN},${PROJECT_KEY_MAX}}-\\d{1,7}(?![\\w-])`;

/** Un TICKET tel qu'une mention a besoin de le connaître : de quoi le dessiner
    et y aller. */
export interface MentionIssue {
  id: string;
  project_id: string;
  /** « MIN-42 » — c'est LUI qui s'écrit après l'arobase. */
  identifier: string;
  title: string;
}

/** Un OBJECTIF tel qu'une mention a besoin de le connaître. Sa couleur voyage
    avec lui : partout où une icône désigne CET objectif-là, elle la porte. */
export interface MentionObjective {
  id: string;
  project_id: string;
  /** Le nom — c'est lui qui s'écrit après l'arobase. */
  name: string;
  color: string | null;
}

export type ScannedMention =
  | { type: "numo"; member?: undefined }
  | { type: "member"; member: Member }
  /** Un compte de la FORGE (MIN-162) : ce qui se mentionne sur une pull request,
      où seul un compte GitHub/GitLab notifie quelqu'un. Aucun `user_id` minddy —
      c'est justement ce qui le distingue d'un `member`. */
  | { type: "forge"; member?: undefined; login: string; avatarUrl: string | null }
  | { type: "issue"; member?: undefined; issue: MentionIssue }
  | { type: "objective"; member?: undefined; objective: MentionObjective };

/** Un morceau de texte nu, ou une mention reconnue. Jamais les deux.
    `raw` est ce qui a été LU dans le texte (« @Jean Dupont », « @NUMO ») : les
    surfaces qui remplacent une mention en place — l'éditeur de description, qui
    y pose un nœud — ont besoin de sa longueur exacte, que le libellé seul ne
    donne pas (la casse de « numo » est libre). */
export type MentionSegment =
  | { text: string; mention?: undefined; raw?: undefined }
  | { text?: undefined; mention: ScannedMention; raw: string };

export type MentionScan = (value: string) => MentionSegment[];

/**
 * Le découpage, pour une table « ce qui s'écrit après l'arobase » → « ce que
 * ça désigne ». Membres minddy et comptes de forge n'en sont que deux
 * remplissages : la RÈGLE — l'arobase en début de mot, le plus long d'abord,
 * « numo » à casse libre — n'existe qu'ici, et les deux surfaces qui relisent un
 * même texte (le champ pendant la frappe, le rendu une fois publié) la partagent.
 */
function buildScanner(
  entries: Array<{ label: string; mention: ScannedMention }>,
  /**
   * Les tickets citables, indexés par identifiant. Ils ne passent PAS par
   * l'alternance de noms : un espace de travail en compte des milliers, et les
   * énumérer ferait une expression rationnelle de plusieurs dizaines de milliers
   * de caractères, reconstruite à chaque fois que la liste bouge. Un identifiant
   * se reconnaît à sa FORME (CLÉ-numéro) — la table ne sert plus qu'à dire si ce
   * ticket-là existe, et à donner de quoi le dessiner.
   */
  issuesByIdentifier?: Map<string, MentionIssue>,
): MentionScan {
  // Du plus long au plus court : « Jean Dupont » doit gagner sur « Jean », et
  // « @bobby » sur « @bob ».
  const byLength = [...entries].sort((a, b) => b.label.length - a.label.length);
  const byName = new Map(byLength.map((e) => [e.label, e.mention]));
  const names = byLength.map((e) => escapeRegExp(e.label));

  // Une branche par nature de mention, dans l'ordre. Chacune porte EXACTEMENT
  // un groupe capturant, donc son rang dans `parts` est son numéro de groupe —
  // c'est ce qui permet de les rendre facultatives sans décaler les indices.
  // Sans entrée, pas de branche de noms : un « (|) » vide matcherait la chaîne
  // vide, et chaque « @ » du texte deviendrait une pilule.
  const parts = [`(${NUMO_PATTERN})\\b`];
  let nameGroup = 0;
  let issueGroup = 0;
  if (names.length) {
    parts.push(`(${names.join("|")})`);
    nameGroup = parts.length;
  }
  if (issuesByIdentifier?.size) {
    parts.push(`(${ISSUE_IDENTIFIER_PATTERN})`);
    issueGroup = parts.length;
  }
  const re = new RegExp(`@(?:${parts.join("|")})`, "g");

  return (value: string): MentionSegment[] => {
    const out: MentionSegment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(value)) !== null) {
      const numo = !!m[1];
      // Même garde que côté serveur : « clement@numo.dev » ne cite personne.
      if (numo && m.index > 0 && !/[\s(>]/.test(value[m.index - 1])) continue;
      const name = nameGroup ? m[nameGroup] : undefined;
      const identifier = issueGroup ? m[issueGroup] : undefined;
      const issue = identifier ? issuesByIdentifier?.get(identifier) : undefined;
      const found: ScannedMention | undefined = numo
        ? { type: "numo" }
        : name
          ? byName.get(name)
          : issue
            ? { type: "issue", issue }
            : undefined;
      // Un identifiant bien formé mais inconnu (ticket d'un autre espace,
      // faute de frappe) reste du TEXTE : une pilule morte mentirait.
      if (!found) continue;
      if (m.index > last) out.push({ text: value.slice(last, m.index) });
      out.push({ mention: found, raw: m[0] });
      last = m.index + m[0].length;
    }
    if (last < value.length) out.push({ text: value.slice(last) });
    return out;
  };
}

/** Prépare le découpage pour une liste de membres minddy donnée. L'expression
    rationnelle se construit une fois pour toutes les relectures qui suivent. */
export function mentionScanner(members: Member[]): MentionScan {
  return buildScanner(
    members.map((member) => ({
      label: memberLabel(member),
      mention: { type: "member", member } as const,
    })),
  );
}

/**
 * Le même découpage, pour les comptes d'une FORGE (MIN-162). Ce qui s'écrit
 * après l'arobase est le LOGIN et rien d'autre — c'est GitHub qui le résoudra,
 * minddy ne transforme rien — même quand la forge connaît aussi un nom affiché.
 */
export function forgeMentionScanner(
  members: Array<{ login: string; avatar_url: string | null }>,
): MentionScan {
  return buildScanner(
    members.map((m) => ({
      label: m.login,
      mention: { type: "forge", login: m.login, avatarUrl: m.avatar_url } as const,
    })),
  );
}

/**
 * Le découpage d'une DESCRIPTION : ce qui s'y cite est plus large que dans un
 * commentaire — une personne, un ticket, un objectif.
 *
 * Les objectifs passent AVANT les membres dans la table : à nom strictement
 * égal, c'est le dernier posé qui gagne, et entre une personne et un objectif
 * homonymes, c'est la personne qu'on a voulu citer.
 */
export function contentMentionScanner(source: {
  members?: Member[];
  issues?: MentionIssue[];
  objectives?: MentionObjective[];
}): MentionScan {
  return buildScanner(
    [
      ...(source.objectives ?? []).map((objective) => ({
        label: objective.name,
        mention: { type: "objective", objective } as const,
      })),
      ...(source.members ?? []).map((member) => ({
        label: memberLabel(member),
        mention: { type: "member", member } as const,
      })),
    ],
    new Map((source.issues ?? []).map((issue) => [issue.identifier, issue])),
  );
}
