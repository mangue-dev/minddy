"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "mangue-ui";

/** "99+" past two digits, like the other counters. */
export function notificationCountLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * The unread Inbox count (MIN-727): a filled red pill, unlike the muted
 * counters of triage or pull requests, so a new notification is noticed
 * without looking for it. It pops in each time the count changes; reduced
 * motion keeps it still.
 */
export function NotificationBadge({
  count,
  label,
  size = "default",
  className,
}: {
  count: number;
  /** Screen-reader reading, e.g. "3 unread notifications". */
  label: string;
  /** `sm` for tab icons, which leave less room. */
  size?: "default" | "sm";
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (count <= 0) return null;
  return (
    <motion.span
      key={count}
      aria-label={label}
      role="status"
      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 22 }}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-red-500 font-semibold tabular-nums text-white",
        size === "sm"
          ? "h-3.5 min-w-3.5 px-1 text-[9px] leading-none"
          : "h-4 min-w-4 px-1 text-[10px] leading-none",
        className,
      )}
    >
      {notificationCountLabel(count)}
    </motion.span>
  );
}
