import type {
  Category,
  Issue,
  IssueCardCategory,
  IssueCardIssue,
  IssueCardObjective,
  Objective,
} from "@/lib/types";

/**
 * What the shared view (`/share/[token]`) has the right to cross the
 * server → client border (MIN-342).
 *
 * The defect corrected here is not "two fields too many": it is the REASON.
 * A server component serializes into the HTML of the page whatever it passes to
 * a client component, verbatim. Passing the complete object because it is
 * at hand, means publishing columns that we never decided to publish —
 * here the `plan` of each ticket, and the table of project objectives in
 * entire, on an anonymous page which does not show any.
 *
 * An explicit projection reverses the load: what comes out is a closed list
 *, written here, and a new field on `Issue` does not prompt itself.
 * This is also what the test reads — and, even more surely, what the
 * check looks for in the HTML rendered.
 */

/** The ticket, reduced to what a card displays. `plan` is not there: the
 card only draws advancement, and advancement is not what is published. */
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

/** The objective, reduced to its badge and its name - without its description, its
 expiration, or who wears it. */
export function toPublicObjective(objective: Objective): IssueCardObjective {
  return { id: objective.id, name: objective.name, color: objective.color };
}

export function toPublicCategory(category: Category): IssueCardCategory {
  return { id: category.id, name: category.name, color: category.color };
}

/**
 * The objectives THAT THE CARDS LIST, and them alone. The page showed the
 * complete table of the project — including those that no visible ticket carries,
 * therefore including those that the view filter had precisely excluded.
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

/** Same rule for categories: only those that a card can paint. */
export function publicCategoriesFor(
  categories: Category[],
  issues: Pick<IssueCardIssue, "category_ids">[]
): IssueCardCategory[] {
  const cited = new Set(issues.flatMap((i) => i.category_ids));
  return categories.filter((c) => cited.has(c.id)).map(toPublicCategory);
}
