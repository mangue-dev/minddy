import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { locales, type Locale } from "@/i18n/config";
import {
  resolveNumoDefaultStatus,
  isNumoDefaultStatus,
} from "@/lib/numo-default-status";
import {
  PROMPT_COPY_AUTO_START_META_KEY,
  resolvePromptCopyAutoStart,
} from "@/lib/prompt-copy-auto-start";
import {
  AUTO_ASSIGN_ON_START_META_KEY,
  resolveAutoAssignOnStart,
} from "@/lib/auto-assign-on-start";
import {
  CYCLES_ENABLED_META_KEY,
  CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
  CYCLE_DURATION_WEEKS_META_KEY,
  CYCLE_INTENSITY_META_KEY,
  CYCLE_START_DOW_META_KEY,
  CYCLE_UPCOMING_COUNT_META_KEY,
  isCycleIntensity,
  resolveCyclePrefs,
  type CyclePrefs,
} from "@/lib/cycle-prefs";
import {
  AUTOMATION_PRESET_META_KEY,
  isAutomationPresetId,
  resolveAutomationPreset,
  type AutomationPresetId,
} from "@/lib/automations";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META_KEYS,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { isReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import { userHasByokKey } from "@/lib/server/agent/model";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { emailLocalPart } from "@/lib/display-name";

/**
 * The requesting user's own account settings, mirroring Account → Profile /
 * Preferences. Everything editable lives in the Supabase Auth account's
 * `user_metadata`, so these cores read/write it through the service admin API.
 * They act ONLY on the given userId — never another user's account.
 *
 * `email` is read-only (surfaced for context). `display_name` is written to both
 * `display_name` and `full_name` (the profile UI keeps them in sync).
 */

export interface AccountSettings {
  display_name: string;
  email: string | null;
  locale: Locale;
  numo_default_status: ReturnType<typeof resolveNumoDefaultStatus>;
  auto_assign_created: boolean;
  auto_assign_on_start: boolean;
  prompt_copy_auto_start: boolean;
  /** Cycles (MIN-32) — Account → Cycles, one key per knob in user_metadata. */
  cycles: CyclePrefs;
  /** Préréglage d'automatisation (MIN-147) : la boucle Numo appliquée à TOUS les
   *  projets dont ce compte est propriétaire. `null` = aucun. */
  automation_preset: AutomationPresetId | null;
  /** Inbox (MIN-82) — une bascule par famille de déclencheur. */
  notifications: NotificationPrefs;
  /** Préférences de l'agent de code (MIN-46 / MIN-122). Seul réglage de compte
   *  qui ne vit PAS dans `user_metadata` mais dans `user_agent_preferences` —
   *  d'où sa lecture à part. `null` = suit le défaut de l'app. */
  agent: AgentPrefs;
}

export interface AgentPrefs {
  default_model: string | null;
  default_reasoning_level: ReasoningLevel | null;
}

/** Même garde-fou que le PUT de /api/account/agent-preferences : `provider/model`
    (OpenRouter) comme les ids natifs sans slash. Pas d'allowlist. */
const MODEL_ID_RE = /^[\w./:@-]{1,200}$/;

function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Les préférences agent du compte, lues dans `user_agent_preferences`.
 *
 * ABSENCE DE LIGNE ET PANNE DE LECTURE NE SONT PAS LA MÊME CHOSE. Un compte qui
 * n'a jamais touché à ces réglages n'a pas de ligne — c'est le cas courant, et
 * il vaut « aucune préférence ». Une erreur de base, elle, remonte : la rendre
 * comme « aucune préférence » ferait dire à Numo « vous n'avez pas de modèle par
 * défaut » à quelqu'un qui en a un, et fabriquer un état valide mais faux est
 * pire que d'échouer.
 */
async function readAgentPrefs(
  userId: string
): Promise<{ ok: true; prefs: AgentPrefs } | { ok: false; error: string }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("user_agent_preferences")
    .select("default_model, default_reasoning_level")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[account-settings] agent prefs read failed:", error.message);
    return { ok: false, error: error.message };
  }
  const row = data as {
    default_model: string | null;
    default_reasoning_level: string | null;
  } | null;
  return {
    ok: true,
    prefs: {
      default_model: row?.default_model ?? null,
      default_reasoning_level: isReasoningLevel(row?.default_reasoning_level)
        ? row.default_reasoning_level
        : null,
    },
  };
}

function toSettings(
  meta: Record<string, unknown>,
  email: string | null,
  agent: AgentPrefs
): AccountSettings {
  const rawLocale = meta.locale;
  const locale: Locale = locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : "en";
  return {
    display_name:
      metaString(meta, "display_name") ||
      metaString(meta, "full_name") ||
      metaString(meta, "name") ||
      emailLocalPart(email) ||
      "",
    email,
    locale,
    numo_default_status: resolveNumoDefaultStatus(meta),
    auto_assign_created: meta.auto_assign_created === true,
    auto_assign_on_start: resolveAutoAssignOnStart(meta),
    prompt_copy_auto_start: resolvePromptCopyAutoStart(meta),
    cycles: resolveCyclePrefs(meta),
    automation_preset: resolveAutomationPreset(meta),
    notifications: resolveNotificationPrefs(meta),
    agent,
  };
}

