import type { NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getNumoConversationConfig, getNumoConversationDetail, NUMO_UUID, validNumoPatch } from "@/lib/server/numo/conversations";
import {
  isNumoConversationConfigError,
  resolveNumoTurnConfiguration,
} from "@/lib/server/assistant/conversation-config";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!NUMO_UUID.test(id)) return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  try {
    const detail = await getNumoConversationDetail(auth.supabase, id);
    return detail ? Response.json(detail) : Response.json({ error: "Not found" }, { status: 404 });
  } catch {
    return Response.json({ error: "Unable to read conversation" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let patch: unknown;
  try { patch = await request.json(); } catch { patch = null; }
  if (!NUMO_UUID.test(id) || !validNumoPatch(patch)) {
    return Response.json({ error: "Invalid conversation update" }, { status: 400 });
  }
  const hasConfigPatch = Object.hasOwn(patch, "model") || Object.hasOwn(patch, "reasoningLevel");
  if (hasConfigPatch) {
    try {
      const config = await getNumoConversationConfig(auth.supabase, id);
      if (!config) {
        return Response.json(
          { error: "Conversation configuration is only available for assistant conversations" },
          { status: 400 },
        );
      }
      await resolveNumoTurnConfiguration({
        userId: auth.user.id,
        model: Object.hasOwn(patch, "model") ? patch.model : config.model,
        reasoningLevel: Object.hasOwn(patch, "reasoningLevel")
          ? patch.reasoningLevel
          : config.reasoningLevel,
      });
    } catch (error) {
      if (isPlanLimitError(error)) return planLimitResponse(error);
      if (isNumoConversationConfigError(error)) {
        return Response.json({ error: error.message, code: error.code }, { status: error.status });
      }
      return Response.json({ error: "Unable to validate conversation configuration" }, { status: 503 });
    }
  }
  const { error } = await getServiceClient().rpc("update_numo_conversation", { p_id: id, p_actor: auth.user.id, p_patch: patch });
  if (error) return Response.json({ error: error.code === "P0002" ? "Not found" : "Unable to update conversation" },
    { status: error.code === "P0002" ? 404 : 500 });
  return new Response(null, { status: 204 });
}
