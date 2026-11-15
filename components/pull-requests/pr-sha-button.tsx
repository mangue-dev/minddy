"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyStateIcon, CopyStatus } from "@/components/ui/copy-state-icon";
import { useCopyFeedback } from "@/lib/use-copy-feedback";

/** The short SHA, clickable to copy it — a gesture ON the row, so it must not
    trigger the gesture of the row it sits in. */
export function ShaButton({ sha }: { sha: string }) {
  const t = useTranslations("PullRequests");
  const tc = useTranslations("Common");
  const { state, copied, copy } = useCopyFeedback(1500);
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
            onClick={async (e) => {
              e.stopPropagation();
              if (!(await copy(sha))) toast.error(tc("copyFailed"));
            }}
          >
            {sha.slice(0, 7)}
            <CopyStateIcon copied={copied} className="size-3.5" copyClassName="opacity-60" checkClassName="text-emerald-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{copied ? t("shaCopied") : t("copySha")}</TooltipContent>
      </Tooltip>
      <CopyStatus state={state} copiedLabel={t("shaCopied")} />
    </>
  );
}
