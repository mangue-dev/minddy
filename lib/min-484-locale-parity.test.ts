import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/config";
import { MARKDOWN_LOCALE_COPY } from "@/lib/markdown-locale-copy";
import { signReviewBody } from "@/lib/server/agent/pr-tools";
import { reviewFallbackPrefix } from "@/lib/server/agent/review-copy";
import {
  commentFallbackDone,
  priorConversationLostNote,
} from "@/lib/server/runtime-locale-copy";

describe("MIN-484 locale-dependent fallback copy", () => {
  it("captures acquisition context on every public page layout", () => {
    for (const group of ["marketing", "legal"]) {
      const layout = readFileSync(
        path.join(__dirname, "..", "app", `(${group})`, "layout.tsx"),
        "utf8",
      );
      expect(layout).toContain("<AcquisitionContext />");
    }
  });

  it("localizes Markdown scaffolding for every supported locale", () => {
    for (const locale of locales) {
      const copy = MARKDOWN_LOCALE_COPY[locale];
      expect(copy.canonical).toBeTruthy();
      expect(copy.perMonth).toBeTruthy();
      expect(copy.fullHtml).toBeTruthy();
      expect(Object.values(copy.links).every(Boolean)).toBe(true);
    }

    expect(MARKDOWN_LOCALE_COPY.de.fullHtml).not.toBe(
      MARKDOWN_LOCALE_COPY.en.fullHtml,
    );
    expect(MARKDOWN_LOCALE_COPY["pt-BR"].links.privacy).toBe("Privacidade");
    expect(MARKDOWN_LOCALE_COPY.it.perMonth).toBe("mese");
    expect(MARKDOWN_LOCALE_COPY.es.links.home).toBe("Inicio");
  });

  it("localizes forge fallback verdicts and normalizes regional tags", () => {
    expect(reviewFallbackPrefix("approve", "de-DE")).toContain("genehmigt");
    expect(reviewFallbackPrefix("request_changes", "pt-BR")).toContain(
      "Alterações",
    );
    expect(reviewFallbackPrefix("approve", "it-IT")).toContain("Approvata");
    expect(reviewFallbackPrefix("request_changes", "es-MX")).toContain(
      "Cambios",
    );
    expect(reviewFallbackPrefix("comment", "fr")).toBe("");
  });

  it.each([
    ["de-DE", "Von Numo"],
    ["pt-BR", "Revisado pelo Numo"],
    ["it-IT", "Revisionato da Numo"],
    ["es-MX", "Revisado por Numo"],
  ])("signs agent reviews in %s", (locale, marker) => {
    expect(signReviewBody("Summary", "model", locale)).toContain(marker);
  });

  it("keeps comment and resumed-session fallbacks in the requested locale", () => {
    expect(commentFallbackDone("de-DE")).toBe("Erledigt.");
    expect(commentFallbackDone("pt-BR")).toBe("Concluído.");
    expect(commentFallbackDone("it-IT")).toBe("Fatto.");
    expect(commentFallbackDone("es-MX")).toBe("Hecho.");
    expect(priorConversationLostNote("de-DE")).toContain("Hinweis");
    expect(priorConversationLostNote("pt-BR")).toContain("Observação");
    expect(priorConversationLostNote("it-IT")).toContain("Nota");
    expect(priorConversationLostNote("es-MX")).toContain("incidencia");
  });
});
