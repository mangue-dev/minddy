"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import type { CommentFollowUp } from "@/lib/comment-follow-up";

/**
 * “Copy prompt for N new comments” (MIN-801), above a ticket's comment
 * composer: shown only while people have commented since the ticket's MCP
 * agent last did. It sits in the panel's fixed footer, outside the scrolling
 * thread, so it never covers a comment.
 */
export function CommentFollowUpButton({
  followUp,
  onCopy,
}: {
  followUp: CommentFollowUp | null;
  onCopy: () => Promise<void>;
}) {
  const t = useTranslations("IssueUI");
  const [copying, setCopying] = useState(false);
  if (!followUp) return null;

  return (
    <Button
      type="button"
      className="w-full"
      disabled={copying}
      onClick={() => {
        setCopying(true);
        void onCopy().finally(() => setCopying(false));
      }}
    >
      <HugeiconsIcon icon={Copy01Icon} className="size-4" />
      {t("commentsPromptButton", { count: followUp.count })}
    </Button>
  );
}
