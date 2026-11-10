"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyStateIcon } from "@/components/ui/copy-state-icon";

/** The short SHA, clickable to copy it — a gesture ON the row, so it must not
    trigger the gesture of the row it sits in. */
export function ShaButton({ sha }: { sha: string }) {
  const t = useTranslations("PullRequests");
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(sha);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {sha.slice(0, 7)}
          <CopyStateIcon copied={copied} className="size-3.5" copyClassName="opacity-60" checkClassName="text-emerald-500" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? t("shaCopied") : t("copySha")}</TooltipContent>
    </Tooltip>
  );
}
