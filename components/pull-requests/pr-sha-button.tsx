"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5 opacity-60" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? t("shaCopied") : t("copySha")}</TooltipContent>
    </Tooltip>
  );
}
