import "server-only";

import { afterOrNow } from "@/lib/server/after-safe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { canUseSmartAssign } from "@/lib/server/entitlements";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import {
  recordAiUsage,
  newRunId,
  parseOpenRouterUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import { isStatus } from "@/lib/issue-validation";
import { hasAnyRule, userIdsWithoutRule } from "@/lib/smart-assign-config";
import type { SmartAssignConfigWarning } from "@/lib/types";

/**
 * Smart Assign (MIN-31) — guarantees no active issue stays unassigned on
 * projects that opted in. Triggered after an issue is created past triage
 * without an assignee, or when an unassigned issue leaves triage.
 *
 * - Single-member project (owner only): deterministic, no AI.
 * - Multi-member with no rule written for anyone: deterministic too, the owner —
 *   with no rule the model has nothing but names to compare.
 * - Multi-member with rules: one forced tool call to the model in app_config
 *   (`smart_assign_model`), fed the issue and the per-member rules; any
 *   failure falls back to the owner so the run always assigns someone.
 *
 * L'événement écrit porte `smart_assign_ai` : seul le troisième cas le met à
 * true, et seulement si le modèle a répondu un membre valide. C'est ce que
 * l'activité du ticket distingue — sans ça les trois se lisaient pareil.
 *
 * Everything runs in `after()` — never on the request's critical path — and
 * re-checks its preconditions at execution time, so a stale schedule (toggle
 * flipped, someone assigned meanwhile, status changed back) is a silent no-op.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Surchargeable en base via la clé app_config `smart_assign_model`.
const SMART_ASSIGN_DEFAULT_MODEL = aiModelFallback("smart_assign_model");
const MAX_DESCRIPTION_CHARS = 4000;

/** Statuses Smart Assign acts on: anything past triage that is still a real,
    living issue. */
export function isSmartAssignEligibleStatus(status: unknown): boolean {
  return (
    isStatus(status) &&
    status !== "triage" &&
    status !== "canceled" &&
    status !== "duplicate"
  );
}

export interface SmartAssignParams {
  issueId: string;
  projectId: string;
  /** Who created / transitioned the issue — suppresses their own notification
      when Smart Assign picks them. NULL for integration-created issues. */
  triggerActorId: string | null;
  trigger: "create" | "triage_exit";
}

/** Fire-and-forget entry point for the two server cores (create/update issue).
    Cheap: the real work happens after the response, in runSmartAssign. */
export function scheduleSmartAssign(params: SmartAssignParams): void {
  afterOrNow(() =>
    runSmartAssign(params).catch((e) =>
      console.error("[smart-assign] run failed:", (e as Error).message)
    )
  );
}

