/**
 * CommandPalette - Main shell.
 *
 * A light view router over:
 * - SearchView: search, results, calculator, actions popover
 * - FormView: inline forms for actions that need input
 * - Custom views: host-provided views (e.g. an AI chat), reachable via Tab
 *
 * All the heavy logic lives in the child views and hooks.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PaletteConfigProvider, buildCategoryOrder, type ResolvedPaletteConfig } from "./config";
import { createTranslate, type PaletteStrings } from "./i18n";
import { CheckIcon } from "./icons";
import { loadCalculatorLocale } from "./calculator/locale-loader";
import { createActionRegistry } from "./registry/ActionRegistry";
import { CalculatorProvider } from "./registry/providers/CalculatorProvider";
import { ItemActionsProvider } from "./registry/providers/ItemActionsProvider";
import {
  configureSearchStorage,
  isFavorite as isFavoriteLocal,
  toggleFavorite as toggleFavoriteLocal,
  recordUsage,
} from "./search/engine";
import { usePaletteStore } from "./store";
import { useQueryHistory } from "./hooks/useQueryHistory";
import styles from "./styles/CommandPalette.module.css";
import { FormView } from "./views/FormView";
import { SearchView } from "./views/SearchView";
import type { ActionExecutionContext, ActionProvider } from "./registry/types";
import type { CalculatorLocaleConfig } from "./calculator/types";
import type {
  CategoryDefinition,
  PaletteItem,
  PaletteViewRenderer,
} from "./types";

// =============================================================================
// PROPS
// =============================================================================

export interface CommandPaletteProps {
  /** Whether the palette is open. */
  isOpen: boolean;
  /** Callback when the palette should close. */
  onClose: () => void;
  /** All available items. */
  items: PaletteItem[];

  // === Behavior ===
  /** Action providers supplying contextual actions per entity type. */
  providers?: ActionProvider[];
  /**
   * Host data/callbacks exposed to actions via ctx.meta
   * (+ optional navigate/showToast overrides below).
   */
  actionContext?: Record<string, unknown>;
  /** Navigate callback exposed to actions (e.g. router.push). */
  onNavigate?: (path: string) => void;
  /** Toast callback exposed to actions. */
  onToast?: (message: string, type: "success" | "error" | "info") => void;
  /** Override item selection entirely (skips the action registry). */
  onSelectItem?: (item: PaletteItem) => void;

  // === Configuration ===
  /** Locale ("en", "fr", "fr-FR"…). Default "en". */
  locale?: string;
  /** Override any built-in UI string. */
  strings?: PaletteStrings;
  /** Category definitions (tabs order, labels, boosts). */
  categories?: CategoryDefinition[];
  /** Enable the inline calculator. Default true. */
  calculator?: boolean;
  /** Calculator locale overrides (keywords, formats). */
  calculatorLocale?: Partial<CalculatorLocaleConfig>;
  /** localStorage key prefix for favorites/usage/history. Default "command-palette". */
  storagePrefix?: string;
  /** Actions popover shortcut key (with ⌘/Ctrl). Default "m". */
  actionsShortcutKey?: string;
  /** Logo displayed at the left of the footer. */
  footerLogo?: ReactNode;
  /** Compact mode: shows only the search bar until the user types. */
  compactMode?: boolean;
  /** Favorite item ids (overrides the built-in localStorage favorites). */
  favorites?: string[];
  /** Toggle favorite callback (used with `favorites` for external storage). */
  onToggleFavorite?: (itemId: string) => void;
  /** Enable query history recall (ArrowUp). Default true. */
  history?: boolean;

  // === View extension ===
  /** Custom views, keyed by view id. */
  views?: Record<string, PaletteViewRenderer>;
  /**
   * Custom view entered when pressing Tab in the search field
   * (e.g. an AI chat view). Must exist in `views`.
   */
  tabView?: { view: string; hint: string };

  // === Misc ===
  /** Initial query when opening. */
  initialQuery?: string;
  /** Initial view when opening. */
  initialView?: string;
  /** Show the success indicator overlay. */
  isSuccess?: boolean;
  /** Called when a form action completes successfully. */
  onFormSuccess?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CommandPalette({
  isOpen,
  onClose,
  items,
  providers,
  actionContext: actionContextMeta,
  onNavigate,
  onToast,
  onSelectItem,
  locale = "en",
  strings,
  categories = [],
  calculator = true,
  calculatorLocale: calculatorLocaleOverrides,
  storagePrefix = "command-palette",
  actionsShortcutKey = "m",
  footerLogo,
  compactMode = false,
  favorites,
  onToggleFavorite,
  history = true,
  views,
  tabView,
  initialQuery = "",
  initialView = "search",
  isSuccess = false,
  onFormSuccess,
}: CommandPaletteProps) {
  const view = usePaletteStore((s) => s.view);
  const isActionsPopoverOpen = usePaletteStore((s) => s.isActionsPopoverOpen);
  const setView = usePaletteStore((s) => s.setView);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const reset = usePaletteStore((s) => s.reset);

  // Query captured when entering the tab view (via Tab)
  const [tabViewQuery, setTabViewQuery] = useState("");

  // Configure the storage prefix once per change
  useEffect(() => {
    configureSearchStorage(storagePrefix);
  }, [storagePrefix]);

  // === Translate function ===
  const t = useMemo(() => createTranslate(locale, strings), [locale, strings]);

  // === Registry ===
  const registry = useMemo(() => {
    const reg = createActionRegistry();
    reg.register(ItemActionsProvider);
    if (calculator) {
      reg.register(CalculatorProvider);
    }
    for (const provider of providers ?? []) {
      reg.register(provider);
    }
    return reg;
  }, [providers, calculator]);

  // === Calculator locale ===
  const calculatorLocale = useMemo(
    () => loadCalculatorLocale(locale, calculatorLocaleOverrides),
    [locale, calculatorLocaleOverrides]
  );

  // === Resolved config (context value) ===
  const config = useMemo<ResolvedPaletteConfig>(
    () => ({
      t,
      locale,
      categories,
      categoryOrder: buildCategoryOrder(categories),
      registry,
      calculatorEnabled: calculator,
      calculatorLocale,
      shortcuts: { actionsKey: actionsShortcutKey.toLowerCase() },
      footerLogo,
    }),
    [t, locale, categories, registry, calculator, calculatorLocale, actionsShortcutKey, footerLogo]
  );

  // === Query history ===
  const queryHistory = useQueryHistory(storagePrefix);

  // === Action execution context ===
  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const execContext = useMemo<ActionExecutionContext>(
    () => ({
      locale,
      translate: t,
      closeMenu: handleClose,
      navigate: onNavigate,
      showToast: onToast,
      isFavorite: favorites
        ? (id: string) => favorites.includes(id)
        : isFavoriteLocal,
      toggleFavorite: onToggleFavorite ?? toggleFavoriteLocal,
      meta: actionContextMeta ?? {},
    }),
    [locale, t, handleClose, onNavigate, onToast, favorites, onToggleFavorite, actionContextMeta]
  );

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      reset();
      setQuery(initialQuery);
      if (initialView !== "search") {
        setView(initialView);
      }
    }
  }, [isOpen, initialQuery, initialView, reset, setQuery, setView]);

  // Click outside closes
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  // Escape closes (from the search view; other views handle their own Escape).
  // Skipped while the actions popover is open — it closes itself and
  // stopPropagation cannot shield same-node document listeners.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && view === "search" && !isActionsPopoverOpen) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, view, isActionsPopoverOpen, handleClose]);

  // Tab in the search field enters the tab view with the current query
  const handleEnterTabView = useCallback(
    (query: string) => {
      if (!tabView) return;
      setTabViewQuery(query);
      setQuery("");
      setView(tabView.view);
    },
    [tabView, setQuery, setView]
  );

  // Record usage on selection for relevance boosting, then delegate
  const handleSelectWithUsage = useMemo(() => {
    if (!onSelectItem) return undefined;
    return (item: PaletteItem) => {
      recordUsage(item.id);
      onSelectItem(item);
    };
  }, [onSelectItem]);

  // Don't render if not open
  if (!isOpen) return null;

  // Render current view
  const renderView = () => {
    if (view === "form") {
      return (
        <FormView
          actionContext={execContext}
          onSuccess={onFormSuccess ?? handleClose}
          onCancel={() => setView("search")}
        />
      );
    }

    if (view !== "search") {
      const renderer = views?.[view];
      if (renderer) {
        return renderer({
          initialQuery: tabViewQuery,
          backToSearch: () => {
            setTabViewQuery("");
            setView("search");
          },
          closePalette: handleClose,
        });
      }
      // Unknown view: fall back to search
    }

    return (
      <SearchView
        items={items}
        actionContext={execContext}
        onClose={handleClose}
        onSelectItem={handleSelectWithUsage}
        onEnterTabView={tabView ? handleEnterTabView : undefined}
        tabHint={tabView?.hint}
        compactMode={compactMode}
        favorites={favorites}
        historyIndex={history ? queryHistory.historyIndex : -1}
        onHistoryNavigate={history ? queryHistory.navigate : undefined}
        onHistoryReset={history ? queryHistory.reset : undefined}
        onQuerySubmit={history ? queryHistory.submit : undefined}
      />
    );
  };

  return (
    <PaletteConfigProvider value={config}>
      <div className={styles.overlay} onClick={handleOverlayClick}>
        <div
          className={`${styles.palette} ${compactMode ? styles.paletteCompact : ""} ${isSuccess ? styles.paletteSuccess : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          {/* Success indicator overlay */}
          {isSuccess && (
            <div className={styles.successOverlay}>
              <div className={styles.successIcon}>
                <CheckIcon className={styles.successCheckIcon} />
              </div>
            </div>
          )}

          {/* Hide content during success animation */}
          {!isSuccess && renderView()}
        </div>
      </div>
    </PaletteConfigProvider>
  );
}

export default CommandPalette;
