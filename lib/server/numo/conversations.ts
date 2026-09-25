import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NumoConversation, NumoConversationDetail, NumoLegacySource } from "@/lib/assistant-types";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { publicSkillsMetadata } from "@/lib/server/assistant/skills";
import { issueStore } from "@/lib/server/issue-store";
import { hydrateAgentSummaryCopies } from "@/lib/server/agent/run-event-store";
import { hydrateAgentLaunchCopies, hydrateImportedAgentMessages } from "@/lib/server/agent/run-launch-content";
import { hydrateAgentQueueCopies } from "@/lib/server/agent/run-queue-content";
import { hydrateWorkerParentCopies } from "@/lib/server/agent/worker-parent-content";
import { hydrateNumoUserMessages } from "./user-message-content";
import { decodeNumoTurnOutcome, hydrateNumoFinalMessages,
  isEncryptedNumoTurnOutcome } from "./final-content";
import { decodeAgentTitle, legacyAgentTitleSchema } from "@/lib/server/agent/run-title-content";
import { decodeAgentContextSnapshot, legacyAgentContextSchema } from
  "@/lib/server/agent/context-snapshot-content";
import { decodeWorkBranchValue, isEncryptedWorkBranch,
  workBranchArtifactRef } from "@/lib/server/agent/run-work-branch-content";
import { decodeTurnSummaryValue, isEncryptedRunSummary } from
  "@/lib/server/agent/run-summary-content";
import { decodeAgentPrUrl, decodeAgentPrUrlValue,
  isEncryptedAgentPrUrl } from "@/lib/server/agent/run-pr-url-content";
import { decodePullRequestContent } from "@/lib/server/agent/pull-request-content";
import { decodeConversationTitle } from "./conversation-title-content";
import { decodeNumoError } from "./error-content";

export const NUMO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMO_CONVERSATIONS_PAGE_SIZE = 50;
export const MAX_NUMO_CONVERSATIONS_PAGE_SIZE = 500;

async function hydrateAssistantTitles<T extends NumoConversation>(rows: T[]):
  Promise<T[]> {
  return Promise.all(rows.map(async (row) => {
    if (row.source !== "assistant") return row;
    if (!row.user_id || !row.legacy_id) {
      throw new Error("Numo conversation owner is unavailable");
    }
    return { ...row, title: await decodeConversationTitle(row.user_id,
      row.legacy_id, row.title),
      error_message: await decodeNumoError(row.user_id, "conversations",
        row.legacy_id, row.error_message) };
  }));
}

