import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { locales } from "@/i18n/config";

/**
 * MIN-830 — A placeholder says what to enter, never a sample value.
 *
 * DESIGN.md (Copy) holds the rule. A sample (`you@example.com`, "e.g. …",
 * `sk-…`) reads like a value already typed and is lost on the first
 * keystroke; a format, a default or an example belongs in the field's hint.
 * These checks catch the two ways a sample slips back in: an untranslated
 * string literal on a component, and catalog copy that starts with an
 * example marker or shows an address.
 */
const COMPONENT_SOURCE = /^(?:app|components|desktop\/src)\/.*\.tsx$/;

const LITERAL_PLACEHOLDER = /placeholder(?:=\{?\s*["'`]|:\s*["'`])/;

const EXAMPLE_MARKER = /^(?:e\.\s?g\.|ex\.|z\.\s?b\.|beispiel|p\.\s?ej\.|por ejemplo|ad esempio|por exemplo)/i;
const SAMPLE_VALUE = /https?:\/\/|[\w.-]+@[\w-]+\.|\b(?:example|exemple|beispiel|ejemplo|exemplo)\.[a-z]{2,}/i;

function trackedComponents(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => COMPONENT_SOURCE.test(file) && !file.includes(".test."));
}

function placeholderMessages(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") {
    const key = path.at(-1) ?? "";
    return /placeholder/i.test(key) ? [[path.join("."), node]] : [];
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => placeholderMessages(value, [...path, key]));
  }
  return [];
}

describe("placeholder copy", () => {
  it("never hardcodes a placeholder string on a component", () => {
    const offenders = trackedComponents().flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => (LITERAL_PLACEHOLDER.test(line) ? [`${file}:${index + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });

  it.each(locales)("keeps sample values out of %s placeholders", (locale) => {
    const catalog = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as unknown;
    const offenders = placeholderMessages(catalog)
      .filter(([, text]) => EXAMPLE_MARKER.test(text.trim()) || SAMPLE_VALUE.test(text))
      .map(([key, text]) => `${key}: ${text}`);
    expect(offenders).toEqual([]);
  });

  it("flags the sample shapes it is meant to catch", () => {
    for (const sample of ["e.g. my urgent issues", "Ex. : mes tickets", "z.B. meine Tickets", "Por ejemplo: un pago"]) {
      expect(EXAMPLE_MARKER.test(sample)).toBe(true);
    }
    for (const sample of ["you@example.com", "https://example.com/mcp", "nom@exemple.fr", "tickets.example.com"]) {
      expect(SAMPLE_VALUE.test(sample)).toBe(true);
    }
    for (const instruction of ["Your email address", "Add a comment, @ to mention", "Which tasks are assigned to {name}?"]) {
      expect(EXAMPLE_MARKER.test(instruction) || SAMPLE_VALUE.test(instruction)).toBe(false);
    }
  });
});
