"use client";

import { all, createLowlight } from "lowlight";
import {
  codeLanguageOptions,
  publishFullCodeLanguageCatalog,
  type CodeLanguageCatalog,
} from "@/components/code-block-language-catalog";

/* Keep the complete grammar catalog in the browser editor chunks. Read-only
   Markdown loads this module on demand; server-side page parsing continues to
   use the smaller common grammar set. */
export const codeBlockLowlight = createLowlight(all);

export const CODE_LANGUAGE_OPTIONS = codeLanguageOptions(codeBlockLowlight);

export const FULL_CODE_LANGUAGE_CATALOG: CodeLanguageCatalog = {
  highlighter: codeBlockLowlight,
  options: CODE_LANGUAGE_OPTIONS,
};

publishFullCodeLanguageCatalog(FULL_CODE_LANGUAGE_CATALOG);
