"use client";

import { useEffect, useSyncExternalStore } from "react";
import { common, createLowlight } from "lowlight";

export type CodeBlockHighlighter = ReturnType<typeof createLowlight>;

const DISPLAY_NAMES: Record<string, string> = {
  plaintext: "Plain text",
  abnf: "ABNF",
  apache: "Apache",
  bash: "Bash",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  dart: "Dart",
  diff: "Diff",
  dockerfile: "Dockerfile",
  fsharp: "F#",
  graphql: "GraphQL",
  html: "HTML",
  ini: "INI",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  latex: "LaTeX",
  markdown: "Markdown",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  powershell: "PowerShell",
  python: "Python",
  "python-repl": "Python REPL",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  vbnet: "Visual Basic .NET",
  wasm: "WebAssembly",
  xml: "XML",
  yaml: "YAML",
};

const ALIAS_NAMES: Record<string, string> = {
  cjs: "JavaScript",
  es6: "JavaScript",
  js: "JavaScript",
  jsx: "JSX",
  mjs: "JavaScript",
  py: "Python",
  sh: "Shell",
  ts: "TypeScript",
  tsx: "TSX",
  yml: "YAML",
};

function humanizeLanguage(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type CodeLanguageOption = {
  value: string;
  label: string;
  keywords: string[];
};

export type CodeLanguageCatalog = {
  highlighter: CodeBlockHighlighter;
  options: CodeLanguageOption[];
};

/** Picker options for every grammar and known alias a highlighter has registered. */
export function codeLanguageOptions(
  highlighter: CodeBlockHighlighter,
): CodeLanguageOption[] {
  const languageValues = [
    ...new Set([...highlighter.listLanguages(), ...Object.keys(ALIAS_NAMES)]),
  ].filter((value) => highlighter.registered(value));

  return languageValues
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      value,
      label: DISPLAY_NAMES[value] ?? ALIAS_NAMES[value] ?? humanizeLanguage(value),
      keywords: [value, DISPLAY_NAMES[value] ?? ALIAS_NAMES[value] ?? value],
    }));
}

/* Read-only Markdown ships in the first load of most app routes, so it
   starts with the 37 common grammars, created on the first code block rather
   than at import. The complete catalog (code-block-full-language-catalog.ts)
   is a separate chunk: editors import it statically, and a read-only block
   loads it when its language is not common. */
let commonCatalog: CodeLanguageCatalog | undefined;

function getCommonCatalog(): CodeLanguageCatalog {
  if (!commonCatalog) {
    const highlighter = createLowlight(common);
    commonCatalog = { highlighter, options: codeLanguageOptions(highlighter) };
  }
  return commonCatalog;
}

let fullCatalog: CodeLanguageCatalog | null = null;
let fullCatalogLoad: Promise<CodeLanguageCatalog> | null = null;
const fullCatalogListeners = new Set<() => void>();

/** Called once by the complete catalog module when it evaluates, whichever
    importer (an editor chunk or loadFullCodeLanguageCatalog) loaded it. */
export function publishFullCodeLanguageCatalog(catalog: CodeLanguageCatalog): void {
  if (fullCatalog) return;
  fullCatalog = catalog;
  for (const listener of fullCatalogListeners) listener();
}

/** Loads every highlight.js grammar. Safe to call repeatedly. */
export function loadFullCodeLanguageCatalog(): Promise<CodeLanguageCatalog> {
  if (fullCatalog) return Promise.resolve(fullCatalog);
  fullCatalogLoad ??= import("@/components/code-block-full-language-catalog").then(
    (module) => module.FULL_CODE_LANGUAGE_CATALOG,
    (error: unknown) => {
      // Let a later code block retry after a transient chunk failure.
      fullCatalogLoad = null;
      throw error;
    },
  );
  return fullCatalogLoad;
}

function subscribeToFullCatalog(listener: () => void): () => void {
  fullCatalogListeners.add(listener);
  return () => fullCatalogListeners.delete(listener);
}

const getFullCatalog = () => fullCatalog;
const getServerFullCatalog = () => null;

/**
 * The catalog a read-only code block can render with now. Server rendering and
 * hydration always use the common grammars, so their markup never depends on
 * what this process has already loaded. A block whose language is not common
 * requests the complete catalog and re-renders once it is published.
 */
export function useCodeLanguageCatalog(language: string | undefined): CodeLanguageCatalog {
  const full = useSyncExternalStore(
    subscribeToFullCatalog,
    getFullCatalog,
    getServerFullCatalog,
  );
  const catalog = full ?? getCommonCatalog();
  const needsFullCatalog =
    !full && Boolean(language) && !catalog.highlighter.registered(language ?? "");

  useEffect(() => {
    if (needsFullCatalog) void loadFullCodeLanguageCatalog().catch(() => undefined);
  }, [needsFullCatalog]);

  return catalog;
}
