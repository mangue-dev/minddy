import type { Locale } from "@/i18n/config";
import { resolveApplicationLocale } from "@/lib/locale-language";

// Runtime footers, one per supported locale: they are posted at the forge in
// the requester's language.
const SIGNATURE: Record<Locale, (model: string) => string> = {
  en: (model) => `🤖 Reviewed by Numo (minddy) · ${model}`,
  fr: (model) => `🤖 Relu par Numo (minddy) · ${model}`,
  de: (model) => `🤖 Von Numo (minddy) geprüft · ${model}`,
  "pt-BR": (model) => `🤖 Revisado pelo Numo (minddy) · ${model}`,
  it: (model) => `🤖 Revisionato da Numo (minddy) · ${model}`,
  es: (model) => `🤖 Revisado por Numo (minddy) · ${model}`,
};

/**
 * Signs a comment Numo posts on a pull request — exactly ONCE.
 *
 * The server adds the signature rather than asking the model for it: it is a
 * fact (which model wrote the comment), not an opinion, and a model asked to
 * sign may forget, invent another model name, or sign twice. A body that
 * already bears the `🤖` signature marker is returned unchanged.
 */
export function signReviewBody(
  body: string,
  model: string,
  locale: string,
): string {
  const trimmed = body.trim();
  const sign = SIGNATURE[resolveApplicationLocale(locale)];
  const line = sign(model);
  if (trimmed.includes(line)) return trimmed;
  // A signature in ANOTHER language or from another model counts too: we avoid a
  // duplicate footer, not one particular string.
  if (/🤖[^\n]*Numo \(minddy\)/.test(trimmed))
    return trimmed;
  return `${trimmed}\n\n---\n${line}`;
}
