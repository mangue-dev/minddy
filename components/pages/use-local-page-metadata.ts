"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { PageAutosave } from "@/components/pages/use-page-autosave";

/** The title and icon this surface typed and has not yet seen acknowledged. */
export type LocalPageMetadata = { title?: string; icon?: string | null };

/**
 * Local title and icon overrides for the page header (MIN-704).
 *
 * While a value is typed and its save is pending, the header shows THIS value:
 * the response to an older PATCH must not rewrite the field behind the caret.
 * Once every local write is acknowledged by the autosave, the override has nothing
 * left to protect and is dropped, so the header follows the page list again —
 * including a later rename from another client, Numo or the MCP. The list cache
 * keeps its own echo-guarded preview of the typed value (`previewPage`), so
 * dropping the override never shows an older title in between. A failed save
 * keeps it: its draft is still queued for the retry.
 */
export function useLocalPageMetadata(
  autosave: Pick<PageAutosave, "state" | "hasUnsavedChanges">
): [LocalPageMetadata, Dispatch<SetStateAction<LocalPageMetadata>>] {
  const [edited, setEdited] = useState<LocalPageMetadata>({});
  const settled =
    (autosave.state === "saved" || autosave.state === "conflict") && !autosave.hasUnsavedChanges();
  const overridden = edited.title !== undefined || edited.icon !== undefined;
  useEffect(() => {
    if (settled && overridden) setEdited({});
  }, [settled, overridden]);
  return [edited, setEdited];
}
