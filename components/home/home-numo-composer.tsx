"use client";

import { useTranslations } from "next-intl";
import { ChatInput } from "@/components/assistant/chat-input";
import { useSlashCommands } from "@/components/assistant/slash-menu";
import {
  useAssistantPanel,
  useSuppressAssistantFab,
} from "@/lib/assistant-panel-context";
import { useResumableConversation } from "@/lib/assistant-chat-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";

/**
 * Compact "Ask Numo" composer for the home dashboard (MIN-38) — mirrors
 * AutoKap's `home-quick-actions`: it never talks to the chat API itself, it
 * hands the prompt to the global assistant panel (`projectId: null` → global
 * scope), which opens and auto-sends.
 *
 * Le « @ », le « / » et le trombone y sont les MÊMES que dans le panneau : même
 * liste de mentions, mêmes commandes, même téléversement. C'est le premier
 * endroit où l'on écrit à Numo — une phrase qu'on y commence ne doit pas perdre
 * à mi-chemin ce qu'elle sait dire une fois le panneau ouvert. Mentions,
 * commande ET pièces jointes voyagent donc avec le prompt
 * (`open({ mentions, command, attachments })`).
 *
 * Les fichiers, eux, sont déjà montés quand l'envoi part : {@link ChatInput}
 * les téléverse à la sélection et bloque l'envoi tant que ça monte. Ce qui
 * traverse l'ouverture n'est donc qu'une liste de chemins de stockage — la
 * raison pour laquelle le trombone était masqué ici (`open()` ne transporte pas
 * de fichier) ne tenait qu'à un relais manquant, pas à un fichier perdu.
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
 *
 * ET C'EST LUI QUI DÉCIDE DU FAB. Ce composer fait déjà ce que le bouton
 * flottant propose — commencer à parler à Numo —, en grand, au centre de
 * l'écran : le FAB posé dans le coin ne répétait qu'une porte déjà ouverte.
 * Il ne garde donc ici qu'un seul usage, REVENIR à une conversation qui existe,
 * et ne paraît qu'à cette condition ([assistant-resumable.ts](../../lib/assistant-resumable.ts)).
 * Déclaré par la surface (`useSuppressAssistantFab`) et non par une liste de
 * routes, pour la même raison que les autres : c'est le COMPOSER qui rend le
 * FAB superflu, pas l'URL. La règle suit donc ce composant partout où il est
 * monté — bloc d'accueil comme écran d'onboarding.
 */
export function HomeNumoComposer() {
  const t = useTranslations("Home");
  const { open } = useAssistantPanel();
  const { mentionables, onMentionQuery } = useNumoMentionables(null);
  const commands = useSlashCommands();
  const resumable = useResumableConversation();
  useSuppressAssistantFab(!resumable);

  return (
    <ChatInput
      className="px-0"
      placeholder={t("numoPlaceholder")}
      mentionables={mentionables}
      onMentionQuery={onMentionQuery}
      commands={commands}
      onSend={(message, attachments, mentions, command) =>
        open({
          projectId: null,
          prompt: message,
          mentions,
          command,
          attachments,
        })
      }
    />
  );
}
