"use client";

import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Textarea,
} from "mangue-ui";
import { FormDialog } from "@/components/form-dialog";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";

/**
 * The dialog for the “Custom” entry of a ticket's “Copy as prompt” submenu.
 * It ONLY asks for instructions: the context of the ticket (fields, plan,
 * comments) is provided by minddy around them, inline in the `<issue>` block
 * of the copied prompt.
 *
 * Rendering inside a clickable AND draggable map: React events
 * go up the component tree DESPITE the portal, hence the `stopPropagation`
 * on content — same precaution as `IssueContextMenu`, plus `mousedown`
 * (without it, selecting text with the mouse in the field would arm the
 * map drag sensor, which triggers at 6 px).
 */
export function CustomPromptDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (instructions: string) => void;
}) {
  const t = useTranslations("Agent");
  const isSend = useIsSendShortcut();
  const tIssueUI = useTranslations("IssueUI");
  const [instructions, setInstructions] = useState("");

  // Each opening starts from an empty field: an instruction is written for ONE
  // prompt, finding it at the next one would copy the old one inadvertently.
  useEffect(() => {
    if (open) setInstructions("");
  }, [open]);

  const submit = () => {
    const trimmed = instructions.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("customPromptTitle")}
      description={t("customPromptCopyDescription")}
      className="sm:max-w-lg"
      contentProps={{
        onClick: (e) => e.stopPropagation(),
        onMouseDown: (e) => e.stopPropagation(),
        onContextMenu: (e) => e.stopPropagation(),
      }}
      submitLabel={tIssueUI("copyAsPrompt")}
      submitDisabled={!instructions.trim()}
      onSubmit={submit}
      dictation={{
        context: "agent_instruction",
        onTranscription: (text) => setInstructions((value) => `${value}${value ? " " : ""}${text}`),
      }}
    >
      <Textarea
        autoFocus={allowInputAutoFocus()}
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
