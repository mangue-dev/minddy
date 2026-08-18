"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Textarea,
} from "mangue-ui";
import { FormDialog } from "@/components/form-dialog";
import { useIsSendShortcut } from "@/lib/keyboard/use-send-mode";

/**
 * “Copy for agent”: the dialog that asks — without requiring it — what we
 * want to see done on this page.
 *
 * Cousin of the custom ticket prompt
 * ([custom-prompt-dialog.tsx](components/agent/custom-prompt-dialog.tsx)), and
 * deliberately NOT the same component, for the rule that separates them: over there
 * the instruction is the gesture (a “Custom” button without instructions does not mean anything, the button therefore remains disabled as long as the field is empty), here
 * it is OPTIONAL — copying a page to give it to an agent is already a complete
 * gesture, and the field only enables it. Hence a button always
 * active, and a pair of components which cannot merge without one
 * of the two lying.
 *
 * The field takes focus when opened: ⌘⇧L then ⌘Enter copy without instruction,
 * ⌘⇧L then a sentence then ⌘Enter copy with. The quick gesture remains fast.
 *
 * “Cancel” is there although Escape already closes: the output of a dialog must be
 * VISIBLE. Without a button, you only leave the screen by knowing the key, or by
 * clicking outside — two gestures that nothing on the screen announces.
 */
export function PageAgentCopyDialog({
  open,
  pageTitle,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** The title is RECALLED in the subtitle: the dialog also opens with
 keyboard, from anywhere on the page — we must see what we are copying. */
  pageTitle: string;
  onOpenChange: (open: boolean) => void;
  /** The instruction, as is (the trimming lives in the constructor of
 prompt); empty string = nothing is asked. */
  onSubmit: (instructions: string) => void;
}) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const isSend = useIsSendShortcut();
  const [instructions, setInstructions] = useState("");

  // Each opening starts from an empty field: an instruction is written for ONE
  // copy, finding it at the next one would cause the old one to go away inadvertently.
  useEffect(() => {
    if (open) setInstructions("");
  }, [open]);

  const submitLabel = instructions.trim()
    ? t("copyWithInstructions")
    : t("copyLinkOnly");

  const submit = () => {
    onSubmit(instructions);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("copyForAgent")}
      description={t("copyForAgentDescription", { title: pageTitle })}
      className="sm:max-w-lg"
      submitLabel={submitLabel}
      cancelLabel={tCommon("cancel")}
      onSubmit={submit}
      dictation={{
        onTranscription: (text) => setInstructions((value) => `${value}${value ? " " : ""}${text}`),
      }}
    >
      <Textarea
        autoFocus
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
            // ⌘/Ctrl+Valid entry; Enter only remains a newline,
            // a deposit often holding on several — unless the account has
            // set send to Enter, where Shift+Enter takes over.
            onKeyDown={(e) => {
              if (isSend(e)) {
                e.preventDefault();
                submit();
              }
            }}
        placeholder={t("copyForAgentPlaceholder")}
        rows={5}
        aria-label={t("copyForAgentLabel")}
      />
    </FormDialog>
  );
}
