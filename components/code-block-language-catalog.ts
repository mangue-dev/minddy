"use client";

import { all, createLowlight } from "lowlight";

/* Keep the complete grammar catalog in the browser bundle. Server-side page
   parsing continues to use the smaller common grammar set. */
export const codeBlockLowlight = createLowlight(all);

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

const languageValues = [
  ...new Set([
    ...codeBlockLowlight.listLanguages(),
    ...Object.keys(ALIAS_NAMES),
  ]),
].filter((value) => codeBlockLowlight.registered(value));

export const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = languageValues
  .sort((a, b) => a.localeCompare(b))
  .map((value) => ({
    value,
    label: DISPLAY_NAMES[value] ?? ALIAS_NAMES[value] ?? humanizeLanguage(value),
    keywords: [value, DISPLAY_NAMES[value] ?? ALIAS_NAMES[value] ?? value],
  }));