/** Resolve issue-derived history titles only after the invoker view grants access. */
async function hydrateIssueTitles<T extends NumoConversation>(
  supabase: SupabaseClient, rows: T[],
): Promise<T[]> {
  const conversationIds = [...new Set(rows.filter((row) => row.source === "agent" &&
    typeof row.legacy_id === "string").map((row) => row.legacy_id as string))];
  const decodedTitles = new Map<string, string | null>();
  for (let offset = 0; offset < conversationIds.length; offset += 100) {
    const ids = conversationIds.slice(offset, offset + 100);
    const first = await supabase.from("agent_conversations")
      .select("id,project_id,title,title_ciphertext,title_encryption_version")
      .in("id", ids);
    const response = legacyAgentTitleSchema(first.error)
      ? await supabase.from("agent_conversations")
          .select("id,project_id,title").in("id", ids)
      : first;
    if (response.error) throw new Error("Unable to read agent conversation titles");
    for (const stored of response.data ?? []) {
      const row = rows.find((candidate) => candidate.legacy_id === stored.id);
      if (!row || row.project_id !== stored.project_id) continue;
      const clear = await decodeAgentTitle(stored as { id: string; project_id: string;
        title: string | null; title_ciphertext?: string | null;
        title_encryption_version?: number });
      decodedTitles.set(stored.id as string, clear.title);
    }
  }
  const titledRows = rows.map((row) => row.source === "agent" &&
    decodedTitles.get(row.legacy_id as string)
      ? { ...row, title: decodedTitles.get(row.legacy_id as string)! } : row);
  const pending = titledRows.filter((row) => row.source === "agent" && row.title == null &&
    typeof row.project_id === "string" && typeof row.latest_work_id === "string");
  if (!pending.length) return titledRows as T[];
  const runIds = [...new Set(pending.map((row) => row.latest_work_id as string))];
  const { data: runs, error: runError } = await supabase.from("agent_runs")
    .select("id, project_id, issue_id, pull_request_id").in("id", runIds);
  if (runError) throw new Error("Unable to resolve issue history titles");
  const issueIds = [...new Set((runs ?? []).map((row) => row.issue_id)
    .filter((id): id is string => typeof id === "string"))];
  const { data: issues, error: issueError } = issueIds.length
    ? await issueStore(supabase).select("id, project_id, title").in("id", issueIds)
        .in("project_id", [...new Set(pending.map((row) => row.project_id as string))])
    : { data: [], error: null };
  if (issueError) throw new Error("Unable to resolve issue history titles");
  const issueById = new Map((issues ?? []).map((row) => [row.id as string, row]));
  const prIds = [...new Set((runs ?? []).filter((row) => !row.issue_id)
    .map((row) => row.pull_request_id)
    .filter((id): id is string => typeof id === "string"))];
  const { data: prs, error: prError } = prIds.length
    ? await supabase.from("pull_requests").select("id,title").in("id", prIds)
    : { data: [], error: null };
  if (prError) throw new Error("Unable to resolve pull request history titles");
  const prTitles = new Map<string, string | null>();
  for (const pr of prs ?? []) {
    prTitles.set(pr.id, await decodePullRequestContent(pr.id, "title", pr.title));
  }
  const runById = new Map((runs ?? []).map((row) => [row.id as string, row]));
  return titledRows.map((row) => {
    const run = runById.get(row.latest_work_id as string);
    if (run?.project_id !== row.project_id) return row;
    const issueId = run?.issue_id as string | null;
    const issue = issueId ? issueById.get(issueId) : null;
    const fallback = issue?.project_id === row.project_id
      ? issue.title as string
      : !issueId && run?.pull_request_id
        ? prTitles.get(run.pull_request_id) ?? null : null;
    return row.title == null && fallback ? { ...row, title: fallback } : row;
  }) as T[];
}

async function hydrateWorkTitles(supabase: SupabaseClient,
  work: Record<string, unknown>[], actorId: string | null) {
  const ids = work.map((row) => row.id).filter((id): id is string => typeof id === "string");
  if (!ids.length) return work;
  const titles = new Map<string, string | null>();
  const urls = new Map<string, string | null>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const first = await supabase.from("agent_runs")
      .select("id,project_id,conversation_id,title,title_ciphertext,title_encryption_version,pr_url")
      .in("id", ids.slice(offset, offset + 100));
    const response = legacyAgentTitleSchema(first.error)
      ? await supabase.from("agent_runs")
          .select("id,project_id,conversation_id,title,pr_url")
          .in("id", ids.slice(offset, offset + 100))
      : first;
    if (response.error) throw new Error("Unable to read agent work titles");
    for (const stored of response.data ?? []) {
      const workRow = work.find((candidate) => candidate.id === stored.id);
      if (!workRow || workRow.project_id !== stored.project_id) continue;
      const clear = await decodeAgentTitle(stored as { id: string; project_id: string;
        conversation_id: string; title: string | null;
        title_ciphertext?: string | null; title_encryption_version?: number }, actorId);
      titles.set(stored.id as string, clear.title);
      urls.set(stored.id as string, (await decodeAgentPrUrl({
        id: stored.id as string, project_id: stored.project_id as string,
        pr_url: stored.pr_url as string | null,
      }, actorId)).pr_url);
    }
  }
  return work.map((row) => titles.has(row.id as string)
    ? { ...row, title: titles.get(row.id as string),
        pr_url: urls.get(row.id as string) } : row);
}

