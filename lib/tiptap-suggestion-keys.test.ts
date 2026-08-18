import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two suggestions on the same editor (MIN-270).
 *
 * `Suggestion` from tiptap sets a DEFAULT plugin key, the same for everyone
 * the world (`suggestion$`). A surface that raises two — the “/” menu of
 * blocks and the “@” of mentions, what a page is — then raises
 * ProseMirror when editing: “Adding different instances of a keyed plugin”.
 * This is not a discreet crash: it is the error screen when opening from
 * any page.
 *
 * The catch is that a default key works PERFECTLY as long as it is
 * alone. All three surfaces had it for months without saying anything; page
 * is the first to mount two, and that's where it broke. Hence the rule
 * held here: each call names its key, including the one which is alone on its
 * surface today.
 *
 * The control concerns the SOURCE, for lack of being able to mount the real editor: these
 * modules import the barrel `mangue-ui`, which pulls @lobehub/ui and its emoji JSON
 *, which vites refuses to load without an import attribute.
 */

const ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("plugin keys for tiptap suggestions", () => {
  it("names each suggestion key and reuses none", () => {
    const missing: string[] = [];
    const keys = new Map<string, string>();

    for (const file of sourceFiles(path.join(ROOT, "components"))) {
      const source = readFileSync(file, "utf8");
      // CALLS, not type imports (`SuggestionProps`).
      if (!/\bSuggestion(?:<[^>]*>)?\(\{/.test(source)) continue;
      const where = path.relative(ROOT, file);

      const found = [
        ...source.matchAll(/pluginKey:\s*new PluginKey\("([^"]+)"\)/g),
      ].map((match) => match[1]);
      const calls = [...source.matchAll(/\bSuggestion(?:<[^>]*>)?\(\{/g)].length;

      if (found.length < calls) {
        missing.push(where);
        continue;
      }
      for (const key of found) {
        const taken = keys.get(key);
        expect(taken, `clé « ${key} » déjà prise par ${taken}`).toBeUndefined();
        keys.set(key, where);
      }
    }

    expect(
      missing,
      `suggestion sans pluginKey (donc sur la clé par défaut, partagée) : ${missing.join(", ")}`
    ).toEqual([]);
    // The guardrail only matters if it found the calls: the “@” for
    // mentions, the “/” for the notebook, and the “/” for pages.
    expect(keys.size).toBeGreaterThanOrEqual(3);
  });
});
