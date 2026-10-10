"use client";

import { useRouter } from "next/navigation";
import { useMobileNavigation } from "@/lib/mobile-navigation-context";
import Link from "next/link";
import { useRef, type ComponentProps } from "react";
import { useOptionalAppTabSession } from "@/lib/app-tab-session-context";

/** Next calls onNavigate only for an unmodified same-window navigation. */
export default function AppLink({ onClick, onNavigate, ...props }: ComponentProps<typeof Link>) {
  const session = useOptionalAppTabSession();
  const mobile = useMobileNavigation();
  const router = useRouter();
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
    if (mobile && destination.current) {
      event.preventDefault();
      const href = destination.current;
      mobile.open(() => {
        if (props.replace) router.replace(href, { scroll: props.scroll });
        else router.push(href, { scroll: props.scroll });
      });
    } else if (destination.current && session?.reuseDestination(destination.current)) event.preventDefault();
  }} />;
}
