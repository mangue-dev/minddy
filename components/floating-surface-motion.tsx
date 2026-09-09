"use client";

import { useEffect } from "react";

const FLOATING_SURFACE_SELECTOR = [
  '[data-slot="popover-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="select-content"]',
  '[data-floating-surface]',
  '[role="menu"]',
].join(", ");

const FLOATING_ITEM_SELECTOR = [
  '[data-slot="dropdown-menu-item"]',
  '[data-slot="dropdown-menu-checkbox-item"]',
  '[data-slot="dropdown-menu-radio-item"]',
  '[data-slot="dropdown-menu-sub-trigger"]',
  '[data-slot="select-item"]',
  '[data-slot="command-item"]',
  '[data-floating-menu-item]',
  '[role="menuitem"]',
  '[role="option"]',
].join(", ");

const FLUID_HOVER_ATTRIBUTE = "data-fluid-hover";
const FLUID_HOVER_PROPERTIES = [
  "--fluid-hover-top",
  "--fluid-hover-left",
  "--fluid-hover-width",
  "--fluid-hover-height",
] as const;

function clearHighlight(surface: HTMLElement) {
  surface.removeAttribute(FLUID_HOVER_ATTRIBUTE);
  for (const property of FLUID_HOVER_PROPERTIES) {
    surface.style.removeProperty(property);
  }
}

function isVisibleItem(item: HTMLElement, surface: HTMLElement): boolean {
  if (
    item.matches("[data-disabled], [aria-disabled=\"true\"], [hidden]") ||
    item.getClientRects().length === 0
  ) {
    return false;
  }

  const itemRect = item.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  return itemRect.bottom > surfaceRect.top && itemRect.top < surfaceRect.bottom;
}

function updateHighlight(surface: HTMLElement, clientY: number) {
  if (!surface.isConnected) return;

  const surfaceRect = surface.getBoundingClientRect();
  const items = Array.from(
    surface.querySelectorAll<HTMLElement>(FLOATING_ITEM_SELECTOR),
  ).filter((item) => isVisibleItem(item, surface));

  if (items.length === 0) {
    clearHighlight(surface);
    return;
  }

  let nearest = items[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const distance = Math.abs(clientY - (rect.top + rect.height / 2));
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }

  const itemRect = nearest.getBoundingClientRect();
  surface.style.setProperty("--fluid-hover-top", `${itemRect.top - surfaceRect.top}px`);
  surface.style.setProperty("--fluid-hover-left", `${itemRect.left - surfaceRect.left}px`);
  surface.style.setProperty("--fluid-hover-width", `${itemRect.width}px`);
  surface.style.setProperty("--fluid-hover-height", `${itemRect.height}px`);
  surface.setAttribute(FLUID_HOVER_ATTRIBUTE, "");
}

/**
 * Adds the nearest-row highlight used by Fluid Functionalism to every floating
 * list surface. Event delegation keeps this working for Radix portals, which
 * mount and unmount outside the component that opened them.
 */
export function FloatingSurfaceMotion() {
  useEffect(() => {
    let activeSurface: HTMLElement | null = null;
    let pointer: { y: number } | null = null;
    let frame: number | null = null;
    let observer: MutationObserver | null = null;

    const schedule = () => {
      if (!activeSurface || !pointer || frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (activeSurface && pointer) {
          updateHighlight(activeSurface, pointer.y);
        }
      });
    };

    const setActiveSurface = (next: HTMLElement | null) => {
      if (activeSurface === next) return;

      if (activeSurface) clearHighlight(activeSurface);
      observer?.disconnect();
      observer = null;
      activeSurface = next;

      if (next) {
        observer = new MutationObserver(schedule);
        observer.observe(next, {
          attributes: true,
          attributeFilter: ["aria-disabled", "class", "data-disabled", "hidden"],
          childList: true,
          subtree: true,
        });
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;

      const target = event.target;
      const surface =
        target instanceof Element
          ? target.closest<HTMLElement>(FLOATING_SURFACE_SELECTOR)
          : null;
      setActiveSurface(surface);
      pointer = surface ? { y: event.clientY } : null;
      schedule();
    };

    const onViewportChange = () => schedule();

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      observer?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (activeSurface) clearHighlight(activeSurface);
    };
  }, []);

  return null;
}
