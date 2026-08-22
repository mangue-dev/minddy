"use client";

import { useEffect, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import { Check, Copy } from "lucide-react";
import { IconButton, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* Same pair as the Numo assistant (@streamdown/code defaults), so every code
   block in the app reads with one visual voice. Dual themes emit both palettes
   as CSS vars; app/globals.css already flips `.dark .shiki` to the dark one. */
const THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

/* Results are cached because a plan or a timeline renders the same
   snippet many times across re-renders. Unknown language tokens throw inside
   Shiki and resolve to null — the caller falls back to plain text. */
const highlightCache = new Map<string, Promise<string | null>>();

function highlightedHtml(code: string, language: string): Promise<string | null> {
  const key = `${language}\u0000${code}`;
  let cached = highlightCache.get(key);
  if (!cached) {
    cached = codeToHtml(code, { lang: language, themes: THEMES })
      .catch(() => null);
    highlightCache.set(key, cached);
  }
  return cached;
}

function useHighlightedHtml(code: string, language: string) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    if (!language) return;
    let alive = true;
    highlightedHtml(code, language).then((out) => {
      if (alive && out) setHtml(out);
    });
    return () => {
      alive = false;
    };
  }, [code, language]);
  return html;
}

const COPY_RESET_MS = 2000;

function CopyButton({ code }: { code: string }) {
  const t = useTranslations("Common");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard unavailable (permission, non-secure context): stay silent,
      // the button simply does nothing.
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          size="sm"
          onClick={copy}
          aria-label={copied ? t("copied") : t("copy")}
          className={cn(
            "font-sans",
            copied
              ? "text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>{copied ? t("copied") : t("copy")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A fenced markdown block, dressed like a real one: header bar with the
 * source language and a copy button, Shiki-highlighted body (GitHub light /
 * dark themes, switched by the existing `.dark .shiki` rules in globals.css).
 *
 * While Shiki loads (async, per-language grammar) — or when the fence carries
 * no language / an unknown one — the raw code shows on a muted background.
 */
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const html = useHighlightedHtml(code, language ?? "");
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-muted/50 text-[1em]">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/60 bg-muted/60 px-4 py-1">
        <span className="font-mono text-[1em] tracking-wide text-muted-foreground lowercase">
          {language}
        </span>
        <CopyButton code={code} />
      </div>
      {html ? (
        /* Shiki output is escaped HTML it generated itself — trusted here.
           Its <pre> carries its own theme background inline (GitHub light,
           flipped to dark by globals.css); these classes only add back the
           frame that preflight/Tailwind would otherwise leave off. */
        <div
          className="[&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:font-mono [&_pre]:leading-relaxed [&_pre]:text-[1em]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 font-mono leading-relaxed whitespace-pre">
          {code}
        </pre>
      )}
    </div>
  );
}
