"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Textarea, toast } from "mangue-ui";
import { Loader2, Send } from "lucide-react";

import { FormDialog } from "@/components/form-dialog";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
} from "@/lib/feedback/types";

export function ProductFeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const titleId = useId();
  const descriptionId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setTitle("");
    setDescription("");
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return;
    if (!nextOpen) close();
    else onOpenChange(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/product-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
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
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("shareFeedback")}
      description={t("feedbackDialogDescription")}
      onSubmit={submit}
      submitLabel={t("shareFeedback")}
      submitDisabled={!title.trim()}
      submitting={submitting}
      submitIcon={
        submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )
      }
      cancelLabel={tc("cancel")}
      onCancel={close}
      className="sm:max-w-lg"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-sm font-medium">
          {t("feedbackTitleLabel")}
        </label>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("feedbackTitlePlaceholder")}
          maxLength={FEEDBACK_TITLE_MAX}
          disabled={submitting}
          autoFocus
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={descriptionId} className="text-sm font-medium">
          {t("feedbackDescriptionLabel")}
        </label>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("feedbackDescriptionPlaceholder")}
          maxLength={FEEDBACK_BODY_MAX}
          disabled={submitting}
          rows={6}
        />
      </div>
    </FormDialog>
  );
}
