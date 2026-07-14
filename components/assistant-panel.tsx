"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle } from "mangue-ui";
import type { OpenAssistantOptions } from "@/lib/assistant-panel-context";
import {
  AssistantShell,
  type AssistantShellHandle,
} from "@/components/assistant/assistant-shell";
import {
  panelSheetClassName,
  panelOverlayClassName,
  type PanelDisplayMode,
} from "@/components/assistant/panel-geometry";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useProjects } from "@/lib/projects-context";

type DisplayMode = PanelDisplayMode;

/**
 * Global panel hosting the AssistantShell. Opened from anywhere via
 * useAssistantPanel().open(...). On desktop the Sheet floats with insets and
 * rounded corners; on mobile it goes full-bleed for legibility.
 */
export function AssistantPanel() {
  const t = useTranslations("Assistant");
  const {
    isOpen,
    close,
    pendingOptions,
    activePageContext,
    ambientContext,
    clearPendingOptions,
    routeProjectId,
  } = useAssistantPanel();
  // An explicit context from open() (e.g. a specific issue) wins; otherwise
  // fall back to the ambient context of the page the user is on.
  const effectivePageContext = activePageContext ?? ambientContext;
  const { projects } = useProjects();

  // Display mode: session-local, defaults to compact. (No persisted user
  // setting yet — comes with account preferences later.)
  const [displayMode, setDisplayMode] = useState<DisplayMode>("compact");
  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));
  }, []);

  const shellRef = useRef<AssistantShellHandle | null>(null);
  // Tracks whether AssistantShell is actually mounted and its imperative
  // handle is attached. Radix Sheet defers content mount via animation, so
  // a naive setTimeout would race against an unattached ref.
  const [shellReady, setShellReady] = useState(false);
  const handleShellRef = useCallback(
    (handle: AssistantShellHandle | null) => {
      shellRef.current = handle;
      setShellReady(handle !== null);
    },
    [],
  );
  // Guarantees pendingOptions are dispatched at most once per open, even if
  // dependencies (route project id) flip mid-dispatch.
  const dispatchedOptionsRef = useRef<OpenAssistantOptions | null>(null);

  // Effective project id: explicit override on the options wins, otherwise
  // follow whatever the current URL says.
  const effectiveProjectId = useMemo<string | null>(() => {
    if (pendingOptions && "projectId" in pendingOptions) {
      return pendingOptions.projectId ?? null;
    }
    return routeProjectId;
  }, [pendingOptions, routeProjectId]);

  const activeProject = useMemo(() => {
    if (!effectiveProjectId) return null;
    return projects.find((p) => p.id === effectiveProjectId) ?? null;
  }, [effectiveProjectId, projects]);

  // Reset the dispatch guard when the panel closes so the next open is a
  // fresh one-shot. (activePageContext is cleared by the context's close().)
  useEffect(() => {
    if (!isOpen) {
      dispatchedOptionsRef.current = null;
    }
  }, [isOpen]);

  // Consume pendingOptions exactly once per open, but only after the
  // AssistantShell has mounted and its imperative handle is attached.
  // Re-running on `shellReady` flips ensures we don't fire against a null ref.
  useEffect(() => {
    if (!isOpen || !pendingOptions || !shellReady) return;
    const handle = shellRef.current;
    if (!handle) return;
    if (dispatchedOptionsRef.current === pendingOptions) return;
    dispatchedOptionsRef.current = pendingOptions;

    const { prompt, draft, projectId, pageContext } = pendingOptions;
    const targetProjectId =
      projectId === undefined ? effectiveProjectId : projectId;

    if (prompt) {
      // Pass the context explicitly: the state set above only reaches the shell
      // on the next render, after this synchronous one-shot send.
      handle.sendMessage(targetProjectId ?? null, prompt, pageContext ?? null);
    }

    if (draft) {
      handle.fill(draft);
    }

    clearPendingOptions();
  }, [
    isOpen,
    pendingOptions,
    shellReady,
    effectiveProjectId,
    clearPendingOptions,
  ]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        // Compact reads as a widget popover (no tint). Expanded reads as a
        // modal, so it keeps the SheetOverlay base scrim. The transition
        // fades the scrim in/out as the panel morphs between modes.
        overlayClassName={panelOverlayClassName(displayMode)}
        // Don't close when the user interacts with a nested popover or
        // alert dialog (e.g. the conversation history popover). Radix portals
        // those at the body level so they'd otherwise count as "outside".
        // The actual clicked element is `e.detail.originalEvent.target`;
        // `e.target` on a Radix dismissable-layer event is the Dialog content.
        onInteractOutside={(e) => {
          const originalTarget =
            (e as unknown as CustomEvent<{ originalEvent: Event }>).detail
              ?.originalEvent?.target;
          const target =
            originalTarget instanceof HTMLElement ? originalTarget : null;
          if (!target) return;
          if (
            target.closest('[data-slot="popover-content"]') ||
            target.closest('[role="alertdialog"]')
          ) {
            e.preventDefault();
          }
        }}
        data-mode={displayMode}
        className={panelSheetClassName(displayMode)}
      >
        <SheetTitle className="sr-only">{t("title")}</SheetTitle>
        <div className="h-full overflow-hidden">
          {/*
            Keying on effectiveProjectId forces a fresh AssistantShell whenever
            the scope changes (e.g. user navigates between projects while the
            panel is open). Without this, the inner useAssistantChat keeps the
            previous project's conversationId and the next send mismatches.
          */}
          <AssistantShell
            key={effectiveProjectId ?? "__global__"}
            ref={handleShellRef}
            projectId={effectiveProjectId}
            titleSuffix={activeProject?.name ?? null}
            descriptionKey={
              effectiveProjectId ? "emptyDescription" : "globalPlaceholder"
            }
            mobileSubtitle={activeProject?.name}
            compact
            displayMode={displayMode}
            onToggleDisplayMode={toggleDisplayMode}
            onClose={close}
            pageContext={effectivePageContext}
            // Skip localStorage restore when the host is about to dispatch
            // a one-shot action — otherwise the async restore would race
            // with the dispatch and overwrite state.
            skipRestore={Boolean(
              pendingOptions?.prompt || pendingOptions?.draft,
            )}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
