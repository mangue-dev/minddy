"use client";

import Link from "next/link";
import { useRef, type ComponentProps } from "react";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";

/** Next calls onNavigate only for an unmodified same-window navigation. */
export default function AppLink({ onClick, onNavigate, ...props }: ComponentProps<typeof Link>) {
  const session = useOptionalAppTabSession();
  const destination = useRef<string | null>(null);
  return <Link {...props} onClick={(event) => {
    const anchor = event.currentTarget;
    destination.current = anchor.origin === window.location.origin
      ? anchor.pathname + anchor.search + anchor.hash : null;
    onClick?.(event);
  }} onNavigate={(event) => {
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; event.preventDefault(); } });
    if (prevented) return;
    if (destination.current && session?.reuseDestination(destination.current)) event.preventDefault();
  }} />;
}
