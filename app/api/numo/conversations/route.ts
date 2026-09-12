import type { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getNumoConversation, getNumoConversationConfig, listNumoConversations, NUMO_UUID } from "@/lib/server/numo/conversations";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import {
  isNumoConversationConfigError,
  resolveNumoTurnConfiguration,
} from "@/lib/server/assistant/conversation-config";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (projectId && !NUMO_UUID.test(projectId)) return Response.json({ error: "Invalid project ID" }, { status: 400 });
  try {
    return Response.json(await listNumoConversations(auth.supabase, projectId));
  } catch {
    return Response.json({ error: "Unable to read conversations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  let body: { title?: string | null; projectId?: string | null; model?: string | null; reasoningLevel?: string | null };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((key) => !["title", "projectId", "model", "reasoningLevel"].includes(key))
      || (body.title != null && (typeof body.title !== "string" || body.title.length > 200))
      || (body.projectId != null && (typeof body.projectId !== "string" || !NUMO_UUID.test(body.projectId)))
      || (body.model != null && (typeof body.model !== "string" || body.model.length > 300))
      || (body.reasoningLevel != null && !isReasoningLevel(body.reasoningLevel))) throw new Error();
  } catch {
    return Response.json({ error: "Invalid conversation" }, { status: 400 });
  }
  let configuration;
  if (Object.hasOwn(body, "model") || Object.hasOwn(body, "reasoningLevel")) {
    try {
      configuration = await resolveNumoTurnConfiguration({
        userId: auth.user.id,
        model: body.model,
        reasoningLevel: body.reasoningLevel,
      });
    } catch (error) {
      if (isPlanLimitError(error)) return planLimitResponse(error);
      if (isNumoConversationConfigError(error)) {
        return Response.json({ error: error.message, code: error.code }, { status: error.status });
      }
      return Response.json({ error: "Unable to validate conversation configuration" }, { status: 503 });
    }
  }
  if (body.projectId) {
    const { data, error } = await auth.supabase.from("projects").select("id")
      .eq("id", body.projectId).is("deleted_at", null).maybeSingle();
    if (error) return Response.json({ error: "Unable to read project" }, { status: 500 });
    if (!data) return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const { data, error } = await auth.supabase.from("conversations").insert({
    user_id: auth.user.id, title: body.title?.trim() || null, project_id: body.projectId ?? null,
    ...(configuration?.persistedModel !== null && configuration?.persistedModel !== undefined
      ? { model: configuration.persistedModel }
      : {}),
    ...(configuration?.persistedReasoningLevel !== null && configuration?.persistedReasoningLevel !== undefined
      ? { reasoning_level: configuration.persistedReasoningLevel }
      : {}),
  }).select("id").single();
  if (error || !data) return Response.json({ error: "Unable to create conversation" }, { status: 500 });
  try {
    const conversation = await getNumoConversation(auth.supabase, data.id);
    const config = await getNumoConversationConfig(auth.supabase, data.id);
    return Response.json(
      conversation && config
        ? { ...conversation, model: config.model, reasoning_level: config.reasoningLevel }
        : conversation,
      { status: 201 },
    );
  } catch {
    return Response.json({ error: "Unable to read conversation" }, { status: 500 });
  }
}
