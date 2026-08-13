import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * LE BUNDLE DE LA PROJECTION MARKDOWN DES PAGES (MIN-295).
 *
 * `lib/pages-markdown.ts` monte un éditeur tiptap pour traduire une page dans
 * les deux sens. Passé par le bundler de Next, ce module est MORT côté serveur,
 * et pas pour une raison de runtime :
 *
 *     // @tiptap/core, elementFromString
 *     if (typeof window === "undefined") throw new Error("[tiptap error]: …")
 *
 * Next substitue `typeof window` → `"undefined"` dans le build serveur. La
 * condition devient constante, la fonction se réduit à un `throw` inconditionnel
 * — mesuré dans `.next/server/chunks` : `function iQ(e){throw Error("[tiptap
 * error]: there is no window object available…")}`. Toute lecture de markdown
 * par un agent (MCP, Numo, agent de code) tombait là, quel que soit le contenu.
 *
 * D'où ce bundle, sur le patron déjà éprouvé du harness de la microVM
 * (`scripts/build-agent-vm.mjs`) : esbuild ne substitue pas `typeof window`, le
 * garde reste un test à l'exécution, et jsdom l'a déjà satisfait quand la
 * projection appelle (cf. `ensurePageDom`, lib/server/pages-projection.ts).
 *
 * Le fichier produit est chargé PAR CHEMIN, jamais importé : c'est ce qui le met
 * hors de portée du bundler, et c'est aussi pourquoi `outputFileTracingIncludes`
 * (next.config.ts) doit l'embarquer explicitement dans les fonctions.
 *
 * Pourquoi pas `serverExternalPackages`, le plus court à écrire : `tiptap-markdown`
 * et `@tiptap/extension-unique-id` publient bien un point d'entrée `require`,
 * mais leur `package.json` porte `"type": "module"` — Node les traite donc comme
 * de l'ESM, et la fonction Vercel tourne avec `--no-experimental-require-module`.
 * `node --no-experimental-require-module -e "require('tiptap-markdown')"` lève
 * `ERR_REQUIRE_ESM`. C'est exactement le piège déjà pris avec jsdom, et il ne se
 * verrait qu'en production.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

/**
 * Où le bundle atterrit. HORS de `lib/`, pour que ni `tsc` ni vitest ne le
 * ramassent, et sous un dossier à part pour que `outputFileTracingIncludes`
 * puisse l'embarquer d'un seul motif — même raison, et même forme, que
 * `.agent-vm/`.
 */
const OUT_DIR = path.join(repo, ".pages-md");
const OUT_FILE = path.join(OUT_DIR, "main.js");

/**
 * Plafond de taille. Le bundle est `require()` une fois par instance de
 * fonction : ce qu'il pèse, c'est du temps d'analyse à froid, sur le premier
 * appel de page de chaque instance. Un module lourd tiré par mégarde depuis un
 * bloc du registre se verrait d'abord ici.
 */
const MAX_BUNDLE_BYTES = 2_500_000;

await mkdir(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(repo, "lib/pages-markdown.ts")],
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  // Pas de minification : le test du bundle lit le garde `typeof window` dans le
  // texte produit, et une pile d'appel venue d'ici doit se lire.
  minify: false,
  sourcemap: false,
  // Les alias `@/…` du dépôt — la projection importe le registre de blocs par là.
  tsconfig: path.join(repo, "tsconfig.json"),
  alias: {
    // Voir les deux stubs pour le pourquoi. `server-only` par prudence (aucun
    // module de ce graphe ne l'importe aujourd'hui), `lucide-react` pour de bon :
    // il pèse 971 Ko d'icônes de menu dont la projection n'a aucun usage.
    "server-only": path.join(dir, "agent-vm-server-only-stub.js"),
    "lucide-react": path.join(dir, "pages-md-lucide-stub.js"),
  },
  logLevel: "warning",
  metafile: true,
});

const { size } = await stat(OUT_FILE);
if (size > MAX_BUNDLE_BYTES) {
  const inputs = Object.entries(
    result.metafile.outputs[path.relative(repo, OUT_FILE)]?.inputs ?? {},
  )
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
    .slice(0, 5)
    .map(([file, i]) => `  ${(i.bytesInOutput / 1024).toFixed(0)} Ko  ${file}`)
    .join("\n");
  console.error(
    `[build:pages-md] le bundle fait ${(size / 1_000_000).toFixed(2)} Mo, au-dessus du plafond de ${(MAX_BUNDLE_BYTES / 1_000_000).toFixed(1)} Mo.\nLes plus gros contributeurs :\n${inputs}`,
  );
  process.exit(1);
}

console.log(
  `[build:pages-md] ${path.relative(repo, OUT_FILE)} — ${(size / 1024).toFixed(0)} Ko`,
);
