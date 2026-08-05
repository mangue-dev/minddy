"use client";

import { useTranslations } from "next-intl";
import { ChatInput } from "@/components/assistant/chat-input";
import { useSlashCommands } from "@/components/assistant/slash-menu";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";

/**
 * Compact "Ask Numo" composer for the home dashboard (MIN-38) — mirrors
 * AutoKap's `home-quick-actions`: it never talks to the chat API itself, it
 * hands the prompt to the global assistant panel (`projectId: null` → global
 * scope), which opens and auto-sends. Attachments are hidden (`open({prompt})`
 * carries no files — they belong inside the panel).
 *
 * Le « @ » et le « / » y sont les MÊMES que dans le panneau : même liste de
 * mentions, mêmes commandes, mêmes hooks. C'est le premier endroit où l'on
 * écrit à Numo — une phrase qu'on y commence ne doit pas perdre à mi-chemin ce
 * qu'elle sait dire une fois le panneau ouvert. Mentions et commande voyagent
 * donc avec le prompt (`open({ mentions, command })`), là où les pièces
 * jointes, elles, restent hors de portée de l'ouverture.
 *
 * Portée globale (`null`) des deux côtés : on cite les gens, les projets, les
 * tickets et les objectifs de TOUS mes projets, comme l'envoi qui suit. Rien ne
 * se charge tant qu'aucun « @ » n'est tapé — l'accueil est la page la plus
 * ouverte de l'application, elle ne paie pas une liste qu'on n'a pas demandée.
 *
 * `px-0` annule la gouttière que {@link ChatInput} se donne pour le panneau de
 * Numo : la colonne de l'accueil a déjà la sienne, et la surface doit tomber
 * exactement sur la largeur du bloc — pas 12 px de chaque côté en moins, ni
 * (avec un `-mx-3`) 12 px de plus que les bannières posées juste en dessous.
 */
export function HomeNumoComposer() {
  const t = useTranslations("Home");
  const { open } = useAssistantPanel();
  const { mentionables, onMentionQuery } = useNumoMentionables(null);
  const commands = useSlashCommands();

  return (
    <ChatInput
      hideAttach
      className="px-0"
      placeholder={t("numoPlaceholder")}
      mentionables={mentionables}
      onMentionQuery={onMentionQuery}
      commands={commands}
      onSend={(message, _attachments, mentions, command) =>
        open({ projectId: null, prompt: message, mentions, command })
      }
    />
  );
}
