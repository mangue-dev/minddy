"use client";

/**
 * Content pickers in the ⌘K palette (MIN-844). Choosing what to link (a
 * relation's other end, a page to cite, an issue for a pull request, a pull
 * request for an issue) opens the palette itself, filtered on the eligible
 * rows only, with a placeholder that says what is being picked, rather than a
 * popover of its own.
 *
 * A surface describes its picker as a {@link PalettePickerRequest} and hands
 * it to {@link usePalettePicker} while it wants it shown. The eager palette
 * launcher opens the palette on every new request, the palette replaces its
 * content with the request's rows, and closing the palette (Escape, a click
 * outside, or a chosen row) calls the request's `onClose` so the surface
 * resets its own state. A multi-step picker (relation type, then target)
 * publishes its next step under another `key`, which clears the typed query.
 *
 * Module-level store, like the palette's own: there is one palette per app.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { usePaletteStore } from "@/lib/command-palette/store";
import type { CategoryDefinition, PaletteItem } from "@/lib/command-palette/types";

/** A last row that creates the content from the typed text (a new page). */
export interface PalettePickerCreateRow {
  id: string;
  /** Category of the row, listed among the request's categories. */
  category: string;
  icon?: ReactNode;
  /** The row's label for the current query (trimmed, possibly empty). */
  label: (query: string) => string;
  onCreate: (query: string) => void;
}

export interface PalettePickerRequest {
  /** Identifies the step: a new key clears the query and the active row. */
  key: string;
  /** Search field placeholder, saying what is being picked and for what. */
  placeholder: string;
  /** The groups, in display order. */
  categories: CategoryDefinition[];
  /** The eligible rows only. Each row's `execute` applies the choice. */
  items: PaletteItem[];
  /**
   * Issues found by meaning among the request's own issue rows (MIN-718):
   * the project searched, `null` for every readable project. Omitted, no
   * semantic search runs.
   */
  semanticProjectId?: string | null;
  /** Shown under the search field when no row matches (e.g. loading). */
  status?: ReactNode;
  create?: PalettePickerCreateRow;
  /** The palette closed, whether a row was chosen or not. */
  onClose?: () => void;
}

interface PalettePickerState {
  request: PalettePickerRequest | null;
  /** The surface that published the request. */
  owner: symbol | null;
  /** Bumped on every new picker, so the launcher opens the palette. */
  openSignal: number;
  /**
   * The owner whose picker the palette just dismissed. Until it withdraws its
   * request, its republishing (a render before its own close lands) is
   * ignored, so a closed palette never reopens on its own.
   */
  dismissed: symbol | null;
}

export const usePalettePickerStore = create<PalettePickerState>(() => ({
  request: null,
  owner: null,
  openSignal: 0,
  dismissed: null,
}));

/** Shows `request`; the same owner updating its picker does not reopen it. */
export function publishPalettePicker(owner: symbol, request: PalettePickerRequest): void {
  if (usePalettePickerStore.getState().dismissed === owner) return;
  usePalettePickerStore.setState((state) => ({
    request,
    owner,
    openSignal: state.owner === owner && state.request ? state.openSignal : state.openSignal + 1,
  }));
}

/** Withdraws `owner`'s picker; another surface's picker is left alone. */
export function releasePalettePicker(owner: symbol): void {
  const state = usePalettePickerStore.getState();
  if (state.dismissed === owner) usePalettePickerStore.setState({ dismissed: null });
  if (state.owner !== owner) return;
  usePalettePickerStore.setState({ request: null, owner: null });
}

/** The palette closed: forget the picker, then tell its surface. */
export function dismissPalettePicker(): void {
  const { request, owner } = usePalettePickerStore.getState();
  if (!request) return;
  usePalettePickerStore.setState({ request: null, owner: null, dismissed: owner });
  request.onClose?.();
}

/**
 * Shows `request` in the palette while it is not null. Passing null, or
 * unmounting, withdraws it (and closes the palette if it was showing it).
 */
export function usePalettePicker(request: PalettePickerRequest | null): void {
  const ownerRef = useRef(Symbol("palette-picker"));
  useEffect(() => {
    const owner = ownerRef.current;
    if (request) publishPalettePicker(owner, request);
    else releasePalettePicker(owner);
  }, [request]);
  useEffect(() => {
    const owner = ownerRef.current;
    return () => releasePalettePicker(owner);
  }, []);
}

/**
 * The palette's side (components/command-palette.tsx): the picker it shows,
 * or null. Closing the palette dismisses the picker, so its surface resets;
 * a surface withdrawing its picker closes the palette. Each new step starts
 * from an empty query, on its first row. The new-tab launcher never shows a
 * picker.
 */
export function usePalettePickerMode({
  open,
  destinationOnly,
  onOpenChange,
}: {
  open: boolean;
  destinationOnly: boolean;
  onOpenChange: (open: boolean) => void;
}): PalettePickerRequest | null {
  const picker = usePalettePickerStore((state) => (destinationOnly ? null : state.request));
  const shown = useRef(false);
  useEffect(() => {
    if (open && picker) {
      shown.current = true;
      return;
    }
    if (!shown.current) return;
    shown.current = false;
    if (!open) dismissPalettePicker();
    else onOpenChange(false);
  }, [open, picker, onOpenChange]);
  const key = picker?.key;
  useEffect(() => {
    if (!key) return;
    const store = usePaletteStore.getState();
    store.setQuery("");
    store.setCategoryFilter("all");
  }, [key]);
  return picker;
}