export async function getAccountSettings({
  userId,
}: {
  userId: string;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const [{ data, error }, agent] = await Promise.all([
    service.auth.admin.getUserById(userId),
    readAgentPrefs(userId),
  ]);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Account not found." };
  }
  if (!agent.ok) return { ok: false, error: agent.error };
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    settings: toSettings(meta, data.user.email ?? null, agent.prefs),
  };
}

export async function updateAccountSettings({
  userId,
  input,
}: {
  userId: string;
  input: Record<string, unknown>;
}): Promise<
  { ok: true; settings: AccountSettings } | { ok: false; error: string }
> {
  const service = getServiceClient();
  const { data: current, error: readErr } =
    await service.auth.admin.getUserById(userId);
  if (readErr || !current.user) {
    return { ok: false, error: readErr?.message ?? "Account not found." };
  }
  const meta = (current.user.user_metadata ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...meta };

  if ("display_name" in input) {
    const name = typeof input.display_name === "string" ? input.display_name.trim() : "";
    if (!name) return { ok: false, error: "display_name cannot be empty." };
    next.display_name = name;
    next.full_name = name;
  }
  if ("locale" in input) {
    if (!locales.includes(input.locale as Locale)) {
      return { ok: false, error: `locale must be one of: ${locales.join(", ")}.` };
    }
    next.locale = input.locale;
  }
  if ("numo_default_status" in input) {
    if (!isNumoDefaultStatus(input.numo_default_status)) {
      return {
        ok: false,
        error: "numo_default_status must be one of: triage, backlog, todo.",
      };
    }
    next.numo_default_status = input.numo_default_status;
  }
  if ("auto_assign_created" in input) {
    if (typeof input.auto_assign_created !== "boolean") {
      return { ok: false, error: "auto_assign_created must be a boolean." };
    }
    next.auto_assign_created = input.auto_assign_created;
  }
  if ("auto_assign_on_start" in input) {
    if (typeof input.auto_assign_on_start !== "boolean") {
      return { ok: false, error: "auto_assign_on_start must be a boolean." };
    }
    next[AUTO_ASSIGN_ON_START_META_KEY] = input.auto_assign_on_start;
  }
  if ("prompt_copy_auto_start" in input) {
    if (typeof input.prompt_copy_auto_start !== "boolean") {
      return { ok: false, error: "prompt_copy_auto_start must be a boolean." };
    }
    next[PROMPT_COPY_AUTO_START_META_KEY] = input.prompt_copy_auto_start;
  }

  // Préréglage d'automatisation (MIN-147). `null` l'efface — c'est la façon de
  // dire « plus aucune boucle », sans avoir à éteindre chaque projet.
  if ("automation_preset" in input) {
    if (input.automation_preset === null) {
      delete next[AUTOMATION_PRESET_META_KEY];
    } else if (isAutomationPresetId(input.automation_preset)) {
      next[AUTOMATION_PRESET_META_KEY] = input.automation_preset;
    } else {
      return { ok: false, error: "automation_preset is not a known preset." };
    }
  }

  // Inbox (MIN-82) — une bascule par famille, clés d'entrée = clés de meta.
  for (const category of NOTIFICATION_CATEGORIES) {
    const key = NOTIFICATION_CATEGORY_META_KEYS[category];
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean.` };
      }
      next[key] = input[key];
    }
  }

  // Cycles (MIN-32) — same flat input keys as the meta keys.
  for (const key of [
    CYCLES_ENABLED_META_KEY,
    CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
    CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  ]) {
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean.` };
      }
      next[key] = input[key];
    }
  }
  if (CYCLE_DURATION_WEEKS_META_KEY in input) {
    if (input[CYCLE_DURATION_WEEKS_META_KEY] !== 1 && input[CYCLE_DURATION_WEEKS_META_KEY] !== 2) {
      return { ok: false, error: `${CYCLE_DURATION_WEEKS_META_KEY} must be 1 or 2.` };
    }
    next[CYCLE_DURATION_WEEKS_META_KEY] = input[CYCLE_DURATION_WEEKS_META_KEY];
  }
  if (CYCLE_START_DOW_META_KEY in input) {
    const dow = input[CYCLE_START_DOW_META_KEY];
    if (typeof dow !== "number" || !Number.isInteger(dow) || dow < 1 || dow > 7) {
      return { ok: false, error: `${CYCLE_START_DOW_META_KEY} must be 1 (Monday) to 7 (Sunday).` };
    }
    next[CYCLE_START_DOW_META_KEY] = dow;
  }
  if (CYCLE_INTENSITY_META_KEY in input) {
    if (!isCycleIntensity(input[CYCLE_INTENSITY_META_KEY])) {
      return { ok: false, error: `${CYCLE_INTENSITY_META_KEY} must be light, medium or heavy.` };
    }
    next[CYCLE_INTENSITY_META_KEY] = input[CYCLE_INTENSITY_META_KEY];
  }
  if (CYCLE_UPCOMING_COUNT_META_KEY in input) {
    const n = input[CYCLE_UPCOMING_COUNT_META_KEY];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 4) {
      return { ok: false, error: `${CYCLE_UPCOMING_COUNT_META_KEY} must be an integer between 1 and 4.` };
    }
    next[CYCLE_UPCOMING_COUNT_META_KEY] = n;
  }

  // Préférences agent (MIN-46 / MIN-122) : seul bloc qui ne vit pas dans
  // `user_metadata`. Validé et écrit exactement comme le PUT de
  // /api/account/agent-preferences, plafond de plan compris — refuser ici ce
  // qui serait refusé au lancement évite d'enregistrer une préférence qui
  // bloquerait ensuite tous les runs du compte.
  const agentPatch: Record<string, unknown> = {};
  if ("default_model" in input) {
    const model = input.default_model ?? null;
    if (model !== null && (typeof model !== "string" || !MODEL_ID_RE.test(model.trim()))) {
      return { ok: false, error: "default_model is not a valid model id." };
    }
    agentPatch.default_model = model === null ? null : (model as string).trim();
    if (agentPatch.default_model) {
      try {
        await ensureModelInPlan({
          userId,
          model: agentPatch.default_model as string,
          mode: (await userHasByokKey(userId)) ? "byok" : "platform",
        });
      } catch (err) {
        if (isPlanLimitError(err)) {
          // Les paramètres portent le modèle, son multiplicateur et le plafond :
          // les relayer permet à Numo de proposer autre chose, là où un
          // « modèle refusé » sec obligerait l'utilisateur à deviner.
          const p = err.params ?? {};
          return {
            ok: false,
            error:
              p.model !== undefined
                ? `The model ${p.model} costs ×${p.multiplier} the usage of minddy's default model, above the ×${p.limit} ceiling of the ${p.plan} plan. Pick a cheaper model (list_agent_models) or the user can upgrade their plan.`
                : "That model is above the usage ceiling of this account's plan.",
          };
        }
        throw err;
      }
    }
  }
  if ("default_reasoning_level" in input) {
    const level = input.default_reasoning_level ?? null;
    if (level !== null && !isReasoningLevel(level)) {
      return { ok: false, error: "default_reasoning_level must be off, low, medium or high." };
    }
    agentPatch.default_reasoning_level = level;
  }

  // Nothing recognised to change.
  const CHANGEABLE = [
    "display_name",
    "locale",
    "numo_default_status",
    "auto_assign_created",
    "auto_assign_on_start",
    "prompt_copy_auto_start",
    // Sans lui, un appel ne portant QUE le préréglage sortait ici en « rien à
    // changer » — alors que le bloc qui l'écrit venait juste de le poser.
    AUTOMATION_PRESET_META_KEY,
    ...NOTIFICATION_CATEGORIES.map((c) => NOTIFICATION_CATEGORY_META_KEYS[c]),
    CYCLES_ENABLED_META_KEY,
    CYCLE_DURATION_WEEKS_META_KEY,
    CYCLE_START_DOW_META_KEY,
    CYCLE_INTENSITY_META_KEY,
    CYCLE_UPCOMING_COUNT_META_KEY,
    CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
    CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  ];
  const metaChanged = CHANGEABLE.some((k) => k in input);
  if (!metaChanged && Object.keys(agentPatch).length === 0) {
    return { ok: false, error: "No account settings to update." };
  }

  if (Object.keys(agentPatch).length > 0) {
    const { error: agentErr } = await service
      .from("user_agent_preferences")
      .upsert(
        { user_id: userId, updated_at: new Date().toISOString(), ...agentPatch },
        { onConflict: "user_id" }
      );
    if (agentErr) {
      console.error("[account-settings] agent prefs update failed:", agentErr.message);
      return { ok: false, error: agentErr.message };
    }
  }

  if (metaChanged) {
    const { error: writeErr } = await service.auth.admin.updateUserById(userId, {
      user_metadata: next,
    });
    if (writeErr) {
      console.error("[account-settings] update failed:", writeErr.message);
      return { ok: false, error: writeErr.message };
    }
  }

  // Un SEUL chemin pour construire l'état rendu, quel que soit ce qui a bougé —
  // et il propage une panne de lecture au lieu d'inventer des valeurs.
  return getAccountSettings({ userId });
}
