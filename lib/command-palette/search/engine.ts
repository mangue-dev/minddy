/**
 * SearchEngine - Isolated search and scoring system for the command palette
 *
 * Features:
 * - Text normalization (accents, special chars)
 * - Multi-strategy matching:
 *   1. Substring matching (all tokens present)
 *   2. Abbreviation matching (initials)
 *   3. Stop word skipping
 *   4. Fuzzy matching (typo tolerance)
 * - Relevance scoring with context boosts
 * - Usage tracking integration
 *
 */

// =============================================================================
// TYPES
// =============================================================================

/** Item structure expected by the search engine */
export interface SearchableItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  /** Optional context id (boosted when it matches SearchContext.currentContextId). */
  contextId?: string;
  /** Optional sub-context id (boosted when it matches SearchContext.currentSubContextId). */
  subContextId?: string;
}

/** Context for search boosting */
export interface SearchContext {
  currentContextId?: string;
  currentSubContextId?: string;
}

/** Usage statistics for an item */
export interface UsageStats {
  count: number;
  lastUsed: number;
}

/** Search result with relevance score */
export interface ScoredSearchResult<T> {
  item: T;
  score: number;
  matchDetails: {
    matchType: string;
    matchedOn: string;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Stop words to skip when matching abbreviations.
 * Common liaison words in French and English.
 */
const STOP_WORDS = new Set([
  // French
  "de", "du", "des", "le", "la", "les", "un", "une",
  "et", "ou", "dans", "sur", "pour", "par", "avec",
  "au", "aux", "ce", "cette", "ces", "en", "a", "à",
  // English
  "the", "a", "an", "and", "or", "in", "on", "for",
  "by", "with", "to", "of", "at", "from", "as", "is",
]);

/**
 * Score weights for different match types (higher = more relevant)
 */
const SCORE_WEIGHTS = {
  // Title matches (most important)
  TITLE_EXACT: 1000,
  TITLE_STARTS_WITH: 800,
  TITLE_WORD_STARTS: 600,
  TITLE_CONTAINS: 400,

  // Keyword matches
  KEYWORD_EXACT: 300,
  KEYWORD_STARTS: 200,

  // Description matches
  DESCRIPTION_CONTAINS: 100,

  // Abbreviation matches
  ABBREVIATION_FULL: 150,
  ABBREVIATION_SKIP: 100,

  // Fuzzy matches
  FUZZY_TITLE: 50,
  FUZZY_KEYWORD: 30,

  // Context boosts
  CONTEXT_PRIMARY: 200,
  CONTEXT_SECONDARY: 150,

  // Usage boosts
  RECENT_USAGE: 250,
  FREQUENT_USAGE: 100,

  // Favorite boost (highest priority)
  FAVORITE: 500,
} as const;

// =============================================================================
// TEXT NORMALIZATION
// =============================================================================

/**
 * Normalizes text for search by:
 * - Removing accents/diacritics (é → e, ç → c, etc.)
 * - Converting to lowercase
 * - Replacing special characters with spaces
 * - Collapsing multiple spaces into one
 * - Trimming whitespace
 *
 * @example
 * normalizeSearchText("Créer une tâche") // "creer une tache"
 * normalizeSearchText("l'application")   // "l application"
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_.']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts initials from text by taking first letter of each word.
 *
 * @example
 * extractInitials("Créer une tâche") // "cut"
 */
export function extractInitials(text: string): string {
  const normalized = normalizeSearchText(text);
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
}

/**
 * Extracts initials skipping stop words.
 *
 * @example
 * extractInitialsWithoutStopWords("Envoyer un message") // "em"
 */
export function extractInitialsWithoutStopWords(text: string): string {
  const normalized = normalizeSearchText(text);
  return normalized
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .map((word) => word[0])
    .join("");
}

// =============================================================================
// MATCHING STRATEGIES
// =============================================================================

/**
 * Checks if query matches text using abbreviation matching.
 * Query characters must match word starts in order.
 */
function abbreviationMatches(query: string, words: string[]): boolean {
  if (query.length === 0 || words.length === 0) return false;

  let queryIndex = 0;
  let wordIndex = 0;

  while (queryIndex < query.length && wordIndex < words.length) {
    const word = words[wordIndex];
    const queryChar = query[queryIndex];

    if (word.length > 0 && word[0] === queryChar) {
      queryIndex++;
    }
    wordIndex++;
  }

  return queryIndex === query.length;
}

/**
 * Calculate Levenshtein distance between two strings with early termination.
 * Used for fuzzy matching to handle typos.
 *
 * Optimizations:
 * - Early exit if length difference exceeds maxDistance
 * - Uses single row instead of full matrix (O(n) space vs O(n*m))
 * - Early termination when row minimum exceeds maxDistance
 *
 * @param a - First string
 * @param b - Second string
 * @param maxDistance - Maximum distance threshold (returns maxDistance + 1 if exceeded)
 */
function levenshteinDistance(a: string, b: string, maxDistance: number = Infinity): number {
  // Early exit: length difference alone exceeds threshold
  const lengthDiff = Math.abs(a.length - b.length);
  if (lengthDiff > maxDistance) return maxDistance + 1;

  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure 'a' is the shorter string for memory optimization
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Use single row instead of full matrix (O(n) space)
  let prevRow = new Array<number>(aLen + 1);
  let currRow = new Array<number>(aLen + 1);

  // Initialize first row
  for (let j = 0; j <= aLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= bLen; i++) {
    currRow[0] = i;
    let rowMin = currRow[0];

    for (let j = 1; j <= aLen; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
      rowMin = Math.min(rowMin, currRow[j]);
    }

    // Early termination: if minimum in row exceeds threshold, distance will too
    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[aLen];
}

/**
 * Check if two strings are similar enough for fuzzy match.
 * Allows 1 typo per 4 characters (min 1).
 *
 * Uses early termination in Levenshtein calculation for performance.
 */
function isFuzzyMatch(query: string, text: string): boolean {
  if (query.length < 2) return false;

  const normalizedQuery = normalizeSearchText(query);
  const normalizedText = normalizeSearchText(text);

  const words = normalizedText.split(/\s+/);
  const maxDistance = Math.max(1, Math.floor(normalizedQuery.length / 4));

  for (const word of words) {
    const prefix = word.slice(0, normalizedQuery.length + 1);
    // Pass maxDistance for early termination optimization
    if (levenshteinDistance(normalizedQuery, prefix, maxDistance) <= maxDistance) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// UNIFIED SEARCH MATCHING
// =============================================================================

/**
 * Unified search matching that supports multiple strategies:
 * 1. Substring matching (all tokens present)
 * 2. Abbreviation matching (query chars match word initials)
 * 3. Stop word skipping
 * 4. Partial word prefix matching
 *
 * @example
 * matchesSearch("em", "Envoyer un message")   // true (abbreviation)
 * matchesSearch("message", "Envoyer un message") // true (substring)
 * matchesSearch("creer tache", "Créer une tâche") // true (multi-word)
 */
export function matchesSearch(query: string, text: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedText = normalizeSearchText(text);

  if (!normalizedQuery) return true;
  if (!normalizedText) return false;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const textWords = normalizedText.split(/\s+/).filter(Boolean);

  // Strategy 1: All query tokens present as substrings
  const allTokensMatch = queryTokens.every((token) =>
    normalizedText.includes(token)
  );
  if (allTokensMatch) return true;

  // For single-token queries, try abbreviation matching
  if (queryTokens.length === 1) {
    const singleQuery = queryTokens[0];

    // Strategy 2: Abbreviation with all words
    if (abbreviationMatches(singleQuery, textWords)) return true;

    // Strategy 3: Abbreviation skipping stop words
    const contentWords = textWords.filter((w) => !STOP_WORDS.has(w));
    if (abbreviationMatches(singleQuery, contentWords)) return true;

    // Strategy 4: Partial word prefix matching
    if (contentWords.some((word) => word.startsWith(singleQuery))) return true;
  }

  return false;
}

/**
 * Check if query matches any of the provided text fields.
 */
export function matchesSearchFields(
  query: string,
  fields: (string | undefined)[]
): boolean {
  const combinedText = fields.filter(Boolean).join(" ");
  return matchesSearch(query, combinedText);
}

// =============================================================================
// RELEVANCE SCORING
// =============================================================================

/**
 * Calculate relevance score for a search query against an item.
 * Returns null if no match, otherwise returns scored result.
 *
 * Scoring considers:
 * - Match type (exact, starts with, contains, abbreviation, fuzzy)
 * - Match location (title > keywords > description)
 * - Context boost (current project/module)
 * - Usage boost (recent, frequent)
 * - Favorite boost (highest priority)
 */
export function calculateSearchScore<T extends SearchableItem>(
  query: string,
  item: T,
  context?: SearchContext,
  usageStats?: Map<string, UsageStats>,
  favorites?: Set<string>
): ScoredSearchResult<T> | null {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return { item, score: 1, matchDetails: { matchType: "empty", matchedOn: "" } };
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const normalizedTitle = normalizeSearchText(item.title);
  const titleWords = normalizedTitle.split(/\s+/).filter(Boolean);
  const contentWords = titleWords.filter((w) => !STOP_WORDS.has(w));

  let score = 0;
  let matchType = "";
  let matchedOn = "";

  // === Title Matches ===
  if (normalizedTitle === normalizedQuery) {
    score = Math.max(score, SCORE_WEIGHTS.TITLE_EXACT);
    matchType = "title_exact";
    matchedOn = item.title;
  } else if (normalizedTitle.startsWith(normalizedQuery)) {
    score = Math.max(score, SCORE_WEIGHTS.TITLE_STARTS_WITH);
    matchType = "title_starts";
    matchedOn = item.title;
  } else if (contentWords.some((word) => word.startsWith(normalizedQuery))) {
    score = Math.max(score, SCORE_WEIGHTS.TITLE_WORD_STARTS);
    matchType = "title_word_starts";
    matchedOn = item.title;
  } else if (queryTokens.every((token) => normalizedTitle.includes(token))) {
    const inOrder =
      queryTokens.reduce((pos, token) => {
        if (pos === -1) return -1;
        const idx = normalizedTitle.indexOf(token, pos);
        return idx;
      }, 0) !== -1;

    score = Math.max(score, SCORE_WEIGHTS.TITLE_CONTAINS + (inOrder ? 50 : 0));
    matchType = "title_contains";
    matchedOn = item.title;
  }

  // === Keyword Matches ===
  for (const keyword of item.keywords) {
    const normalizedKeyword = normalizeSearchText(keyword);

    if (normalizedKeyword === normalizedQuery) {
      score = Math.max(score, SCORE_WEIGHTS.KEYWORD_EXACT);
      if (!matchType) {
        matchType = "keyword_exact";
        matchedOn = keyword;
      }
    } else if (normalizedKeyword.startsWith(normalizedQuery)) {
      score = Math.max(score, SCORE_WEIGHTS.KEYWORD_STARTS);
      if (!matchType) {
        matchType = "keyword_starts";
        matchedOn = keyword;
      }
    }
  }

  // === Description Matches ===
  const normalizedDescription = normalizeSearchText(item.description);
  if (queryTokens.every((token) => normalizedDescription.includes(token))) {
    score = Math.max(score, SCORE_WEIGHTS.DESCRIPTION_CONTAINS);
    if (!matchType) {
      matchType = "description";
      matchedOn = item.description;
    }
  }

  // === Abbreviation Matches ===
  if (queryTokens.length === 1) {
    const singleQuery = queryTokens[0];

    if (abbreviationMatches(singleQuery, titleWords)) {
      score = Math.max(score, SCORE_WEIGHTS.ABBREVIATION_FULL);
      if (!matchType) {
        matchType = "abbreviation";
        matchedOn = item.title;
      }
    } else if (abbreviationMatches(singleQuery, contentWords)) {
      score = Math.max(score, SCORE_WEIGHTS.ABBREVIATION_SKIP);
      if (!matchType) {
        matchType = "abbreviation_skip";
        matchedOn = item.title;
      }
    }
  }

  // === Fuzzy Matches ===
  if (score === 0 && normalizedQuery.length >= 3) {
    if (isFuzzyMatch(normalizedQuery, normalizedTitle)) {
      score = SCORE_WEIGHTS.FUZZY_TITLE;
      matchType = "fuzzy_title";
      matchedOn = item.title;
    } else {
      for (const keyword of item.keywords) {
        if (isFuzzyMatch(normalizedQuery, keyword)) {
          score = SCORE_WEIGHTS.FUZZY_KEYWORD;
          matchType = "fuzzy_keyword";
          matchedOn = keyword;
          break;
        }
      }
    }
  }

  // No match found
  if (score === 0) {
    return null;
  }

  // === Context Boosts ===
  if (context) {
    if (context.currentContextId && item.contextId === context.currentContextId) {
      score += SCORE_WEIGHTS.CONTEXT_PRIMARY;
    }
    if (context.currentSubContextId && item.subContextId === context.currentSubContextId) {
      score += SCORE_WEIGHTS.CONTEXT_SECONDARY;
    }
  }

  // === Usage Boosts ===
  if (usageStats) {
    const stats = usageStats.get(item.id);
    if (stats) {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (stats.lastUsed > fiveMinutesAgo) {
        score += SCORE_WEIGHTS.RECENT_USAGE;
      }
      const frequencyBoost = Math.min(stats.count, 5) * (SCORE_WEIGHTS.FREQUENT_USAGE / 5);
      score += frequencyBoost;
    }
  }

  // === Favorite Boost ===
  if (favorites && favorites.has(item.id)) {
    score += SCORE_WEIGHTS.FAVORITE;
  }

  return { item, score, matchDetails: { matchType, matchedOn } };
}

/**
 * Search and sort items by relevance score.
 */
export function searchWithRelevance<T extends SearchableItem>(
  query: string,
  items: T[],
  context?: SearchContext,
  usageStats?: Map<string, UsageStats>
): T[] {
  if (!query.trim()) {
    return items;
  }

  const scoredResults: ScoredSearchResult<T>[] = [];

  for (const item of items) {
    const result = calculateSearchScore(query, item, context, usageStats);
    if (result) {
      scoredResults.push(result);
    }
  }

  scoredResults.sort((a, b) => b.score - a.score);

  return scoredResults.map((r) => r.item);
}

// =============================================================================
// FAVORITES TRACKING
// =============================================================================

/**
 * Storage key prefix for favorites/usage persistence.
 * Configurable so multiple apps don't collide on the same localStorage keys.
 */
let storagePrefix = "command-palette";

/** Configure the localStorage key prefix (call once at app startup). */
export function configureSearchStorage(prefix: string): void {
  storagePrefix = prefix;
  cachedFavorites = null;
  cachedFavoritesTimestamp = 0;
}

const FAVORITES_STORAGE_KEY = () => `${storagePrefix}:favorites`;

// MENU-M2 FIX: Cache localStorage parsing to avoid repeated JSON.parse
let cachedFavorites: Set<string> | null = null;
let cachedFavoritesTimestamp = 0;
const FAVORITES_CACHE_TTL = 1000; // 1 second cache

/**
 * Load favorites from localStorage.
 * MENU-M2 FIX: Uses in-memory cache to avoid repeated parsing.
 */
export function loadFavorites(): Set<string> {
  const now = Date.now();

  // Return cached value if fresh
  if (cachedFavorites && now - cachedFavoritesTimestamp < FAVORITES_CACHE_TTL) {
    return cachedFavorites;
  }

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY());
    if (!stored) {
      cachedFavorites = new Set();
    } else {
      const parsed = JSON.parse(stored) as string[];
      cachedFavorites = new Set(parsed);
    }
    cachedFavoritesTimestamp = now;
    return cachedFavorites;
  } catch {
    cachedFavorites = new Set();
    cachedFavoritesTimestamp = now;
    return cachedFavorites;
  }
}

/**
 * Save favorites to localStorage.
 * MENU-M2 FIX: Also updates the cache.
 */
function saveFavorites(favorites: Set<string>): void {
  try {
    const arr = Array.from(favorites);
    localStorage.setItem(FAVORITES_STORAGE_KEY(), JSON.stringify(arr));
    // Update cache immediately
    cachedFavorites = favorites;
    cachedFavoritesTimestamp = Date.now();
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the real item ID, stripping the 'fav:' prefix if present.
 * This ensures favorites operations work correctly for items in the favorites group.
 */
export function getRealItemId(itemId: string): string {
  if (itemId.startsWith("fav:")) {
    return itemId.slice(4);
  }
  return itemId;
}

/**
 * Toggle favorite status for an item.
 * Returns the new favorite status.
 */
export function toggleFavorite(itemId: string): boolean {
  const realId = getRealItemId(itemId);
  const favorites = loadFavorites();

  if (favorites.has(realId)) {
    favorites.delete(realId);
    saveFavorites(favorites);
    return false;
  } else {
    favorites.add(realId);
    saveFavorites(favorites);
    return true;
  }
}

/**
 * Check if an item is favorited.
 */
export function isFavorite(itemId: string): boolean {
  const realId = getRealItemId(itemId);
  const favorites = loadFavorites();
  return favorites.has(realId);
}

// =============================================================================
// USAGE TRACKING
// =============================================================================

const USAGE_STORAGE_KEY = () => `${storagePrefix}:usage`;
const MAX_TRACKED_ITEMS = 100;

/**
 * Load usage statistics from localStorage.
 */
export function loadUsageStats(): Map<string, UsageStats> {
  try {
    const stored = localStorage.getItem(USAGE_STORAGE_KEY());
    if (!stored) return new Map();

    const parsed = JSON.parse(stored) as Record<string, UsageStats>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

/**
 * Save usage statistics to localStorage.
 */
function saveUsageStats(stats: Map<string, UsageStats>): void {
  try {
    const entries = Array.from(stats.entries())
      .sort((a, b) => b[1].lastUsed - a[1].lastUsed)
      .slice(0, MAX_TRACKED_ITEMS);

    const obj = Object.fromEntries(entries);
    localStorage.setItem(USAGE_STORAGE_KEY(), JSON.stringify(obj));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Record usage of a menu item.
 */
export function recordUsage(itemId: string): void {
  const stats = loadUsageStats();
  const existing = stats.get(itemId) || { count: 0, lastUsed: 0 };

  stats.set(itemId, {
    count: existing.count + 1,
    lastUsed: Date.now(),
  });

  saveUsageStats(stats);
}

// =============================================================================
// KEYWORD UTILITIES
// =============================================================================

/**
 * Build keywords from multiple sources for search.
 * Normalizes and deduplicates all text tokens.
 */
export function buildKeywords(
  ...sources: Array<string | string[] | undefined>
): string[] {
  const keywords = new Set<string>();

  const register = (value: string) => {
    const normalized = normalizeSearchText(value);
    normalized
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => keywords.add(token));
  };

  sources.forEach((source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach((entry) => register(entry));
    } else {
      register(source);
    }
  });

  return Array.from(keywords);
}

// =============================================================================
// SEARCH ENGINE CLASS (Optional OOP wrapper)
// =============================================================================

/**
 * SearchEngine class for object-oriented usage.
 * Wraps the functional utilities with instance-level configuration.
 */
export class SearchEngine<T extends SearchableItem> {
  private context?: SearchContext;
  private usageStats?: Map<string, UsageStats>;

  constructor(options?: {
    context?: SearchContext;
    loadUsage?: boolean;
  }) {
    this.context = options?.context;
    if (options?.loadUsage) {
      this.usageStats = loadUsageStats();
    }
  }

  /** Update search context */
  setContext(context: SearchContext): void {
    this.context = context;
  }

  /** Refresh usage stats from storage */
  refreshUsageStats(): void {
    this.usageStats = loadUsageStats();
  }

  /** Search items with relevance scoring */
  search(query: string, items: T[]): T[] {
    return searchWithRelevance(query, items, this.context, this.usageStats);
  }

  /** Get scored results for debugging/display */
  searchWithScores(query: string, items: T[]): ScoredSearchResult<T>[] {
    if (!query.trim()) {
      return items.map((item) => ({
        item,
        score: 1,
        matchDetails: { matchType: "empty", matchedOn: "" },
      }));
    }

    const results: ScoredSearchResult<T>[] = [];
    for (const item of items) {
      const result = calculateSearchScore(
        query,
        item,
        this.context,
        this.usageStats
      );
      if (result) {
        results.push(result);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /** Record item usage */
  recordUsage(itemId: string): void {
    recordUsage(itemId);
    this.refreshUsageStats();
  }
}
