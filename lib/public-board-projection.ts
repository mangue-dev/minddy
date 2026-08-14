import type {
  Category,
  Issue,
  IssueCardCategory,
  IssueCardIssue,
  IssueCardObjective,
  Objective,
} from "@/lib/types";

/**
 * Ce que la vue partagée (`/share/[token]`) a le droit de faire traverser la
 * frontière serveur → client (MIN-342).
 *
 * Le défaut corrigé ici n'est pas « deux champs de trop » : c'est le MOTIF.
 * Un composant serveur sérialise dans le HTML de la page tout ce qu'il passe à
 * un composant client, mot pour mot. Passer l'objet complet parce qu'il est
 * sous la main, c'est publier des colonnes qu'on n'a jamais décidé de publier —
 * ici le `plan` de chaque ticket, et la table des objectifs du projet en
 * entier, sur une page anonyme qui n'en montre aucun.
 *
 * Une projection explicite renverse la charge : ce qui sort est une liste
 * fermée, écrite ici, et un champ neuf sur `Issue` ne s'y invite pas tout seul.
 * C'est aussi ce que le test lit — et, plus sûrement encore, ce que la
 * vérification cherche dans le HTML rendu.
 */

/** Le ticket, réduit à ce qu'une carte affiche. `plan` n'y est pas : la carte
    n'en tire que l'avancement, et l'avancement n'est pas ce qu'on publie. */
export function toPublicIssue(issue: Issue): IssueCardIssue {
  return {
    id: issue.id,
    project_id: issue.project_id,
    number: issue.number,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    effort: issue.effort,
    assignee_id: issue.assignee_id,
    objective_id: issue.objective_id,
    due_date: issue.due_date,
    recurrence: issue.recurrence,
    category_ids: issue.category_ids,
    integration_id: issue.integration_id ?? null,
    remote_provider: issue.remote_provider ?? null,
    remote_number: issue.remote_number ?? null,
    remote_url: issue.remote_url ?? null,
  };
}

/** L'objectif, réduit à sa pastille et à son nom — sans sa description, son
    échéance, ni qui le porte. */
export function toPublicObjective(objective: Objective): IssueCardObjective {
  return { id: objective.id, name: objective.name, color: objective.color };
}

export function toPublicCategory(category: Category): IssueCardCategory {
  return { id: category.id, name: category.name, color: category.color };
}

/**
 * Les objectifs QUE LES CARTES CITENT, et eux seuls. La page en montrait la
 * table complète du projet — y compris ceux qu'aucun ticket visible ne porte,
 * donc y compris ceux que le filtre de la vue avait justement écartés.
 */
export function publicObjectivesFor(
  objectives: Objective[],
  issues: Pick<IssueCardIssue, "objective_id">[]
): IssueCardObjective[] {
  const cited = new Set(
    issues.map((i) => i.objective_id).filter((id): id is string => id !== null)
  );
  return objectives.filter((o) => cited.has(o.id)).map(toPublicObjective);
}

/** Même règle pour les catégories : seules celles qu'une carte peut peindre. */
export function publicCategoriesFor(
  categories: Category[],
  issues: Pick<IssueCardIssue, "category_ids">[]
): IssueCardCategory[] {
  const cited = new Set(issues.flatMap((i) => i.category_ids));
  return categories.filter((c) => cited.has(c.id)).map(toPublicCategory);
}
