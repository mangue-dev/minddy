/**
 * Built-in UI strings (EN + FR) with host overrides.
 *
 * Every internal string of the palette goes through t(key). Hosts can
 * override any key via PaletteConfig.strings, and add their own locale.
 */

export type PaletteStrings = Record<string, string>;

export const STRINGS_EN: PaletteStrings = {
  // Search
  "search.placeholder": "Search or type a command…",
  "search.ariaLabel": "Command palette search",
  "search.historyMode": "History",
  "search.tabHint": "Ask {name}",

  // Groups / categories
  "categories.favorites": "Favorites",
  "categories.other": "Other",

  // Results
  "results.loading": "Loading…",
  "results.empty.title": "No results",
  "results.empty.hint": "Try a different search",

  // Footer
  "footer.actions": "Actions",
  "footer.expand": "Expand",
  "footer.swipeForActions": "Swipe ← for actions",

  // Actions popover
  "actionsPopover.searchPlaceholder": "Filter actions…",
  "actionsPopover.searchLabel": "Filter actions",
  "actionsPopover.close": "Close actions",
  "actionsPopover.noResults": "No matching action",
  "actionsPopover.noActions": "No action available",

  // Inline form
  "form.back": "Back",
  "form.noResults": "No results",
  "form.navigateFields": "Navigate fields",
  "form.select": "Select",
  "form.execute": "Execute",
  "form.cancel": "Cancel",
  "form.noActionPending": "No pending action",
  "form.actionFailed": "The action failed",
  "form.keys.tab": "Tab",
  "form.keys.enter": "↵",
  "form.keys.escape": "Esc",

  // Default item actions
  "itemActions.open": "Open",
  "itemActions.favorite.add": "Add to favorites",
  "itemActions.favorite.remove": "Remove from favorites",
};

export const STRINGS_FR: PaletteStrings = {
  // Search
  "search.placeholder": "Rechercher ou taper une commande…",
  "search.ariaLabel": "Recherche de la palette de commandes",
  "search.historyMode": "Historique",
  "search.tabHint": "Demander à {name}",

  // Groups / categories
  "categories.favorites": "Favoris",
  "categories.other": "Autre",

  // Results
  "results.loading": "Chargement…",
  "results.empty.title": "Aucun résultat",
  "results.empty.hint": "Essayez une autre recherche",

  // Footer
  "footer.actions": "Actions",
  "footer.expand": "Déplier",
  "footer.swipeForActions": "Glisser ← pour les actions",

  // Actions popover
  "actionsPopover.searchPlaceholder": "Filtrer les actions…",
  "actionsPopover.searchLabel": "Filtrer les actions",
  "actionsPopover.close": "Fermer les actions",
  "actionsPopover.noResults": "Aucune action ne correspond",
  "actionsPopover.noActions": "Aucune action disponible",

  // Inline form
  "form.back": "Retour",
  "form.noResults": "Aucun résultat",
  "form.navigateFields": "Naviguer entre les champs",
  "form.select": "Sélectionner",
  "form.execute": "Exécuter",
  "form.cancel": "Annuler",
  "form.noActionPending": "Aucune action en attente",
  "form.actionFailed": "L'action a échoué",
  "form.keys.tab": "Tab",
  "form.keys.enter": "↵",
  "form.keys.escape": "Échap",

  // Default item actions
  "itemActions.open": "Ouvrir",
  "itemActions.favorite.add": "Ajouter aux favoris",
  "itemActions.favorite.remove": "Retirer des favoris",
};

const BUILT_IN: Record<string, PaletteStrings> = {
  en: STRINGS_EN,
  fr: STRINGS_FR,
};

/** Translate function type used across the palette. */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * Build the t() function: overrides → locale defaults → English → raw key.
 * Params use {name} interpolation.
 */
export function createTranslate(
  locale: string,
  overrides?: PaletteStrings
): TranslateFn {
  const lang = locale.split("-")[0];
  const base = BUILT_IN[lang] ?? STRINGS_EN;

  return (key, params) => {
    let value = overrides?.[key] ?? base[key] ?? STRINGS_EN[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value;
  };
}