/** Always pass the request's RLS client, including for legacy link resolution. */
export async function listNumoConversations(
  supabase: SupabaseClient,
  projectId?: string | null,
  limit = NUMO_CONVERSATIONS_PAGE_SIZE,
) {
  let query = supabase.from("numo_user_conversation_history").select("*")
    .order("updated_at", { ascending: false }).order("id", { ascending: true })
    // Fetch one extra row so the UI can disclose that older history exists.
    .range(0, limit);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = await hydrateAssistantTitles(await hydrateIssueTitles(
    supabase, (data ?? []) as NumoConversation[]));
  return { conversations: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getNumoConversation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("numo_conversation_history")
    .select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return (await hydrateAssistantTitles(await hydrateIssueTitles(
    supabase, [data as NumoConversation])))[0];
}

/** Read the assistant-only persisted choices through the caller's RLS client. */
export async function getNumoConversationConfig(
  supabase: SupabaseClient,
  id: string,
): Promise<{ model: string | null; reasoningLevel: string | null } | null> {
  const conversation = await getNumoConversation(supabase, id);
  if (!conversation || conversation.source !== "assistant") return null;
  const { data, error } = await supabase
    .from("conversations")
    .select("model, reasoning_level")
    .eq("id", conversation.legacy_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    model: typeof data?.model === "string" ? data.model : null,
    reasoningLevel: isReasoningLevel(data?.reasoning_level) ? data.reasoning_level : null,
  };
}

/**
 * Map a legacy reference (old assistant id, old worker run) onto the common
 * conversation identity, plus the delegated work to reveal when it is a run.
 */
export async function resolveNumoConversation(
  supabase: SupabaseClient, source: NumoLegacySource, id: string,
): Promise<{ conversationId: string; workId: string | null } | null> {
  if (source === "run") {
    const { data, error } = await supabase.from("numo_work")
      .select("id, conversation_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { conversationId: data.conversation_id, workId: data.id } : null;
  }
  if (source === "agent") {
    const { data: origin, error } = await supabase.from("numo_work_origins")
      .select("conversation_id").eq("agent_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (origin) return { conversationId: origin.conversation_id, workId: null };
  }
  const { data, error } = await supabase.from("numo_conversation_ids")
    .select("id").eq(source === "assistant" ? "assistant_id" : "agent_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { conversationId: data.id, workId: null } : null;
}

async function collection(supabase: SupabaseClient, table: string, id: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select("*").eq("conversation_id", id)
      .order("created_at", { ascending: true }).order("id", { ascending: true });
    if (table === "numo_messages") query = query.order("source", { ascending: true });
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

async function hydrateContextSnapshots(supabase: SupabaseClient,
  rows: Record<string, unknown>[], actorId: string | null) {
  const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  if (!ids.length) return rows;
  const snapshots = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const first = await supabase.from("agent_conversation_contexts")
      .select("id,conversation_id,kind,resource_id,snapshot,snapshot_ciphertext,snapshot_encryption_version,conversation:agent_conversations!inner(project_id)")
      .in("id", ids.slice(offset, offset + 100));
    const { data, error } = legacyAgentContextSchema(first.error)
      ? await supabase.from("agent_conversation_contexts")
          .select("id,conversation_id,kind,resource_id,snapshot,conversation:agent_conversations!inner(project_id)")
          .in("id", ids.slice(offset, offset + 100))
      : first;
    if (error) throw new Error("Unable to read agent context snapshots");
    for (const stored of data ?? []) {
      const projected = rows.find((row) => row.id === stored.id);
      const linked = stored.conversation as unknown;
      const conversation = Array.isArray(linked) ? linked[0] as { project_id: string } | undefined
        : linked as { project_id: string } | null;
      if (!projected || !conversation?.project_id) continue;
      const decoded = await decodeAgentContextSnapshot(conversation.project_id,
        stored as unknown as { conversation_id: string; kind: string; resource_id: string;
          snapshot: Record<string, unknown>; snapshot_ciphertext?: string | null;
          snapshot_encryption_version?: number }, actorId);
      snapshots.set(stored.id as string, decoded.snapshot);
    }
  }
  if (snapshots.size !== ids.length) throw new Error("Agent context snapshot access changed");
  return rows.map((row) => ({ ...row, snapshot: snapshots.get(row.id as string) }));
}

export async function getNumoConversationDetail(
  supabase: SupabaseClient, id: string, actorId: string | null = null,
): Promise<NumoConversationDetail | null> {
  const conversation = await getNumoConversation(supabase, id);
  if (!conversation) return null;
  const [config, messages, work, contexts, artifacts, turns, occurrenceResult] = await Promise.all([
    getNumoConversationConfig(supabase, id),
    collection(supabase, "numo_messages", id), collection(supabase, "numo_work", id),
    collection(supabase, "numo_contexts", id), collection(supabase, "numo_artifacts", id),
    collection(supabase, "numo_turns", id),
    supabase.from("numo_routine_occurrences")
      .select("id, routine_id, origin, scheduled_for, created_at")
      .eq("conversation_id", conversation.legacy_id)
      .maybeSingle(),
  ]);
  if (occurrenceResult.error) throw new Error(occurrenceResult.error.message);
  // The invoker-scoped event policy authorizes each worker's own project;
  // a delegated worker may belong to a different project from its parent thread.
  const hydratedMessages = await hydrateWorkerParentCopies(supabase,
    await hydrateNumoFinalMessages(supabase,
      await hydrateNumoUserMessages(supabase,
      await hydrateImportedAgentMessages(supabase,
      await hydrateAgentQueueCopies(supabase,
        await hydrateAgentLaunchCopies(supabase,
          await hydrateAgentSummaryCopies(supabase, null, messages, actorId), actorId),
        actorId), actorId), actorId), actorId), actorId);
  const safeMessages: Record<string, unknown>[] = hydratedMessages.map((m) =>
    ({ ...m, metadata: publicSkillsMetadata(m.metadata) }));
  return {
    conversation: {
      ...conversation,
      ...(config ? { model: config.model, reasoning_level: config.reasoningLevel } : {}),
    },
    messages: safeMessages.filter((m) => m.kind !== "action"),
    actions: safeMessages.filter((m) => m.kind === "action"),
    work: await hydrateWorkTitles(supabase, work, actorId),
    contexts: await hydrateContextSnapshots(supabase, contexts, actorId),
    artifacts: await hydrateAgentArtifacts(supabase, artifacts, actorId),
    turns: await hydrateNumoAssistantTurnOutcomes(
      await hydrateAgentTurnSummaries(supabase, turns, actorId), actorId),
    routine_occurrence: occurrenceResult.data ?? null,
  } as unknown as NumoConversationDetail;
}

async function hydrateNumoAssistantTurnOutcomes(
  turns: Record<string, unknown>[], actorId: string | null,
) {
  return Promise.all(turns.map(async (turn) => {
    const outcome = turn.outcome as string | null;
    if (!isEncryptedNumoTurnOutcome(outcome) &&
        !String(turn.error_message ?? "").startsWith("mdye3:")) return turn;
    const userId = turn.initiated_by as string | null;
    if (!userId || actorId && actorId !== userId) {
      throw new Error("Numo turn outcome owner changed");
    }
    return { ...turn,
      outcome: await decodeNumoTurnOutcome(userId,
        turn.id as string, outcome, actorId),
      error_message: await decodeNumoError(userId, "numo_assistant_turns",
        turn.id as string, turn.error_message as string | null, actorId) };
  }));
}

async function hydrateAgentArtifacts(supabase: SupabaseClient,
  rows: Record<string, unknown>[], actorId: string | null) {
  const pending = rows.filter((row) =>
    (row.kind === "branch" && isEncryptedWorkBranch(row.ref as string | null)) ||
    isEncryptedAgentPrUrl(row.url as string | null));
  if (!pending.length) return rows;
  const replacements = new Map<string, { ref: string; url: string | null }>();
  for (let offset = 0; offset < pending.length; offset += 100) {
    const ids = pending.slice(offset, offset + 100).map((row) => row.id as string);
    const { data, error } = await supabase.from("agent_artifacts")
      .select("id,conversation_id,kind,ref,ref_ciphertext,ref_bound_run_id,url,url_bound_run_id,conversation:agent_conversations!inner(project_id)")
      .in("id", ids);
    if (error) throw new Error("Unable to read protected agent artifacts");
    for (const stored of data ?? []) {
      const shown = pending.find((row) => row.id === stored.id);
      const conversation = Array.isArray(stored.conversation)
        ? stored.conversation[0] : stored.conversation;
      if (!shown || shown.ref !== stored.ref || shown.url !== stored.url ||
          !conversation?.project_id) {
        throw new Error("Agent artifact access changed");
      }
      let ref = stored.ref as string;
      if (stored.kind === "branch" && isEncryptedWorkBranch(ref)) {
        if (!stored.ref_ciphertext ||
            workBranchArtifactRef(stored.ref_ciphertext) !== ref) {
          throw new Error("Invalid encrypted branch artifact");
        }
        ref = await decodeWorkBranchValue(conversation.project_id as string,
          stored.ref_bound_run_id as string | null, stored.id as string,
          stored.ref_ciphertext as string, actorId);
      }
      const url = await decodeAgentPrUrlValue(conversation.project_id as string,
        stored.url_bound_run_id as string | null, stored.id as string,
        stored.url as string | null, actorId);
      replacements.set(stored.id as string, { ref, url });
    }
  }
  if (replacements.size !== pending.length) throw new Error("Agent artifact access changed");
  return rows.map((row) => replacements.has(row.id as string)
    ? { ...row, ...replacements.get(row.id as string) } : row);
}

async function hydrateAgentTurnSummaries(supabase: SupabaseClient,
  turns: Record<string, unknown>[], actorId: string | null) {
  const pending = turns.filter((turn) => isEncryptedRunSummary(turn.outcome as string | null) ||
    isEncryptedRunSummary(turn.error_message as string | null));
  const turnIds = [...new Set(pending.map((turn) => turn.id as string))];
  const scopes = new Map<string, { projectId: string; runId: string | null }>();
  for (let offset = 0; offset < turnIds.length; offset += 100) {
    const { data, error } = await supabase.from("agent_turns")
      .select("id,run_id,conversation:agent_conversations!inner(project_id)")
      .in("id", turnIds.slice(offset, offset + 100));
    if (error) throw new Error("Unable to read agent turn scopes");
    for (const row of data ?? []) {
      const linked = row.conversation as unknown;
      const conversation = Array.isArray(linked)
        ? linked[0] as { project_id: string } | undefined
        : linked as { project_id: string } | null;
      if (conversation?.project_id) scopes.set(row.id as string, {
        projectId: conversation.project_id, runId: row.run_id as string | null,
      });
    }
  }
  return Promise.all(turns.map(async (turn) => {
    const scope = scopes.get(turn.id as string);
    if (!scope) {
      if (pending.includes(turn)) throw new Error("Agent turn access changed");
      return turn;
    }
    const [outcome, error] = await Promise.all([
      decodeTurnSummaryValue(scope.projectId, turn.id as string, scope.runId, "outcome",
        turn.outcome as string | null, actorId),
      decodeTurnSummaryValue(scope.projectId, turn.id as string, scope.runId,
        "error_message", turn.error_message as string | null, actorId),
    ]);
    return { ...turn, outcome, error_message: error };
  }));
}

export function validNumoPatch(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, v]) => {
    if (key === "title") return v === null || (typeof v === "string" && v.length <= 200);
    if (key === "model") return v === null || (typeof v === "string" && v.length <= 300);
    if (key === "reasoningLevel") return v === null || isReasoningLevel(v);
    return ["archived", "pinned", "read"].includes(key) && typeof v === "boolean";
  });
}
