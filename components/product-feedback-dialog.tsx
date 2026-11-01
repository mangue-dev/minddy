"use client";

import { useRef, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FeedbackComposerDialog } from "@/components/feedback/feedback-composer-dialog";
import { useResetAfterClose } from "@/lib/use-dialog-close-content";
import { DOCUMENTATION_FEEDBACK_DESCRIPTION_MAX, type DocumentationFeedbackContext } from "@/lib/documentation-feedback";
import { FEEDBACK_BODY_MAX } from "@/lib/feedback/types";

/**
 * “Share feedback” from the help menu (and “Report an error” in the
 * documentation): the Feedback page's composer reduced to a title, a
 * description and the microphone. It is sent to minddy's own board through
 * `/api/product-feedback`, which signs it with the reader's account.
 */
export function ProductFeedbackDialog({
  open,
  onOpenChange,
  source = "product",
  documentationContext,
  Body,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: "product" | "documentation";
  documentationContext?: DocumentationFeedbackContext;
  /** The rich description, where the app provides it (feedback-rich-body). */
  Body?: ComponentProps<typeof FeedbackComposerDialog>["Body"];
}) {
  const t = useTranslations("Nav");
  const tDictate = useTranslations("Dictate");
  const [title, setTitle] = useState("");
  // The rich editor commits on blur: the ref carries the last committed
  // Markdown, and `submit` forces the blur before reading it.
  const bodyRef = useRef("");
  const [initialBody, setInitialBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const loadBody = (markdown: string) => {
    bodyRef.current = markdown;
    setInitialBody(markdown);
    setEditorKey((key) => key + 1);
  };

  // The fields stay filled while the dialog fades out, then clear.
  const { scheduleReset } = useResetAfterClose(open, () => {
    setTitle("");
    loadBody("");
  });
  const close = () => {
    scheduleReset();
    onOpenChange(false);
  };

  const requestClose = () => {
    if (submitting) return;
    // A dictation in flight lands in this form: closing it would throw it away.
    if (transcribing) {
      toast.info(tDictate("inFlight"), { id: "dictation-in-flight" });
      return;
    }
    close();
  };

  // The server's limit; the documentation's report leaves room for its context.
  const bodyMax = source === "documentation" ? DOCUMENTATION_FEEDBACK_DESCRIPTION_MAX : FEEDBACK_BODY_MAX;

  const submit = async () => {
    if (submitting || transcribing || !title.trim()) return;
    setSubmitting(true);
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The rich editor has no length cap of its own: say what is wrong
      // before the server refuses it with a generic error.
      if (bodyRef.current.length > bodyMax) {
        toast.error(t("feedbackDescriptionTooLong", { max: bodyMax }));
        return;
      }
      const response = await fetch("/api/product-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: bodyRef.current,
          source,
          documentationContext,
        }),
      });
      if (!response.ok) {
        toast.error(
          response.status === 429
            ? t("feedbackRateLimited")
            : t("feedbackSubmitError"),
        );
        return;
      }
      toast.success(t("feedbackSent"));
      close();
    } catch {
      toast.error(t("feedbackSubmitError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FeedbackComposerDialog
      Body={Body}
      bodyMaxLength={bodyMax}
      open={open}
      onOpenChange={onOpenChange}
      onRequestClose={requestClose}
      srTitle={t("shareFeedback")}
      srDescription={t("feedbackDialogDescription")}
      title={title}
      onTitleChange={setTitle}
      titlePlaceholder={t("feedbackTitlePlaceholder")}
      titleAriaLabel={t("feedbackTitleLabel")}
      bodyKey={editorKey}
      initialBody={initialBody}
      onBodyChange={(markdown) => {
        bodyRef.current = markdown;
      }}
      bodyPlaceholder={t("feedbackDescriptionPlaceholder")}
      bodyAriaLabel={t("feedbackDescriptionLabel")}
      dictation={{
        feature: "feedback_voice",
        // The transcript joins the description: there is no project here for
        // Numo to file it against, so the words land as spoken.
        onTranscription: (text) => {
          const current = bodyRef.current;
          loadBody(`${current}${current ? "\n\n" : ""}${text}`);
        },
        onProcessingChange: setTranscribing,
      }}
      submitLabel={t("shareFeedback")}
      canSubmit={!submitting && !transcribing && !!title.trim()}
      busy={submitting}
      onSubmit={() => void submit()}
    />
  );
}
