"use client";

import { cn } from "@/lib/utils";
import { NumoIcon } from "@/components/numo-icon";

/** Static launcher icon with the same blue unread dot as conversation history.
    A question Numo is waiting on turns the dot orange: a blue dot read as
    "done", when the turn is in fact blocked on the user. */
export function NumoLauncherIcon({
  unread,
  question = false,
  className,
}: {
  unread: boolean;
  question?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <NumoIcon animated={false} className="size-full" />
      {unread && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-1 -top-1 size-2 rounded-full ring-2 ring-sidebar",
            question ? "bg-orange-500 dark:bg-orange-400" : "bg-blue-500 dark:bg-blue-400"
          )}
        />
      )}
    </span>
  );
}
