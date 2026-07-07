"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetTitle, cn } from "mangue-ui";
import type { OpenAssistantOptions } from "@/lib/assistant-panel-context";
import {
  AssistantShell,
  type AssistantShellHandle,
} from "@/components/assistant/assistant-shell";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useProjects } from "@/lib/projects-context";

type DisplayMode = "compact" | "expanded";

// Desktop geometry per display mode. Both modes anchor by right/bottom with
// top/left auto, so the .assistant-panel-morph transition interpolates
// right/bottom/width/height/border-radius from px to px — the surface grows
// AND slides to center in one fluid motion. Mobile stays full-bleed in both
// modes (see shared classes below).
const COMPACT_DESKTOP =
  "md:!inset-auto md:!top-auto md:!left-auto md:!right-4 md:!bottom-4 " +
  "md:!w-[min(450px,calc(100vw-24px))] md:!max-w-none " +
  "md:!h-[min(600px,calc(100dvh-32px))] " +
  "md:rounded-[30px] md:border md:border-l md:origin-bottom-right";

const EXPANDED_DESKTOP =
  "md:!inset-auto md:!top-auto md:!left-auto " +
  "md:!right-[calc((100vw-min(56rem,100vw-4rem))/2)] " +
  "md:!bottom-[calc((100dvh-min(44rem,100dvh-4rem))/2)] " +
  "md:!w-[min(56rem,calc(100vw-4rem))] md:!max-w-none " +
  "md:!h-[min(44rem,calc(100dvh-4rem))] " +
  "md:rounded-2xl md:border md:origin-center";

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
        overlayClassName={cn(
          "transition-[background-color,backdrop-filter] !duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          displayMode === "compact" &&
            "!bg-transparent supports-backdrop-filter:!backdrop-blur-none",
        )}
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
        className={cn(
          "p-0 gap-0",
          // Smoothly morph between compact (FAB corner) and expanded (centered,
          // modal-sized) geometry — see globals.css `.assistant-panel-morph`.
          "assistant-panel-morph",
          // Desktop geometry per mode. Compact animates out *from* the FAB
          // (origin bottom-right); expanded pops from center.
          displayMode === "expanded" ? EXPANDED_DESKTOP : COMPACT_DESKTOP,
          "md:data-open:!slide-in-from-right-0 md:data-closed:!slide-out-to-right-0",
          "md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
          "md:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35),0_4px_12px_-4px_rgba(0,0,0,0.12)]",
          // Mobile: near-full-bleed with thin inset so the surface still
          // reads as a floating card (identical in both display modes).
          "max-md:!inset-2 max-md:!h-auto max-md:!w-auto max-md:!max-w-none",
          "max-md:rounded-[30px] max-md:border",
          "max-md:pb-[env(safe-area-inset-bottom)]",
        )}
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
