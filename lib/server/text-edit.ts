import { applyEdit, ReplaceError } from "@/lib/server/agent/edit";

/**
 * Éditer EN PLACE un texte de ticket — plan ou description (MIN-186).
 *
 * Mettre à jour trois phrases d'un plan de 21 000 caractères coûtait, côté MCP,
 * la ré-émission du document entier : la seule écriture disponible remplaçait
 * tout. D'où ce patch `old_string` → `new_string`, sur le modèle du tool `Edit`
 * que tout agent de code connaît.
 *
 * Le moteur n'est pas nouveau : c'est celui de l'agent de code
 * ([lib/server/agent/edit.ts](edit.ts)), déjà éprouvé sur des fichiers, et pur.
 * Ce module ne fait que deux choses qu'il ne peut pas faire : il refuse un champ
 * vide, et il RÉÉCRIT les refus. Les messages de `replace()` parlent de « the
 * file » et proposent `write_file` — un modèle qui édite un plan de ticket n'a
 * ni l'un ni l'autre sous la main, et suivre ce conseil-là le renverrait droit
 * vers la réécriture totale qu'on cherche à éviter.
 *
 * La contrepartie du patch est le vrai bénéfice : une réécriture complète écrase
 * en silence ce qu'un autre client a changé entre-temps, un `old_string` périmé
 * échoue bruyamment.
 */

export type IssueTextField = "plan" | "description";

export interface IssueTextEditOk {
  ok: true;
  /** Le champ complet après édition, à écrire tel quel. */
  content: string;
  /** Diff unifié, indentation commune retirée. */
  diff: string;
  additions: number;
  deletions: number;
}

export interface IssueTextEditRefusal {
  ok: false;
  /** Code d'erreur MCP (stable, en anglais, comme le reste de la surface). */
  code: "invalid_params" | "text_not_found" | "text_ambiguous";
  message: string;
}

export type IssueTextEditResult = IssueTextEditOk | IssueTextEditRefusal;

/**
 * Les tools de la surface appelante, NOMMÉS. Trois surfaces servent ce patch —
 * le MCP, le chat Numo, l'agent de code — et elles ne nomment pas les mêmes
 * tools : `minddy_get_issue` ici, `get_issue` là, `read_issue` ailleurs.
 * Un message de refus qui envoie vers un tool absent de la surface, c'est un
 * round brûlé sur un « Unknown tool ». D'où ce paramètre, obligatoire : il n'y
 * a pas de défaut raisonnable, seulement un jeu de noms juste par appelant.
 */
export interface IssueTextTools {
  /** Ce qui relit le ticket — d'où `old_string` doit être recopié. */
  read: string;
  /** Ce qui AJOUTE un bloc à un plan. */
  appendToPlan: string;
  /** Ce qui remplace le champ EN ENTIER, par champ. */
  replaceWhole: Record<IssueTextField, string>;
}

/** Ce que le modèle doit faire à la place, quand le patch n'est pas la voie. */
const otherWay = (field: IssueTextField, tools: IssueTextTools): string =>
  field === "plan"
    ? `Use ${tools.appendToPlan} to ADD a block, or ${tools.replaceWhole.plan} to write the whole plan.`
    : `Use ${tools.replaceWhole.description} to write the whole description.`;

export function editIssueText({
  field,
  current,
  oldString,
  newString,
  replaceAll = false,
  tools,
}: {
  field: IssueTextField;
  /** Le champ tel qu'il est stocké MAINTENANT ("" quand il n'y en a pas). */
  current: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  tools: IssueTextTools;
}): IssueTextEditResult {
  return editTextPassage({
    field,
    current,
    oldString,
    newString,
    replaceAll,
    read: tools.read,
    otherWay: otherWay(field, tools),
    subject: "issue",
  });
}

/**
 * Le même patch, pour un texte qui n'est PAS un champ de ticket — le corps d'une
 * page (MIN-273). Seuls changent le mot qui nomme le texte et le conseil de
 * repli : le moteur, les refus et leurs codes sont les mêmes, et c'est le point.
 * Une page corrigée par Numo doit échouer exactement comme un plan corrigé par
 * Numo, avec le même vocabulaire d'erreur des deux côtés.
 */
export function editTextPassage({
  field,
  current,
  oldString,
  newString,
  replaceAll = false,
  read,
  otherWay: fallback,
  subject = "issue",
}: {
  /** Le mot qui nomme le texte dans les messages : « plan », « body »… */
  field: string;
  current: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  /** Le tool qui relit le texte, d'où `old_string` doit être recopié. */
  read: string;
  /** Ce qu'il faut faire à la place quand le patch n'est pas la voie. */
  otherWay: string;
  /** Ce que porte le texte : « issue », « page ». */
  subject?: string;
}): IssueTextEditResult {
  if (!current.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message:
        `This ${subject} has no ${field} yet, so there is nothing to patch. ` +
        fallback,
    };
  }
  try {
    const edit = applyEdit(`${field}.md`, current, oldString, newString, replaceAll);
    return {
      ok: true,
      content: edit.content,
      diff: edit.diff,
      additions: edit.additions,
      deletions: edit.deletions,
    };
  } catch (err) {
    if (!(err instanceof ReplaceError)) throw err;
    switch (err.reason) {
      case "identical":
        return {
          ok: false,
          code: "invalid_params",
          message: "old_string and new_string are identical — nothing to change.",
        };
      case "empty_old":
        return {
          ok: false,
          code: "invalid_params",
          message:
            `old_string cannot be empty: give the exact passage of the ${field} ` +
            `to replace. ${fallback}`,
        };
      case "not_found":
        return {
          ok: false,
          code: "text_not_found",
          message:
            `Could not find old_string in the ${field}. It must match the stored ` +
            `text exactly, whitespace included — read it again with ${read} ` +
            "and copy the passage verbatim (it may also have changed since you " +
            "last read it, which is exactly what this refusal protects).",
        };
      case "ambiguous":
        return {
          ok: false,
          code: "text_ambiguous",
          message:
            `old_string matches several passages of the ${field}. Include the ` +
            "surrounding lines to make the match unique, or set replace_all to " +
            "change every occurrence.",
        };
      case "disproportionate":
        return {
          ok: false,
          code: "invalid_params",
          message:
            "Refusing the edit: the matched passage is much larger than " +
            `old_string. Read the ${field} again with ${read} and copy the ` +
            "exact passage to replace.",
        };
    }
  }
}
