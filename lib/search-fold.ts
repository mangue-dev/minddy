// One normalization for every search the user types: lowercase and without
// accents, so "senal" finds "Señal" and "sao" finds "São". Folding
// both sides keeps the comparison symmetric, whichever side carries the accent.

/** Lowercase, with combining accents removed (ñ → n, ã → a, ő → o). */
export function foldSearchText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/** Whether `term` contains `query`, both folded. An empty query matches. */
export function includesFolded(term: string, query: string): boolean {
  return foldSearchText(term).includes(foldSearchText(query).trim());
}
