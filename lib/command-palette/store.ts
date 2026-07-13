/**
 * Zustand store for the command palette.
 *
 * Centralized state management:
 * - View routing (search, form, custom views)
 * - Search query and category filter
 * - Navigation (active index, selected item)
 * - Actions popover state
 * - Inline form state
 *
 * Note: the store is a module-level singleton — mount ONE palette per app
 * (the standard pattern for a global command palette).
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { ContextualAction } from "./registry/types";
import type { PaletteItem } from "./types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Active view. "search" and "form" are built in;
 * any other string refers to a custom view passed to <CommandPalette views>.
 */
export type PaletteView = string;

export interface PaletteState {
  // === View Management ===
  view: PaletteView;

  // === Search State ===
  query: string;
  /** Active category tab ("all" or a CategoryDefinition id). */
  categoryFilter: string;

  // === Navigation State ===
  activeIndex: number;
  selectedItem: PaletteItem | null;

  // === Actions Popover State ===
  actionTargetItem: PaletteItem | null;
  actionActiveIndex: number;
  isActionsPopoverOpen: boolean;
  actionsPopoverQuery: string;

  // === Form State ===
  pendingAction: ContextualAction | null;
  pendingActionItem: PaletteItem | null;
  formValues: Record<string, unknown>;
  formErrors: Record<string, string>;
  previousView: PaletteView | null;

  // === UI State ===
  isExpanded: boolean;
  isLoading: boolean;
}

export interface PaletteActions {
  setView: (view: PaletteView) => void;

  setQuery: (query: string) => void;
  setCategoryFilter: (filter: string) => void;

  setActiveIndex: (index: number) => void;
  moveActiveIndex: (delta: number, maxIndex: number) => void;
  selectItem: (item: PaletteItem | null) => void;

  openActionsForItem: (item: PaletteItem) => void;
  openActionsPopover: () => void;
  closeActionsPopover: () => void;
  setActionsPopoverQuery: (query: string) => void;
  setActionActiveIndex: (index: number) => void;
  moveActionActiveIndex: (delta: number, maxIndex: number) => void;

  openFormForAction: (action: ContextualAction, item: PaletteItem) => void;
  setFormValue: (key: string, value: unknown) => void;
  setFormValues: (values: Record<string, unknown>) => void;
  setFormError: (key: string, error: string) => void;
  clearFormErrors: () => void;
  resetForm: () => void;
  /** Close form and return to previous view. */
  closeForm: () => void;

  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  setLoading: (loading: boolean) => void;

  reset: () => void;
  resetToSearch: () => void;
}

export type PaletteStore = PaletteState & PaletteActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: PaletteState = {
  view: "search",

  query: "",
  categoryFilter: "all",

  activeIndex: 0,
  selectedItem: null,

  actionTargetItem: null,
  actionActiveIndex: 0,
  isActionsPopoverOpen: false,
  actionsPopoverQuery: "",

  pendingAction: null,
  pendingActionItem: null,
  formValues: {},
  formErrors: {},
  previousView: null,

  isExpanded: false,
  isLoading: false,
};

// =============================================================================
// STORE
// =============================================================================

export const usePaletteStore = create<PaletteStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setView: (view) => set({ view }, false, "setView"),

      setQuery: (query) =>
        set({ query, activeIndex: 0 }, false, "setQuery"),

      setCategoryFilter: (categoryFilter) =>
        set({ categoryFilter, activeIndex: 0 }, false, "setCategoryFilter"),

      setActiveIndex: (activeIndex) =>
        set({ activeIndex }, false, "setActiveIndex"),

      moveActiveIndex: (delta, maxIndex) =>
        set(
          (state) => {
            let newIndex = state.activeIndex + delta;
            // Wrap around
            if (newIndex < 0) newIndex = maxIndex;
            if (newIndex > maxIndex) newIndex = 0;
            return { activeIndex: newIndex };
          },
          false,
          "moveActiveIndex"
        ),

      selectItem: (selectedItem) => set({ selectedItem }, false, "selectItem"),

      openActionsForItem: (item) =>
        set(
          {
            actionTargetItem: item,
            actionActiveIndex: 0,
            isActionsPopoverOpen: true,
            actionsPopoverQuery: "",
          },
          false,
          "openActionsForItem"
        ),

      openActionsPopover: () =>
        set(
          (state) => ({
            isActionsPopoverOpen: true,
            actionsPopoverQuery: "",
            actionActiveIndex: 0,
            actionTargetItem: state.selectedItem,
          }),
          false,
          "openActionsPopover"
        ),

      closeActionsPopover: () =>
        set(
          {
            isActionsPopoverOpen: false,
            actionTargetItem: null,
            actionActiveIndex: 0,
            actionsPopoverQuery: "",
          },
          false,
          "closeActionsPopover"
        ),

      setActionsPopoverQuery: (actionsPopoverQuery) =>
        set(
          { actionsPopoverQuery, actionActiveIndex: 0 },
          false,
          "setActionsPopoverQuery"
        ),

      setActionActiveIndex: (actionActiveIndex) =>
        set({ actionActiveIndex }, false, "setActionActiveIndex"),

      moveActionActiveIndex: (delta, maxIndex) =>
        set(
          (state) => {
            let newIndex = state.actionActiveIndex + delta;
            if (newIndex < 0) newIndex = maxIndex;
            if (newIndex > maxIndex) newIndex = 0;
            return { actionActiveIndex: newIndex };
          },
          false,
          "moveActionActiveIndex"
        ),

      openFormForAction: (action, item) =>
        set(
          (state) => ({
            pendingAction: action,
            pendingActionItem: item,
            view: "form",
            previousView: state.view,
            formValues: action.requiresForm?.prefilledValues ?? {},
            formErrors: {},
          }),
          false,
          "openFormForAction"
        ),

      setFormValue: (key, value) =>
        set(
          (state) => ({
            formValues: { ...state.formValues, [key]: value },
            formErrors: { ...state.formErrors, [key]: "" },
          }),
          false,
          "setFormValue"
        ),

      setFormValues: (values) =>
        set({ formValues: values }, false, "setFormValues"),

      setFormError: (key, error) =>
        set(
          (state) => ({ formErrors: { ...state.formErrors, [key]: error } }),
          false,
          "setFormError"
        ),

      clearFormErrors: () => set({ formErrors: {} }, false, "clearFormErrors"),

      resetForm: () =>
        set(
          {
            pendingAction: null,
            pendingActionItem: null,
            formValues: {},
            formErrors: {},
            previousView: null,
          },
          false,
          "resetForm"
        ),

      closeForm: () =>
        set(
          (state) => ({
            pendingAction: null,
            pendingActionItem: null,
            formValues: {},
            formErrors: {},
            view: state.previousView ?? "search",
            previousView: null,
          }),
          false,
          "closeForm"
        ),

      setExpanded: (isExpanded) => set({ isExpanded }, false, "setExpanded"),

      toggleExpanded: () =>
        set((state) => ({ isExpanded: !state.isExpanded }), false, "toggleExpanded"),

      setLoading: (isLoading) => set({ isLoading }, false, "setLoading"),

      reset: () => set(initialState, false, "reset"),

      resetToSearch: () =>
        set(
          {
            view: "search",
            actionTargetItem: null,
            actionActiveIndex: 0,
            isActionsPopoverOpen: false,
            actionsPopoverQuery: "",
            pendingAction: null,
            pendingActionItem: null,
            formValues: {},
            formErrors: {},
            previousView: null,
          },
          false,
          "resetToSearch"
        ),
    }),
    { name: "CommandPaletteStore" }
  )
);