export async function runSmartAssign(params: SmartAssignParams): Promise<void> {
  const service = getServiceClient();

  // Re-check everything at execution time — the world may have moved since
  // the schedule (toggle off, project deleted, issue assigned or re-triaged).
  const { data: project } = await service
    .from("projects")
    .select("id, name, owner_id, smart_assign_enabled, smart_assign_rules")
    .eq("id", params.projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project?.smart_assign_enabled) return;
  if (!(await canUseSmartAssign(project.owner_id as string))) return;

  const { data: issue } = await service
    .from("issues")
    .select("id, title, description, status, priority, effort, assignee_id")
    .is("deleted_at", null)
    .eq("id", params.issueId)
    .maybeSingle();
  if (!issue || issue.assignee_id !== null) return;
  if (!isSmartAssignEligibleStatus(issue.status)) return;

  // The team = owner (no project_members row) + members.
  const { data: memberRows } = await service
    .from("project_members")
    .select("user_id")
    .eq("project_id", params.projectId);
  const ownerId = project.owner_id as string;
  const memberIds = [
    ownerId,
    ...(memberRows ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== ownerId),
  ];

  const rules = (project.smart_assign_rules ?? {}) as Record<string, string>;
  // Une règle écrite pour QUELQU'UN de l'équipe est ce qui rend le choix
  // possible : sans aucune, le modèle n'a que des noms à comparer, et le prompt
  // lui dit déjà de retomber sur le owner dans ce cas. Autant ne pas payer
  // l'appel — le résultat est le même, en moins cher et sans latence.
  let chosen: string;
  // Le modèle a-t-il VRAIMENT choisi ? L'activité du ticket le dit, et les deux
  // modes ne se valent pas : le repli sur le propriétaire — faute d'appel, ou
  // faute de réponse exploitable — reste une affectation automatique.
  let chosenByModel = false;
  if (memberIds.length === 1 || !hasAnyRule(memberIds, rules)) {
    // Seul membre, ou aucune règle : pas d'ambiguïté à lever, pas d'IA.
    chosen = ownerId;
  } else {
    const picked = await chooseAssigneeViaAI({
      service,
      projectId: params.projectId,
      projectName: (project.name as string) ?? "",
      issue,
      memberIds,
      ownerId,
      rules,
    });
    chosen = picked ?? ownerId; // the contract is "always assign" — owner on any failure
    chosenByModel = picked !== null;
  }

  // Compare-and-set against a concurrent manual assignment: only claim the
  // issue if it is still unassigned. No row back → someone beat us, stop.
  const { data: claimed } = await service
    .from("issues")
    .update({ assignee_id: chosen })
    .is("deleted_at", null)
    .eq("id", params.issueId)
    .is("assignee_id", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  await insertEvents(service, [
    {
      issue_id: params.issueId,
      actor_id: null,
      type: "updated",
      field: "assignee_id",
      from_value: null,
      to_value: chosen,
      via_smart_assign: true,
      smart_assign_ai: chosenByModel,
    },
  ]);

  if (chosen !== params.triggerActorId) {
    await insertNotifications(service, [
      {
        user_id: chosen,
        project_id: params.projectId,
        type: "assigned",
        issue_id: params.issueId,
        actor_id: null,
        // Sans ce drapeau l'inbox lit un acteur nul et affiche « Quelqu'un » —
        // la timeline, elle, nomme déjà Smart Assign sur le même geste.
        via_smart_assign: true,
      },
    ]);
  }
}

/**
 * Les projets DONT JE SUIS OWNER où Smart Assign est actif alors qu'un membre
 * au moins n'a pas de règle (MIN-31). Lu par le tableau de bord, qui affiche
 * l'avertissement : seul le owner peut écrire ces règles, donc lui seul est
 * averti.
 *
 * L'équipe et la notion de « règle écrite » se lisent exactement comme dans
 * runSmartAssign : owner (sans ligne project_members) + membres, et une règle
 * vide de blancs ne compte pas. Un projet solo n'est jamais signalé — il
 * n'a rien à régler, l'affectation y est déterministe.
 *
 * Ne rejette jamais : c'est un avertissement, il ne doit pas pouvoir faire
 * tomber la lecture du tableau de bord qui le transporte.
 */
export async function loadSmartAssignConfigWarnings(
  userId: string
): Promise<SmartAssignConfigWarning[]> {
  try {
    const service = getServiceClient();

    const { data: projects, error } = await service
      .from("projects")
      .select("id, name, smart_assign_rules")
      .eq("owner_id", userId)
      .eq("smart_assign_enabled", true)
      .is("deleted_at", null);
    if (error || !projects?.length) return [];

    const projectIds = projects.map((p) => p.id as string);
    const { data: memberRows } = await service
      .from("project_members")
      .select("project_id, user_id")
      .in("project_id", projectIds);

    const teamByProject = new Map<string, Set<string>>();
    for (const id of projectIds) teamByProject.set(id, new Set([userId]));
    for (const row of memberRows ?? []) {
      teamByProject.get(row.project_id as string)?.add(row.user_id as string);
    }

    const warnings: SmartAssignConfigWarning[] = [];
    for (const project of projects) {
      const team = teamByProject.get(project.id as string) ?? new Set([userId]);
      if (team.size <= 1) continue;
      const rules = (project.smart_assign_rules ?? {}) as Record<string, string>;
      const missing = userIdsWithoutRule([...team], rules).length;
      if (missing === 0) continue;
      warnings.push({
        projectId: project.id as string,
        projectName: (project.name as string) ?? "",
        missingCount: missing,
        memberCount: team.size,
      });
    }
    return warnings;
  } catch (err) {
    console.error("[smart-assign] warnings failed:", (err as Error).message);
    return [];
  }
}

/** One forced tool call: the model MUST pick a user_id from the enum. Returns
    the validated id, or null on any failure (no key, HTTP error, bad output). */
async function chooseAssigneeViaAI({
  service,
  projectId,
  projectName,
  issue,
  memberIds,
  ownerId,
  rules,
}: {
  service: SupabaseClient;
  projectId: string;
  projectName: string;
  issue: Record<string, unknown>;
  memberIds: string[];
  ownerId: string;
  rules: Record<string, string>;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const [modelCfg, authUsers, { data: categoryRows }] = await Promise.all([
      getAppConfigValues(["smart_assign_model"]),
      fetchAuthUsersById(service, memberIds),
      service
        .from("issue_categories")
        .select("categories(name)")
        .eq("issue_id", issue.id as string),
    ]);
    const model =
      modelCfg["smart_assign_model"]?.trim() || SMART_ASSIGN_DEFAULT_MODEL;

    const memberLines = memberIds
      .map((id) => {
        const name = displayName(toNamed(authUsers.get(id)));
        const owner = id === ownerId ? " [owner]" : "";
        const rule = rules[id]?.trim();
        return `- ${name} (user_id: ${id})${owner}\n  Rule: ${rule || "(no rule)"}`;
      })
      .join("\n");
    const categories = (categoryRows ?? [])
      .map((r) => (r.categories as { name?: string } | null)?.name)
      .filter(Boolean)
      .join(", ");

    const systemPrompt = `You are Smart Assign, minddy's automatic issue router for the project "${projectName}".
A new issue needs an owner. Choose the ONE team member best suited to handle it and call choose_assignee.

Rules:
- You MUST call choose_assignee with exactly one user_id from the member list. Never refuse, never reply in plain text.
- Each member may have an assignment rule: free text written by the project owner describing the kind of tasks they should get (any language). Match the issue against these rules first.
- Use the issue's title, description and categories to identify the type of work; priority and effort are tiebreakers only.
- A member without a rule can still be chosen if nothing else matches better.
- If nothing clearly matches, pick the project owner.`;

    const description =
      typeof issue.description === "string" && issue.description.trim()
        ? issue.description.slice(0, MAX_DESCRIPTION_CHARS)
        : "(none)";
    const userMessage = `## Issue
Title: ${issue.title as string}
Description: ${description}
Categories: ${categories || "None"}
Priority: ${(issue.priority as string) ?? "none"}
Effort: ${(issue.effort as string) ?? "—"}

## Members
${memberLines}`;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "Smart Assign (minddy)",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "choose_assignee",
              description:
                "Assign the issue to exactly one member. Mandatory — you must always pick one.",
              parameters: {
                type: "object",
                properties: { user_id: { type: "string", enum: memberIds } },
                required: ["user_id"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "choose_assignee" } },
        usage: { include: true },
        max_tokens: 256,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    const data = (await response.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { name?: string; arguments?: string } }[];
        };
      }[];
      id?: string;
      model?: string;
      usage?: OpenRouterUsage;
    };
    // Suivi des coûts : appel unique (un run d'un seul appel), imputé au owner
    // du projet — explicitement (MIN-131). Le ticket a bien un créateur, mais
    // Smart Assign est une automatisation DU PROJET, que le owner a activée et
    // que SON budget autorise (`canUseSmartAssign(project.owner_id)`) : facturer
    // le membre qui dépose un ticket lui ferait payer un réglage qui n'est pas
    // le sien, et découplerait le payeur de la porte qui laisse passer l'appel.
    const u = parseOpenRouterUsage(data.usage);
    afterOrNow(() =>
      recordAiUsage({
        runId: newRunId(),
        feature: "smart_assign",
        model: data.model ?? model,
        generationId: data.id ?? null,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.totalTokens,
        cost: u.cost,
        billTo: { projectOwner: projectId },
        projectId,
      }),
    );
    const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (call?.name !== "choose_assignee") return null;
    const args = JSON.parse(call.arguments || "{}") as { user_id?: unknown };
    // Never trust the enum — re-validate against the real member list.
    return typeof args.user_id === "string" && memberIds.includes(args.user_id)
      ? args.user_id
      : null;
  } catch (err) {
    console.error("[smart-assign] AI choice failed:", (err as Error).message);
    return null;
  }
}
