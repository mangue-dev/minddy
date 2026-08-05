"use client";

import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { ReactNode } from "react";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES } from "@/lib/diff-theme";

/**
 * Le pool de workers qui colore les diffs (MIN-181).
 *
 * C'est lui qui remplace le plafond de lignes d'avant : la coloration ne se fait
 * plus dans le rendu, ni même sur le fil principal — un lockfile de 20 000
 * lignes ne gèle plus l'onglet, il arrive coloré un peu plus tard.
 *
 * **Deux workers**, pas les huit par défaut : une vue de PR colore quelques
 * fichiers à la fois, et chaque worker charge sa propre copie de Shiki. Le pool
 * est un singleton de module côté lib, monté et démonté avec la vue.
 *
 * ⚠️ Le pool tranche pour tout le monde. Vérifié dans `DiffHunksRenderer` : dès
 * qu'un pool est présent, ce sont SES options de rendu (thème, style de
 * marquage, longueur max de ligne) qui l'emportent sur celles de chaque
 * composant. Le couple de thèmes et le style de marquage vivent donc dans
 * `lib/diff-theme` et sont passés AUX DEUX endroits — c'est le même réglage, il
 * n'a qu'une seule source.
 *
 * Le choix clair/sombre, lui, reste par composant (`themeType`) : le pool
 * colore avec LES DEUX thèmes d'un coup, et c'est le `color-scheme` du
 * Shadow DOM qui décide lequel s'affiche.
 */
export function PrDiffWorkers({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider
      poolOptions={{
        poolSize: 2,
        // La variante **portable**, et pas `worker/worker.js` : vérifié sur le
        // build de ce dépôt, Turbopack traite `new URL(…, import.meta.url)`
        // comme un ACTIF — il recopie le fichier tel quel dans `static/media`
        // sans le passer par l'empaqueteur. `worker.js` y arriverait avec ses
        // `import … from "shiki/core"` intacts, que le navigateur ne sait pas
        // résoudre : le worker mourrait au chargement. `worker-portable.js` est
        // déjà autonome, donc il survit à la recopie.
        workerFactory: () =>
          new Worker(new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url), {
            type: "module",
          }),
      }}
      highlighterOptions={{
        theme: DIFF_THEMES,
        lineDiffType: DIFF_LINE_DIFF_TYPE,
        // Le moteur JS, pas WebAssembly : le seul `import()` que la variante
        // portable garde pointe le `.wasm` en RELATIF, et il ne survivrait pas à
        // la recopie en actif. Dit ici plutôt que laissé au défaut, pour que la
        // dépendance entre les deux choix soit écrite quelque part.
        preferredHighlighter: "shiki-js",
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
