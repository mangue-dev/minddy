"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { mobileSidebarWidth, sidebarGestureIntent, sidebarGestureSettlesOpen, sidebarRevealRadius } from "@/lib/mobile-sidebar-reveal";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';

/** A sidebar behind the full-width page; only the page surface translates. */
export function MobileSidebarReveal({ open, onOpenChange, trigger, focusTarget, children, label }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>; focusTarget: RefObject<HTMLElement | null>;
  children: ReactNode; label: string;
}) {
  const mobile = useMobileLayout() === true;
  const tc = useTranslations("Common");
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; start: number; lastX: number; lastTime: number; velocity: number; intent: "pending" | "horizontal" } | null>(null);
  const swallowClick = useRef(false);
  const wasOpen = useRef(false);
  const offset = drag ?? (open ? width : 0);
  const shown = open || drag !== null;

  useLayoutEffect(() => {
    if (!mobile) return;
    setSurface(trigger.current?.closest<HTMLElement>(".app-shell") ?? null);
    const resize = () => setWidth(mobileSidebarWidth(window.innerWidth));
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [mobile, trigger]);

  useLayoutEffect(() => {
    if (!mobile || !surface) return;
    surface.setAttribute("data-mobile-sidebar-surface", "");
    surface.parentElement?.setAttribute("data-mobile-sidebar-workspace", "");
    surface.setAttribute("data-mobile-sidebar-open", String(shown));
    surface.setAttribute("data-mobile-sidebar-dragging", String(drag !== null));
    surface.style.setProperty("--mobile-sidebar-offset", `${offset}px`);
    surface.style.setProperty("--mobile-sidebar-radius", `${sidebarRevealRadius(offset, width)}px`);
    surface.inert = shown;
    return () => { surface.inert = false; };
  }, [mobile, surface, offset, shown, drag, width]);

  useLayoutEffect(() => {
    if (!mobile || !surface) return;
    return () => {
      surface.removeAttribute("data-mobile-sidebar-surface");
      surface.parentElement?.removeAttribute("data-mobile-sidebar-workspace");
      surface.removeAttribute("data-mobile-sidebar-open");
      surface.removeAttribute("data-mobile-sidebar-dragging");
      surface.style.removeProperty("--mobile-sidebar-offset");
      surface.style.removeProperty("--mobile-sidebar-radius");
      surface.inert = false;
    };
  }, [surface, mobile]);

  useEffect(() => { if (!mobile) { gesture.current = null; setDrag(null); if (open) onOpenChange(false); } }, [mobile, open, onOpenChange]);

  useLayoutEffect(() => {
    if (!mobile || !surface) return;
    if (open) focusTarget.current?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, mobile, surface, focusTarget, trigger]);

  useEffect(() => {
    if (!mobile || !surface) return;
    const otherDialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]')].some(node => node !== drawer.current && node.getBoundingClientRect().width > 0 && node.getAttribute("data-state") !== "closed" && !node.hasAttribute("data-mobile-sidebar-dialog"));
    const keydown = (event: KeyboardEvent) => {
      if (!open || event.defaultPrevented || otherDialog()) return;
      if (event.key === "Escape") { event.preventDefault(); onOpenChange(false); }
      if (event.key !== "Tab") return;
      const items = [...(drawer.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(node => node.getBoundingClientRect().width > 0 && !node.closest('[inert], [aria-hidden="true"]'));
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); focusTarget.current?.focus({ preventScroll: true }); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === focusTarget.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !event.isPrimary || otherDialog()) return;
      const target = event.target;
      if (!(target instanceof Element) || (!open && event.clientX > 24)) return;
      if (target.closest('input, textarea, select, [contenteditable="true"], [data-mobile-gesture-lock]')) return;
      if (!open && target.closest('button, a[href], [data-board-column-scroller], [data-radix-scroll-area-viewport]')) return;
      if (open && !drawer.current?.contains(target) && !target.closest("[data-mobile-sidebar-dismiss]")) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: open ? width : 0, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0, intent: "pending" };
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (current.intent === "pending") {
        const intent = sidebarGestureIntent(dx, dy);
        if (intent === "vertical") { gesture.current = null; return; }
        if (intent === "pending" || (!open && dx <= 0)) return;
        current.intent = "horizontal";
      }
      event.preventDefault();
      current.velocity = (event.clientX - current.lastX) / Math.max(1, event.timeStamp - current.lastTime);
      current.lastX = event.clientX; current.lastTime = event.timeStamp;
      setDrag(Math.max(0, Math.min(width, current.start + dx)));
    };
    const finish = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      gesture.current = null;
      if (current.intent !== "horizontal") return;
      swallowClick.current = event.type === "pointerup";
      window.setTimeout(() => { swallowClick.current = false; }, 0);
      onOpenChange(event.type === "pointercancel" ? open : sidebarGestureSettlesOpen(Math.max(0, Math.min(width, current.start + event.clientX - current.x)), width, event.timeStamp - current.lastTime < 100 ? current.velocity : 0));
      setDrag(null);
    };
    const click = (event: MouseEvent) => { if (swallowClick.current) { swallowClick.current = false; event.preventDefault(); event.stopImmediatePropagation(); } };
    window.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      document.removeEventListener("click", click, true);
    };
  }, [mobile, surface, open, width, focusTarget, onOpenChange]);

  if (!mobile || !surface?.parentElement) return null;
  return createPortal(<>
    <div ref={drawer} role={shown ? "dialog" : undefined} aria-modal={shown || undefined} aria-label={label}
      data-mobile-sidebar-dialog data-state={shown ? "open" : "closed"} aria-hidden={!shown} inert={!shown}
      className="mobile-sidebar-reveal" style={{ width }}>
      {children}
    </div>
    {shown && <button type="button" data-mobile-sidebar-dismiss aria-label={tc("close")} onClick={() => onOpenChange(false)} style={{ left: offset }} />}
    <div data-mobile-sidebar-edge aria-hidden style={{ pointerEvents: shown ? "none" : "auto" }} />
  </>, surface.parentElement);
}
