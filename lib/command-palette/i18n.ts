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
  "search.quickAiAria": "Quick AI",

  // Groups / categories
  "categories.other": "Other",

  // Results
  "results.loading": "Loading…",
  "results.empty.title": "No results",
  "results.empty.hint": "Try a different search",
  "shortcuts.then": "then",

  // Footer
  "footer.actions": "Actions",

  // Actions popover
  "actionsPopover.searchPlaceholder": "Filter actions…",
  "actionsPopover.searchLabel": "Filter actions",
  "actionsPopover.noResults": "No matching action",
  "actionsPopover.noActions": "No action available",

  // Inline form
  "form.back": "Back",
  "form.noResults": "No results",
  "form.noActionPending": "No pending action",
  "form.actionFailed": "The action failed",

  // Default item actions
  "itemActions.open": "Open",
};

export const STRINGS_FR: PaletteStrings = {
  // Search
  "search.placeholder": "Rechercher ou taper une commande…",
  "search.ariaLabel": "Recherche de la palette de commandes",
  "search.historyMode": "Historique",
  "search.tabHint": "Demander à {name}",
  "search.quickAiAria": "IA rapide",

  // Groups / categories
  "categories.other": "Autre",

  // Results
  "results.loading": "Chargement…",
  "results.empty.title": "Aucun résultat",
  "results.empty.hint": "Essayez une autre recherche",
  "shortcuts.then": "puis",

  // Footer
  "footer.actions": "Actions",

  // Actions popover
  "actionsPopover.searchPlaceholder": "Filtrer les actions…",
  "actionsPopover.searchLabel": "Filtrer les actions",
  "actionsPopover.noResults": "Aucune action ne correspond",
  "actionsPopover.noActions": "Aucune action disponible",

  // Inline form
  "form.back": "Retour",
  "form.noResults": "Aucun résultat",
  "form.noActionPending": "Aucune action en attente",
  "form.actionFailed": "L'action a échoué",

  // Default item actions
  "itemActions.open": "Ouvrir",
};

export const STRINGS_DE: PaletteStrings = {
  "search.placeholder": "Suchen oder Befehl eingeben…",
  "search.ariaLabel": "Suche in der Befehlspalette",
  "search.historyMode": "Verlauf",
  "search.tabHint": "{name} fragen",
  "search.quickAiAria": "Schnelle KI",
  "categories.other": "Sonstiges",
  "results.loading": "Wird geladen…",
  "results.empty.title": "Keine Ergebnisse",
  "results.empty.hint": "Versuche eine andere Suche",
  "shortcuts.then": "dann",
  "footer.actions": "Aktionen",
  "actionsPopover.searchPlaceholder": "Aktionen filtern…",
  "actionsPopover.searchLabel": "Aktionen filtern",
  "actionsPopover.noResults": "Keine passende Aktion",
  "actionsPopover.noActions": "Keine Aktion verfügbar",
  "form.back": "Zurück",
  "form.noResults": "Keine Ergebnisse",
  "form.noActionPending": "Keine ausstehende Aktion",
  "form.actionFailed": "Die Aktion ist fehlgeschlagen",
  "itemActions.open": "Öffnen",
};

export const STRINGS_ES: PaletteStrings = {
  "search.placeholder": "Busca o escribe un comando…",
  "search.ariaLabel": "Búsqueda de la paleta de comandos",
  "search.historyMode": "Historial",
  "search.tabHint": "Preguntar a {name}",
  "search.quickAiAria": "IA rápida",
  "categories.other": "Otros",
  "results.loading": "Cargando…",
  "results.empty.title": "Sin resultados",
  "results.empty.hint": "Prueba con otra búsqueda",
  "shortcuts.then": "luego",
  "footer.actions": "Acciones",
  "actionsPopover.searchPlaceholder": "Filtrar acciones…",
  "actionsPopover.searchLabel": "Filtrar acciones",
  "actionsPopover.noResults": "Ninguna acción coincide",
  "actionsPopover.noActions": "No hay acciones disponibles",
  "form.back": "Volver",
  "form.noResults": "Sin resultados",
  "form.noActionPending": "Ninguna acción pendiente",
  "form.actionFailed": "La acción falló",
  "itemActions.open": "Abrir",
};

export const STRINGS_IT: PaletteStrings = {
  "search.placeholder": "Cerca o digita un comando…",
  "search.ariaLabel": "Ricerca nella palette dei comandi",
  "search.historyMode": "Cronologia",
  "search.tabHint": "Chiedi a {name}",
  "search.quickAiAria": "IA rapida",
  "categories.other": "Altro",
  "results.loading": "Caricamento…",
  "results.empty.title": "Nessun risultato",
  "results.empty.hint": "Prova con un'altra ricerca",
  "shortcuts.then": "poi",
  "footer.actions": "Azioni",
  "actionsPopover.searchPlaceholder": "Filtra le azioni…",
  "actionsPopover.searchLabel": "Filtra le azioni",
  "actionsPopover.noResults": "Nessuna azione corrispondente",
  "actionsPopover.noActions": "Nessuna azione disponibile",
  "form.back": "Indietro",
  "form.noResults": "Nessun risultato",
  "form.noActionPending": "Nessuna azione in sospeso",
  "form.actionFailed": "L'azione non è riuscita",
  "itemActions.open": "Apri",
};

export const STRINGS_PT: PaletteStrings = {
  "search.placeholder": "Pesquise ou digite um comando…",
  "search.ariaLabel": "Pesquisa da paleta de comandos",
  "search.historyMode": "Histórico",
  "search.tabHint": "Perguntar ao {name}",
  "search.quickAiAria": "IA rápida",
  "categories.other": "Outros",
  "results.loading": "Carregando…",
  "results.empty.title": "Nenhum resultado",
  "results.empty.hint": "Tente outra pesquisa",
  "shortcuts.then": "depois",
  "footer.actions": "Ações",
  "actionsPopover.searchPlaceholder": "Filtrar ações…",
  "actionsPopover.searchLabel": "Filtrar ações",
  "actionsPopover.noResults": "Nenhuma ação corresponde",
  "actionsPopover.noActions": "Nenhuma ação disponível",
  "form.back": "Voltar",
  "form.noResults": "Nenhum resultado",
  "form.noActionPending": "Nenhuma ação pendente",
  "form.actionFailed": "A ação falhou",
  "itemActions.open": "Abrir",
};

// Keyed by language subtag: pt-BR resolves to `pt`.
const BUILT_IN: Record<string, PaletteStrings> = {
  en: STRINGS_EN,
  fr: STRINGS_FR,
  de: STRINGS_DE,
  es: STRINGS_ES,
  it: STRINGS_IT,
  pt: STRINGS_PT,
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
