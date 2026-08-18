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
 * The “@”, the “/” and the paperclip are the SAME as in the panel: same
 * list of mentions, same orders, same upload. This is the first
 * place where you write in Numo — a sentence you start there must not lose
 * halfway through what she can say once the panel is opened. Mentions,
 * order AND attachments therefore travel with the prompt
 * (`open({ mentions, command, attachments })`).
 *
 * The files are already mounted when the sending leaves: {@link ChatInput}
 * uploads them to the selection and blocks the sending as long as it goes up. What
 * passes through the opening is therefore just a list of storage paths — the
 * reason why the paperclip was hidden here (`open()` does not carry
 * file) was only due to a missing relay, not a lost file.
 *
 * Global scope (`null`) on both sides: we cite people, projects,
 * tickets and the objectives of ALL my projects, like the following submission. Nothing
 * loads as long as no “@” is typed — the home page is the most
 * open the application, it does not pay for a list that was not requested.
 *
 * `px-0` cancels the gutter that {@link ChatInput} gives itself for the control panel
 * Numo: the reception column already has its own, and the surface must fall
 * exactly the width of the block — not 12 px less on each side, nor
 * (with a `-mx-3`) 12 px more than the banners placed just below.
 *
 * AND IT IS HE WHO DECIDES ON THE FAB. This composer already does what the button
 * floating proposes — start talking to Numo —, in large, in the center of
 * the screen: the FAB placed in the corner only repeated a door already open.
 * It therefore only has one use here, RETURNING to a conversation that exists,
 * and only appears under this condition ([assistant-resumable.ts](../../lib/assistant-resumable.ts)).
 * Declared by the surface (`useSuppressAssistantFab`) and not by a list of
 * roads, for the same reason as the others: it is the COMPOSER which makes the
 * FOB superfluous, not the URL. The rule therefore follows this component wherever it is
 * mounted — docking block as onboarding screen.
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
