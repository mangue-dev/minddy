"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { Info } from "lucide-react";

/**
 * The little ⓘ that opens the detailed explanation — it OUTs the prose of the settings.
 *
 * A settings screen can be read at a glance: what is on, what is
 * chosen, what it costs. The paragraph which explains why has its place, but
 * not between the switch and the next one — otherwise we no longer see the organization
 * of the page, only the text. So it lives here, one click away.
 *
 * Born in the Feedback settings, extracted for Automations: two screens
 * that display the same thing should display it the same.
 */
export function HelpHint({ children }: { children: ReactNode }) {
  const t = useTranslations("Settings");
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("feedbackLearnMore")}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-w-xs text-xs leading-relaxed text-muted-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
