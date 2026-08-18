"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Textarea,
} from "mangue-ui";
import { FormDialog } from "@/components/form-dialog";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";

/**
 * Where does the instruction written here go: the clipboard (“Copy the prompt” →
 * “Custom”) or compose it from Numo agent (“Launch Numo agent” →
 * “Custom”). Only the button and the subtitle depend on it: the text
 * entered is the same on both sides — what we want to see done on this ticket.
 */
export type CustomPromptTarget = "copy" | "launch";

/**
 * The dialog for the “Customized” entry of the two agent submenus of a ticket.
 * It ONLY asks for instructions: the context of the ticket (fields, plan,
 * comments) is provided by minddy around her — the prompt copied the inline
 * in its `<issue>` block, the Numo agent receives it when opening the session.
 *
 * Rendering inside a clickable AND draggable map: React events
 * go up the component tree DESPITE the portal, hence the `stopPropagation`
 * on content — same precaution as `IssueContextMenu`, plus `mousedown`
 * (without it, selecting text with the mouse in the field would arm the
 * map drag sensor, which triggers at 6 px).
 */
export function CustomPromptDialog({
  target,
  onOpenChange,
  onSubmit,
}: {
  /** Open target; `null` = dialog closed. */
  target: CustomPromptTarget | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (instructions: string, target: CustomPromptTarget) => void;
}) {
  const t = useTranslations("Agent");
  const isSend = useIsSendShortcut();
  const tIssueUI = useTranslations("IssueUI");
  const [instructions, setInstructions] = useState("");

  // Each opening starts from an empty field: an instruction is written for ONE
  // launch, finding it at the next one would cause the old one to be restarted inadvertently.
  useEffect(() => {
    if (target) setInstructions("");
  }, [target]);

  const submitLabel = target === "launch" ? t("menuLaunch") : tIssueUI("copyAsPrompt");

  const submit = () => {
    const trimmed = instructions.trim();
    if (!trimmed || !target) return;
    onSubmit(trimmed, target);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={t("customPromptTitle")}
      description={
        target === "launch"
          ? t("customPromptLaunchDescription")
          : t("customPromptCopyDescription")
      }
      className="sm:max-w-lg"
      contentProps={{
        onClick: (e) => e.stopPropagation(),
        onMouseDown: (e) => e.stopPropagation(),
        onContextMenu: (e) => e.stopPropagation(),
      }}
      submitLabel={submitLabel}
      submitDisabled={!instructions.trim()}
      onSubmit={submit}
      dictation={{
        onTranscription: (text) => setInstructions((value) => `${value}${value ? " " : ""}${text}`),
      }}
    >
      <Textarea
        autoFocus
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
            // ⌘/Ctrl+Valid Enter; Enter only remains a newline,
            // a deposit often holding on several — unless the account has
            // set the send to Enter, where Shift+Enter takes over.
            onKeyDown={(e) => {
              if (isSend(e)) {
                e.preventDefault();
                submit();
              }
            }}
        placeholder={t("customPromptPlaceholder")}
        rows={6}
        aria-label={t("customPromptTitle")}
      />
    </FormDialog>
  );
}
