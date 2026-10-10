import "server-only";

import { readAccountAgentPreferences } from "@/lib/server/account-settings";
import { normalizeNativeModelPreferences } from "@/lib/native-agent-models";
import { workerHarnessContext } from "./worker-harness-context";

/** Current account selection is context; launch results freeze the actual worker. */
export async function buildAccountWorkerContext(userId: string): Promise<string> {
  try {
    const result = await readAccountAgentPreferences(userId);
    if (!result.ok) return unavailableContext();
    const prefs = result.prefs;
    const context = {
      selected_engine: prefs.default_engine,
      native_agents_enabled: prefs.native_agents_enabled,
      native_connection: prefs.native_connection,
      ...workerHarnessContext({ agent_engine: prefs.default_engine }),
      ...(prefs.default_engine === "opencode" ? {
        api_model: prefs.default_model,
        api_reasoning_level: prefs.default_reasoning_level,
      } : {
        native_model: normalizeNativeModelPreferences(prefs.native_model_preferences)[prefs.default_engine].model,
        native_reasoning_effort: normalizeNativeModelPreferences(prefs.native_model_preferences)[prefs.default_engine].reasoningEffort,
      }),
    };
    return `\n## Account code-worker selection\n${JSON.stringify(context)}\nThis snapshot describes the account's current selection, not an already launched worker. Launch results and validated worker events describe the actual frozen engine and take precedence for that run, even when the account selection changes. Name that engine when explaining who is working. Never change the engine or fall back to API billing. Numo remains the user's assistant and mediates the selected worker's questions and unsupported operations.`;
  } catch {
    return unavailableContext();
  }
}

function unavailableContext(): string {
  return "\n## Account code-worker selection\nThe account's current worker selection is unavailable. Do not guess its engine, connection or capabilities. Read get_account_settings before describing the configured worker; actual launch results and validated worker events remain authoritative.";
}
