"use client";

import { useRouter } from "next/navigation";
import { useMobileNavigation } from "@/lib/mobile-navigation-context";
import Link from "next/link";
import { useRef, type ComponentProps } from "react";
import { useOptionalAppTabSession } from "@/lib/app-tab-session-context";
import { useDeferredRoutePrefetch } from "@/lib/use-route-prefetch-admission";

/** Next calls onNavigate only for an unmodified same-window navigation. */
export default function AppLink({ onClick, onNavigate, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const session = useOptionalAppTabSession();
  const mobile = useMobileNavigation();
  const router = useRouter();
  const destination = useRef<string | null>(null);
  const deferred = useDeferredRoutePrefetch(!mobile && props.as === undefined && props.target === undefined &&
    props.download === undefined && props.legacyBehavior === undefined, props.href, props.prefetch);
  const intent = () => {
    if (deferred && session && typeof props.href === "string") session.prefetch(props.href);
  };
  return <Link {...props} prefetch={deferred ? false : props.prefetch}
    onMouseEnter={(event) => { onMouseEnter?.(event); if (!event.defaultPrevented) intent(); }}
    onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) intent(); }}
    onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) intent(); }}
    onClick={(event) => {
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
