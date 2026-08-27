import type { Locale } from "@/i18n/config";
import { resolveApplicationLocale } from "@/lib/locale-language";

type ReviewVerdict = "approve" | "request_changes" | "comment";

const FALLBACK_VERDICT_PREFIX: Record<
  Locale,
  Record<ReviewVerdict, string>
> = {
  en: {
    approve: "**Approved from minddy.**",
    request_changes: "**Changes requested from minddy.**",
    comment: "",
  },
  fr: {
    approve: "**Approuvé depuis minddy.**",
    request_changes: "**Changements demandés depuis minddy.**",
    comment: "",
  },
  de: {
    approve: "**Über minddy genehmigt.**",
    request_changes: "**Änderungen über minddy angefordert.**",
    comment: "",
  },
  "pt-BR": {
    approve: "**Aprovado pelo minddy.**",
    request_changes: "**Alterações solicitadas pelo minddy.**",
    comment: "",
  },
  it: {
    approve: "**Approvata tramite minddy.**",
    request_changes: "**Modifiche richieste tramite minddy.**",
    comment: "",
  },
  es: {
    approve: "**Aprobada desde minddy.**",
    request_changes: "**Cambios solicitados desde minddy.**",
    comment: "",
  },
};

/** Prefix a forge comment with the verdict in the reviewer's locale. */
export function reviewFallbackPrefix(
  verdict: ReviewVerdict,
  locale: string | null | undefined,
): string {
  return FALLBACK_VERDICT_PREFIX[resolveApplicationLocale(locale)][verdict];
}
