"use client";

import { useTranslations } from "next-intl";
import { ChatInput } from "@/components/assistant/chat-input";
import { useAssistantPanel } from "@/lib/assistant-panel-context";

/**
 * Compact "Ask Numo" composer for the home dashboard (MIN-38) — mirrors
 * AutoKap's `home-quick-actions`: it never talks to the chat API itself, it
 * hands the prompt to the global assistant panel (`projectId: null` → global
 * scope), which opens and auto-sends. Attachments are hidden (`open({prompt})`
 * carries no files — they belong inside the panel).
 *
 * `px-0` annule la gouttière que {@link ChatInput} se donne pour le panneau de
 * Numo : la colonne de l'accueil a déjà la sienne, et la surface doit tomber
 * exactement sur la largeur du bloc — pas 12 px de chaque côté en moins, ni
 * (avec un `-mx-3`) 12 px de plus que les bannières posées juste en dessous.
 */
export function HomeNumoComposer() {
  const t = useTranslations("Home");
  const { open } = useAssistantPanel();

  return (
    <ChatInput
      hideAttach
      className="px-0"
      placeholder={t("numoPlaceholder")}
      onSend={(message) => open({ projectId: null, prompt: message })}
    />
  );
}
