// Les astuces du bas de l'accueil : ce que minddy sait faire et qu'on ne
// découvre pas en cliquant.
//
// Un tracker se prend en main par ses écrans, et s'habite par ses raccourcis. Le
// deuxième apprentissage n'arrive jamais tout seul : personne n'ouvre le cheat
// sheet pour apprendre qu'il existe, personne ne va lire les réglages pour
// découvrir Smart Fill. L'accueil est le seul écran qu'on revoit tous les jours
// sans rien y chercher de précis — c'est donc le seul endroit où une phrase peut
// apprendre quelque chose sans interrompre personne.
//
// D'où la forme : UNE ligne, en bas, tirée au sort à chaque chargement, jamais
// deux fois la même dans la même vie de page. Elle n'attend aucune réponse et ne
// se ferme pas ; c'est ce qui lui permet de rester là tous les jours.
//
// Trois règles portent le fichier :
//
//  1. **Une astuce dit une chose VRAIE, et une seule.** Elle décrit un geste
//     réel de l'application d'aujourd'hui. Une astuce périmée est pire que pas
//     d'astuce : elle envoie chercher un bouton qui n'existe plus.
//  2. **Les touches ne sont pas recopiées ici.** Une astuce qui parle d'un
//     raccourci cite son `id` dans le registre du cheat sheet
//     (lib/keyboard/shortcuts.ts) et rien d'autre ; les touches sont lues
//     là-bas au rendu. Le jour où ⌘K devient autre chose, l'astuce suit sans
//     qu'on y pense — et c'était bien l'écueil, deux endroits qui promettent
//     deux touches différentes pour le même geste.
//  3. **Pas de placeholder.** Les clés transitent par cette table, donc hors du
//     typage strict de next-intl (cf. lib/i18n-keys.ts) : un message qui
//     réclamerait des valeurs afficherait « Home.tips.x » en bas de l'accueil.
//     `lib/home-tips.test.ts` refuse toute astuce dont le message en porte un.
//
// Le registre est celui du reste de l'accueil : un collègue qui montre un geste,
// pas une infobulle publicitaire. Une astuce tient en une ligne, à l'indicatif,
// et ne vend rien.

import type { MessageKey } from "@/lib/i18n-keys";
import { CHEATSHEET, type CheatsheetShortcut } from "@/lib/keyboard/shortcuts";

export interface HomeTip {
  /** La phrase, sous `Home.tips`. */
  key: MessageKey<"Home.tips">;
  /**
   * L'id du raccourci dans `CHEATSHEET`, quand l'astuce en désigne un. Ses
   * touches sont rendues au bout de la phrase, LUES DANS LE REGISTRE : elles ne
   * sont jamais écrites ici, ni dans le catalogue de messages.
   */
  shortcut?: string;
}

const tip = (key: MessageKey<"Home.tips">, shortcut?: string): HomeTip => ({
  key,
  shortcut,
});

/**
 * Le vivier.
 *
 * L'ordre n'a aucune importance à l'écran (le tirage est uniforme) ; il n'est
 * là que pour la relecture, du geste le plus quotidien au réglage le plus
 * lointain. Y ajouter une astuce est le geste normal quand on livre une
 * fonctionnalité qui ne se voit pas.
 */
export const HOME_TIPS: HomeTip[] = [
  // — Le clavier, d'abord : ce sont les gestes qu'on répète cent fois par jour.
  tip("palette", "gen.palette"),
  tip("cheatsheet", "gen.cheatsheet"),
  tip("search", "gen.search"),
  tip("filterList", "gen.filterList"),
  tip("undo", "gen.undo"),
  tip("newIssue", "create.issue"),
  tip("newObjective", "create.objective"),
  tip("chords", "nav.allIssues"),
  tip("myIssues", "nav.myIssues"),
  tip("notebook", "nav.notes"),
  tip("inbox", "nav.inbox"),
  tip("assistant", "nav.assistant"),

  // — La carte survolée : la moitié du travail d'un board se fait sans l'ouvrir.
  tip("hoverCard", "card.status"),
  tip("hoverAssignee", "card.assignee"),
  tip("hoverDueDate", "card.dueDate"),
  tip("openCard", "card.open"),
  tip("askNumo", "card.askNumo"),
  tip("copyPrompt", "card.copyPrompt"),
  tip("launchAgent", "card.launchAgent"),
  tip("dictateIssue", "create.issueDictate"),
  tip("objectiveIssues", "nav.objectiveIssues"),

  // — Les gestes à la souris qu'aucun menu n'annonce.
  tip("shiftClick"),
  tip("marquee"),
  tip("rightClick"),

  // — Le board et les tickets.
  tip("savedViews"),
  tip("shareView"),
  tip("recurring"),
  tip("subIssues"),
  tip("relations"),
  tip("plan"),
  tip("smartFill"),
  tip("smartAssign"),
  tip("autoAssignOnStart"),
  tip("drafts"),
  tip("trash"),

  // — Le carnet, les pages, les cycles, les objectifs.
  tip("notebookSlash"),
  tip("notebookPrompt"),
  tip("pagesSlash"),
  tip("pagesPublish"),
  tip("pagesExport"),
  tip("pagesComment"),
  tip("pagesHistory"),
  tip("pagesBacklinks"),
  tip("pageCopyForAgent", "page.copyForAgent"),
  tip("cycles"),
  tip("objectives"),
  tip("stats"),

  // — Ce qui branche minddy sur le reste : agent, dépôt, entrées, sorties.
  tip("agentPr"),
  tip("routines"),
  tip("automations"),
  tip("mcp"),
  tip("webhooks"),
  tip("feedbackBoard"),
  tip("import"),
  tip("export"),

  // — Le confort : réglages qu'on ne cherche que si l'on sait qu'ils existent.
  tip("zenMode"),
  tip("sendShortcut"),
  tip("desktopApp"),
];

/** Le registre du cheat sheet, à plat : un raccourci par id. */
const SHORTCUTS: ReadonlyMap<string, CheatsheetShortcut> = new Map(
  CHEATSHEET.flatMap((section) =>
    section.shortcuts.map((sc) => [sc.id, sc] as const),
  ),
);

/**
 * Le raccourci d'une astuce, tel qu'il est écrit dans le cheat sheet — ou
 * `undefined` pour une astuce qui n'en désigne aucun.
 *
 * Rend `undefined` aussi pour un id inconnu : une astuce qui cite un raccourci
 * supprimé se lit encore comme une phrase, et le test du catalogue est là pour
 * que ça n'arrive pas silencieusement.
 */
export function tipShortcut(t: HomeTip): CheatsheetShortcut | undefined {
  return t.shortcut ? SHORTCUTS.get(t.shortcut) : undefined;
}

/**
 * Une astuce du vivier, tirée par `seed`. Déterministe à graine égale : c'est ce
 * qui permet à l'accueil de garder la même astuce tant que la page vit, et d'en
 * changer au chargement suivant — comme le salut juste au-dessus
 * (lib/home-greeting.ts).
 */
export function pickTip(seed: number): HomeTip {
  return HOME_TIPS[Math.abs(Math.trunc(seed)) % HOME_TIPS.length];
}
