"use client";

import type { ReactNode } from "react";
import { DictateButton, type DictateButtonProps } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";

/** A single recorder is mounted, either above mobile fields or in the desktop footer. */
export function CreationDictation({ mobile, busy, busyLabel, ...props }: DictateButtonProps & {
  mobile: boolean;
  busy: boolean;
  busyLabel: string;
}) {
  return <div className="creation-dictation">
    {busy ? <div role="status" className="flex min-h-11 items-center gap-3 text-sm">
      <NumoIcon state="thinking" className="size-6 shrink-0 text-primary" />
      <span className={mobile ? undefined : "sr-only"}>{busyLabel}</span>
    </div> : <DictateButton {...props} showLabel={mobile}
      className={mobile ? "min-h-14 w-full justify-start gap-3 rounded-2xl bg-primary/10 px-4 text-primary [&_svg]:size-5" : "-ml-2"} />}
  </div>;
}

/** Keep desktop's compact row, with labeled property tiles on phones. */
export function CreationProperty({ mobile, label, children }: { mobile: boolean; label: string; children: ReactNode }) {
  if (!mobile) return children;
  return <div className="creation-property"><span className="text-xs text-muted-foreground">{label}</span>{children}</div>;
}
