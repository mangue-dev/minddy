"use client";

import { useCallback, useContext } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { fetchAiKeysApi } from "@/lib/agent-keys-api";
import { isAiSurfaceAvailable } from "@/lib/ai-surface-availability";
import { useOptionalAssistantPanelActions } from "@/lib/assistant-panel-context";
import { normalizeSelectionText } from "@/lib/assistant-selection";
import type {
  AssistantPageContext,
  NumoIntentSource,
} from "@/lib/assistant-types";
import { useAuthOptional } from "@/lib/auth-context";
import { useOptionalRuntimeConfig } from "@/lib/runtime-config-provider";
import { aiKeysQueryKey } from "@/lib/use-ai-keys-query";

/**
 * Stand-in client for trees without a QueryClientProvider (public surfaces).
 * Its only query is disabled there, so it never fetches anything.
 */
const INERT_QUERY_CLIENT = new QueryClient();

/**
 * The entry a surface's ambient context names. The source only records
 * provenance; with no surface behind the editor, the generic composer entry.
 */
function selectionSource(ctx: AssistantPageContext | null): NumoIntentSource {
  if (ctx?.pageId) return "page";
  if (ctx?.issueId) return "issue";
  if (ctx?.objectiveId) return "objective";
  if (ctx?.feedbackId) return "feedback";
  return "home";
}

/**
 * "Ask Numo" about a passage selected in an editor.
 *
 * Returns `null` when the editor has no Numo: outside an
 * `AssistantPanelProvider` (public forms and pages under `app/f/**` and
 * `app/p/**` mount the shared editor without it), or when this account cannot
 * use the assistant on this deployment (no managed AI and no enabled personal
 * key) — the same rule the panel applies before it accepts a message.
 *
 * The returned function opens the composer WITHOUT sending: it keeps the
 * surface's ambient context (the open page or issue), adds the quoted
 * selection as a removable pill, and puts the caret in the composer so the
 * user types their question. The selection rides on the next message only.
 */
export function useAskNumoAboutSelection():
  | ((selection: { text: string }) => void)
  | null {
  const actions = useOptionalAssistantPanelActions();
  const auth = useAuthOptional();
  // Optional like the panel: an editor mounted on its own (a test tree)
  // simply offers no entry.
  const config = useOptionalRuntimeConfig();
  const queryClient = useContext(QueryClientContext);

  const managedAi = config?.capabilities.managedAi?.configured === true;
  const readKeys = !!actions && !!config && !managedAi && !!auth?.user && !!queryClient;
  // The same cache entry as `useAiKeysQuery`, read only where Numo can exist.
  const keysQuery = useQuery(
    { queryKey: aiKeysQueryKey, queryFn: fetchAiKeysApi, enabled: readKeys },
    queryClient ?? INERT_QUERY_CLIENT,
  );
  // Unknown while the keys load: keep the entry, the panel still gates sends.
  const available =
    managedAi ||
    (readKeys &&
      (keysQuery.isPending ||
        isAiSurfaceAvailable(false, keysQuery.data?.keys ?? [], "assistant")));

  const ask = useCallback(
    (selection: { text: string }) => {
      if (!actions) return;
      const text = normalizeSelectionText(selection.text);
      if (!text) return;
      const ambient = actions.readAmbientContext();
      actions.openIntent(
        {
          source: selectionSource(ambient),
          action: "discuss",
          projectId: ambient?.projectId ?? null,
          pageContext: { ...ambient, selection: { text } },
        },
        { focusComposer: true },
      );
    },
    [actions],
  );

  return actions && available ? ask : null;
}
