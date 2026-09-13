import "server-only";

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
import { isWebSearchEnabled } from "@/lib/server/web-search";
import { getServiceClient } from "@/lib/supabase-service";
import { ManagedAiUnavailableError } from "@/lib/server/ai-runtime";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import {
  beginNumoTurn,
  executeNumoTurn,
  NumoBudgetReservationError,
} from "./turns";

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
}

export interface StartedNumoIntent {
  conversationId: string;
  turnId: string;
  detailHref: string;
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
  if (error instanceof NumoBudgetReservationError) {
    return NextResponse.json(
      { error: "usage_budget_exceeded", code: "usage_budget_exceeded" },
      { status: 402 },
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

  const admittedUsage = await ensureUsageBudget(input.userId, "assistant");
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
    const { data, error } = await input.supabase
      .from("conversations")
      .insert({
        project_id: null,
        user_id: input.userId,
        title: fallbackShortTitle(prompt),
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
        webSearchEnabled: await isWebSearchEnabled(),
        triggerSource: input.triggerSource ?? "chat",
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
      ...(configuration.runtime.mode === "platform"
        ? {
            managedBudget: {
              periodStart: admittedUsage.period.start,
              accountCapUsd: admittedUsage.billing.plan.includedUsageUsd,
              requestedUsd: admittedUsage.billing.plan.includedUsageUsd,
            },
          }
        : {}),
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
      } catch (error) {
        console.error(
          "[numo-intent] background turn failed:",
          (error as Error).message,
        );
      }
    });
  }

  return {
    conversationId: conversation.id,
    turnId: turn.id,
    detailHref: `/agents?conversation=${encodeURIComponent(conversation.id)}`,
  };
}
