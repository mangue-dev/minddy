import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import { userHasByokKey } from "@/lib/server/agent/model";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import {
  DEFAULT_AGENT_BRANCH_PREFIX,
  normalizeAgentBranchPrefix,
} from "@/lib/server/agent/branch-name";

/**
 * User agent preferences (MIN-46): its default model, default reasoning level
 * (MIN-122), and branch prefix. Self-managed RLS
 * (user_agent_preferences) → we use the client cookie. `default_model` null =
 * follows root default (app_config.agent_model); `default_reasoning_level`
 * null = `off`. An explicit model is a free id (as at launch) — not
 * allowlist; the effective key (BYOK or platform) is resolved at runtime
 * of the run.
 *
 * The PUT is PARTIAL: only the fields PRESENT in the body are written — the
 * settings live on the same row and are edited by distinct controls, so one
 * must not erase the others.
 */

/**
 * Light guardrail on model id. Accepts the two forms encountered:
 * `provider/model` (OpenRouter, e.g. deepseek/deepseek-v4-flash:free) AND the ids
 * native IDs without a slash (OpenAI `gpt-4o`, Anthropic `claude-opus-4-1`, Gemini…).
 */
const MODEL_ID_RE = /^[\w./:@-]{1,200}$/;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from("user_agent_preferences")
    .select("default_model, default_reasoning_level, branch_prefix")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const row = data as {
    default_model: string | null;
    default_reasoning_level: string | null;
    branch_prefix: string | null;
  } | null;
  return NextResponse.json({
    default_model: row?.default_model ?? null,
    default_reasoning_level: isReasoningLevel(row?.default_reasoning_level)
      ? row.default_reasoning_level
      : null,
    branch_prefix:
      normalizeAgentBranchPrefix(row?.branch_prefix) ?? DEFAULT_AGENT_BRANCH_PREFIX,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  type PrefsBody = {
    default_model?: string | null;
    default_reasoning_level?: string | null;
    branch_prefix?: string | null;
  };
  let body: PrefsBody;
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): the lower `in` would raise instead of refusing.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as PrefsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  if ("default_model" in body) {
    const model = body.default_model ?? null;
    if (model !== null && (typeof model !== "string" || !MODEL_ID_RE.test(model.trim()))) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    // We store the form that the regex validated — not the white spaces around it.
    patch.default_model = model === null ? null : model.trim();
    // Ceiling of the plan model: reject a platform value that would be refused
    // at launch. The picker already grays these models; this also prevents a
    // saved preference from blocking all platform runs on the account.
    if (patch.default_model) {
      try {
        await ensureModelInPlan({
          userId: auth.user.id,
          model: patch.default_model as string,
          mode: (await userHasByokKey(auth.user.id)) ? "byok" : "platform",
        });
      } catch (err) {
        if (isPlanLimitError(err)) return planLimitResponse(err);
        throw err;
      }
    }
  }

  if ("default_reasoning_level" in body) {
    const level = body.default_reasoning_level ?? null;
    if (level !== null && !isReasoningLevel(level)) {
      return NextResponse.json({ error: "Invalid reasoning level" }, { status: 400 });
    }
    patch.default_reasoning_level = level;
  }

  if ("branch_prefix" in body) {
    const prefix =
      body.branch_prefix === null
        ? DEFAULT_AGENT_BRANCH_PREFIX
        : normalizeAgentBranchPrefix(body.branch_prefix);
    if (!prefix) {
      return NextResponse.json({ error: "Invalid branch prefix" }, { status: 400 });
    }
    patch.branch_prefix = prefix;
  }

  const { data, error } = await auth.supabase
    .from("user_agent_preferences")
    .upsert(patch, { onConflict: "user_id" })
    .select("default_model, default_reasoning_level, branch_prefix")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as {
    default_model: string | null;
    default_reasoning_level: string | null;
    branch_prefix: string | null;
  };
  return NextResponse.json({
    default_model: row.default_model ?? null,
    default_reasoning_level: isReasoningLevel(row.default_reasoning_level)
      ? row.default_reasoning_level
      : null,
    branch_prefix:
      normalizeAgentBranchPrefix(row.branch_prefix) ?? DEFAULT_AGENT_BRANCH_PREFIX,
  });
}
