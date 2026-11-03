"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { countLabel } from "@/components/nav-badge";

/**
 * The unread Inbox count (MIN-727): a filled red pill, unlike the muted
 * counters of triage or pull requests, so a new notification is noticed
 * without looking for it. It pops in each time the count changes; reduced
 * motion keeps it still. The pill is not a live region: it is mounted and
 * remounted with its count, in the sidebar and in a tab at once, and a screen
 * reader would hear none or both. `UnreadCountAnnouncer` speaks the count.
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
    <span role="img" aria-label={label} className={cn("inline-flex", className)}>
      <motion.span
        key={count}
        aria-hidden
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 520, damping: 22 }}
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-red-500 font-semibold tabular-nums text-white",
          size === "sm"
            ? "h-3.5 min-w-3.5 px-1 text-[9px] leading-none"
            : "h-4 min-w-4 px-1 text-[10px] leading-none",
        )}
      >
        {countLabel(count)}
      </motion.span>
    </span>
  );
}

/**
 * One polite status, mounted for the whole session (WCAG 4.1.3), that says
 * the unread count when it grows. A live region only speaks a change of its
 * text, so it has to exist before the first notification arrives; the count
 * already there on load and a count that falls (items read) stay silent.
 */
export function UnreadCountAnnouncer({ count, label }: { count: number; label: string }) {
  const previous = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const before = previous.current;
    previous.current = count;
    if (before !== null && count > before) setMessage(label);
  }, [count, label]);
  return <span role="status" className="sr-only">{message}</span>;
}
