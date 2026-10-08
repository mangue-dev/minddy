"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { documentationPath } from "@/lib/documentation-core.mjs";

/** Semantic anchors are identical across translations and survive locale changes. */
export function ArticleLanguages({ locale, id, label }: { locale: Locale; id: string; label: string }) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const names = { en: "English", fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", "pt-BR": "Português (Brasil)" };
  return <nav aria-label={label} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
    {Object.entries(names).map(([language, name]) => <a key={language} href={`${documentationPath(id, language)}${hash}`}
      lang={language} hrefLang={language} aria-current={locale === language ? "page" : undefined}
      onClick={event => { event.currentTarget.href = `${documentationPath(id, language)}${window.location.hash}`; }}
      className="rounded py-1 underline decoration-border underline-offset-4 hover:decoration-current aria-[current=page]:font-semibold focus-visible:outline-2 focus-visible:outline-ring">{name}</a>)}
  </nav>;
}
