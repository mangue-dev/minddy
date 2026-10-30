import "server-only";
import { mentionPlainText } from "@/lib/mention-link";
import { markdownForReader } from "@/lib/server/mention-access";

import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AssistantMention,
  AssistantPageContext,
  NumoIntentAction,
  NumoIntentSource,
} from "@/lib/assistant-types";
import type { AttachmentInput } from "@/lib/types";
import type { PromptAttachment } from "@/lib/server/assistant/attachment-parts";
import { resolveNumoDefaultStatus } from "@/lib/numo-default-status";
import { newRunId } from "@/lib/server/ai-usage";
import {
  isNumoConversationConfigError,
  resolveNumoTurnConfiguration,
} from "@/lib/server/assistant/conversation-config";
import { validateMessageContext } from "@/lib/server/assistant/message-context";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import { fallbackShortTitle } from "@/lib/server/short-title";
import { ensureUsageBudget } from "@/lib/server/usage";
import { getServiceClient } from "@/lib/supabase-service";
import { encodeConversationTitle, shouldProtectConversationTitle } from
  "./conversation-title-content";
import { ManagedAiUnavailableError } from "@/lib/server/ai-runtime";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import { beginNumoTurn, executeNumoTurn } from "./turns";

export class NumoIntentStartError extends Error {
  constructor(
    public readonly code: "invalid_intent" | "context_unavailable" | "conversation_create_failed",
    public readonly status: number,
  ) {
    super(code);
    this.name = "NumoIntentStartError";
  }
}

export interface StartNumoIntentInput {
  supabase: SupabaseClient;
  userId: string;
  userMetadata?: Record<string, unknown> | null;
  projectId?: string | null;
  prompt: string;
  locale: string;
  timezone?: string;
  source: NumoIntentSource;
  action: NumoIntentAction;
  context?: AssistantPageContext | null;
  mentions?: AssistantMention[];
  attachments?: Array<AttachmentInput | PromptAttachment>;
  /** Continue an existing private canonical conversation. */
  conversationId?: string;
  /** Owner of an existing conversation when another account pays for the turn. */
  conversationUserId?: string;
  /** Stable source-event identity used for idempotent durable admission. */
  requestId?: string;
  /** Let a surface bind its response destination before execution starts. */
  executeInBackground?: boolean;
  triggerSource?: "chat" | "mention";
  /** Server-owned chain identity carried into the canonical turn. */
  /** Server-owned routine occurrence and its shared parent/worker budget. */
  routine?: {
    id: string;
    origin: "scheduled" | "manual" | "event" | "database";
    provenance?: { eventId: string; subjectId: string; subjectType: "issue" | "page" | "feedback"; causeRoutineIds?: string[] };
    scheduledFor: string | null;
    budgetUsd: number | null;
    budgetPercent: number;
  };
}

export interface StartedNumoIntent {
  conversationId: string;
  turnId: string;
}

export async function numoIntentErrorResponse(
  error: unknown,
): Promise<Response> {
  if (isPlanLimitError(error)) return planLimitResponse(error);
  if (error instanceof NumoIntentStartError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof ManagedAiUnavailableError) {
    return NextResponse.json(
      { error: error.message, code: "ai_provider_unavailable" },
      { status: 503 },
    );
  }
  if (isNumoConversationConfigError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Numo unavailable",
      code: "numo_unavailable",
    },
    { status: 500 },
  );
}

/**
 * Admit a trusted server-side product intent through the same durable Numo
 * conversation and turn lifecycle as the interactive composer.
 */
export async function startNumoIntent(
  input: StartNumoIntentInput,
): Promise<StartedNumoIntent> {
  const prompt = sanitizeAssistantMessageContent(input.prompt);
  if (!prompt.trim()) {
    throw new NumoIntentStartError("invalid_intent", 400);
  }

  const context = {
    ...input.context,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  } satisfies AssistantPageContext;
  const validated = await validateMessageContext(
    input.supabase,
    context,
    input.mentions ?? [],
  );
  if (!validated) {
    throw new NumoIntentStartError("context_unavailable", 404);
  }
  const projectId = validated.context?.projectId ?? input.projectId ?? null;

  await ensureUsageBudget(input.userId, "assistant", "assistant_model");
  const configuration = await resolveNumoTurnConfiguration({
    userId: input.userId,
  });
  const service = getServiceClient();
  let createdConversation = false;
  let conversation: { id: string } | null = null;
  if (input.conversationId) {
    const { data, error } = await input.supabase
      .from("conversations")
      .select("id")
      .eq("id", input.conversationId)
      .eq("user_id", input.conversationUserId ?? input.userId)
      .maybeSingle();
    if (error || !data) {
      throw new NumoIntentStartError("context_unavailable", 404);
    }
    conversation = data as { id: string };
  } else {
    const conversationId = randomUUID();
    // A title is read as text: each typed mention as the name its user sees.
    const title = fallbackShortTitle(mentionPlainText(await markdownForReader(input.userId, prompt)));
    const storedTitle = await shouldProtectConversationTitle(service)
      ? await encodeConversationTitle(input.userId, conversationId, title)
      : title;
    const { data, error } = await input.supabase
      .from("conversations")
      .insert({
        id: conversationId,
        project_id: null,
        user_id: input.userId,
        title: storedTitle,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new NumoIntentStartError("conversation_create_failed", 500);
    }
    conversation = data as { id: string };
    createdConversation = true;
  }

  const requestId = input.requestId ?? randomUUID();
  const runId = newRunId();
  let turn;
  try {
    turn = await beginNumoTurn({
      conversationId: conversation.id,
      userId: input.userId,
      requestId,
      runId,
      intent: {
        projectId,
        locale: input.locale,
        timezone: input.timezone ?? "",
        numoDefaultStatus: resolveNumoDefaultStatus(input.userMetadata),
        webSearchEnabled: true,
        triggerSource: input.triggerSource ?? "chat",
        ...(input.routine
          ? {
              routineId: input.routine.id,
              routineOrigin: input.routine.origin,
              routineScheduledFor: input.routine.scheduledFor,
              routineProvenance: input.routine.provenance,
              operationBudgetUsd: input.routine.budgetUsd,
              operationBudgetPercent: input.routine.budgetPercent,
            }
          : {}),
      },
      model: configuration.model,
      reasoningLevel: configuration.reasoningLevel,
      content: prompt,
      context: validated.context,
      metadata: {
        intent: { source: input.source, action: input.action },
        ...(validated.mentions.length > 0
          ? { mentions: validated.mentions }
          : {}),
        ...(input.attachments?.length
          ? { attachments: input.attachments }
          : {}),
      },
    });
  } catch (error) {
    if (createdConversation) {
      await service
        .from("conversations")
        .delete()
        .eq("id", conversation.id)
        .eq("user_id", input.userId);
    }
    throw error;
  }

  if (input.executeInBackground !== false) {
    after(async () => {
      try {
        await executeNumoTurn({
          turnId: turn.id,
          readClient: input.supabase,
          aiRuntime: configuration.runtime,
        });
      } catch {
        console.error("[numo-intent] background_turn_failed", turn.id);
      }
    });
  }

  return {
    conversationId: conversation.id,
    turnId: turn.id,
  };
}
