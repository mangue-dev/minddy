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
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
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
  } = useAssistantPanel();
  // An explicit context from open() (e.g. a specific issue) wins; otherwise
  // fall back to the ambient context of the page the user is on.
  const effectivePageContext = activePageContext ?? ambientContext;
  // Scope of the live conversation — resolved and owned by the chat provider,
  // which keeps it (and the conversation) alive across open/close cycles.
  const { scopeProjectId, scopeSwitchPending } = useAssistantChatContext();
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

  const activeProject = useMemo(() => {
    if (!scopeProjectId) return null;
    return projects.find((p) => p.id === scopeProjectId) ?? null;
  }, [scopeProjectId, projects]);

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
    // Ces options imposent une portée que la conversation vivante ne porte pas :
    // le provider est en train de lui substituer un fil neuf. Envoyer ici partirait
    // dans celle qui s'en va (MIN-353). Cet effet rejoue quand la bascule est faite
    // — `pendingOptions` n'a pas bougé, et le garde ci-dessous n'a rien consommé.
    if (scopeSwitchPending) return;
    const handle = shellRef.current;
    if (!handle) return;
    if (dispatchedOptionsRef.current === pendingOptions) return;
    dispatchedOptionsRef.current = pendingOptions;

    const {
      prompt,
      draft,
      projectId,
      pageContext,
      mentions,
      command,
      attachments,
    } = pendingOptions;
    const targetProjectId =
      projectId === undefined ? scopeProjectId : projectId;

    if (prompt) {
      // Pass the context explicitly: the state set above only reaches the shell
      // on the next render, after this synchronous one-shot send. Mentions,
      // commande et pièces jointes viennent du composer qui a écrit le message
      // (la home) et voyagent avec lui : le panneau ne fait que les relayer.
      handle.sendMessage(targetProjectId ?? null, prompt, {
        pageContext: pageContext ?? null,
        mentions,
        command,
        attachments,
      });
    }

    if (draft) {
      handle.fill(draft);
    }

    clearPendingOptions();
  }, [
    isOpen,
    pendingOptions,
    shellReady,
    scopeProjectId,
    scopeSwitchPending,
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
            Keying on the scope repart d'une vue neuve quand la portée change :
            brouillon, popover d'historique et scroll ne traînent pas d'un projet
            à l'autre. La CONVERSATION, elle, vit dans AssistantChatProvider —
            ce remontage ne la touche pas.

            Depuis MIN-353 la portée est celle de la CONVERSATION : ce remontage
            ne se produit donc plus qu'en ouvrant une autre conversation ou en en
            commençant une neuve — plus du tout en naviguant, ce qui était
            justement le geste qui faisait disparaître le fil.
          */}
          <AssistantShell
            key={scopeProjectId ?? "__global__"}
            ref={handleShellRef}
            projectId={scopeProjectId}
            descriptionKey={
              scopeProjectId ? "emptyDescription" : "globalPlaceholder"
            }
            mobileSubtitle={activeProject?.name}
            compact
            displayMode={displayMode}
            onToggleDisplayMode={toggleDisplayMode}
            onClose={close}
            pageContext={effectivePageContext}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
