"use client";

import { cn } from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";

/** Static launcher icon with the same blue unread dot as conversation history. */
export function NumoLauncherIcon({
  unread,
  className,
}: {
  unread: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <NumoIcon animated={false} className="size-full" />
      {unread && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-sidebar dark:bg-blue-400"
        />
      )}
    </span>
  );
}
