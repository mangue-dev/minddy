import { issueIdentifier } from "@/lib/issue-constants";
import type { AgentSessionListItem } from "@/lib/agent-api";

/**
 * The NAME of an agent's conversation, as it reads in the column like
 * in the pane header — a single function for both, otherwise both
 * diverge.
 *
 * A run = a conversation, and a ticket often carries more than one: without its
 * ID in front, three conversations from the same ticket are too similar to
 * to be distinguishable at a glance, and two different tickets can
 * respond to each other word for word ("Fix redirection"). The identifier,
 * is unique and searchable — this is what we type in the filter.
 *
 * The cascade of the title, from the most precise to the most vague:
 * 1. the title written at launch by the titrator (that of the PR for a
 * rereading, MIN-168);
 * 2. the title of the TICKET, when the generation has given nothing or dates from before
 * `agent_runs.title` — better the title of the ticket than nothing;
 * 3. the withdrawal of the caller ("Conversation without title"), for a
 * notebook conversation without title or note.
 */
export function agentSessionTitle(
  session: Pick<AgentSessionListItem, "title" | "issue" | "project">,
  fallback: string,
): string {
  const title = session.title?.trim() || session.issue?.title?.trim() || fallback;
  return session.issue && session.project
    ? `${issueIdentifier(session.project.key, session.issue.number)}: ${title}`
    : title;
}
