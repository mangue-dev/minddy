import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Deux suggestions sur un même éditeur (MIN-270).
 *
 * `Suggestion` de tiptap pose une clé de plugin PAR DÉFAUT, la même pour tout
 * le monde (`suggestion$`). Une surface qui en monte deux — le menu « / » des
 * blocs et le « @ » des mentions, ce qu'est une page — fait alors lever
 * ProseMirror au montage : « Adding different instances of a keyed plugin ».
 * Ce n'est pas un plantage discret : c'est l'écran d'erreur à l'ouverture de
 * n'importe quelle page.
 *
 * Le piège tient à ce qu'une clé par défaut marche PARFAITEMENT tant qu'elle est
 * seule. Les trois surfaces l'ont eue pendant des mois sans rien dire ; la page
 * est la première à en monter deux, et c'est là que ça a cassé. D'où la règle
 * tenue ici : chaque appel nomme sa clé, y compris celui qui est seul sur sa
 * surface aujourd'hui.
 *
 * Le contrôle porte sur la SOURCE, faute de pouvoir monter le vrai éditeur : ces
 * modules importent le baril `mangue-ui`, qui tire @lobehub/ui et ses JSON
 * d'emoji, que vitest refuse de charger sans attribut d'import.
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

describe("clés de plugin des suggestions tiptap", () => {
  it("nomme la clé de chaque suggestion, et n'en réutilise aucune", () => {
    const missing: string[] = [];
    const keys = new Map<string, string>();

    for (const file of sourceFiles(path.join(ROOT, "components"))) {
      const source = readFileSync(file, "utf8");
      // Les APPELS, pas les imports de types (`SuggestionProps`).
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
    // Le garde-fou ne vaut que s'il a bien trouvé les appels : le « @ » des
    // mentions, le « / » du carnet, le « / » des pages.
    expect(keys.size).toBeGreaterThanOrEqual(3);
  });
});
