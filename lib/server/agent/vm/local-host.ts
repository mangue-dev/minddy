import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { HarnessLayout } from "../harness-layout";
import type { RepoHost, ShellOptions, ShellResult } from "../repo-host";

/**
 * Les mêmes quatre primitives que `sandboxHost`, mais SUR PLACE (MIN-224) : la
 * boucle tourne dans la microVM, donc le disque du dépôt est le disque local et
 * le shell est le shell local.
 *
 * CE QUE ÇA SUPPRIME, et c'est tout le sujet du ticket : chaque geste sur le
 * dépôt cesse d'être un aller-retour RPC vers `iad1`. Le cadrage a mesuré un
 * `runCommand("true")` à 211 ms de médiane depuis la France, et les dix mêmes
 * commandes ENCHAÎNÉES dans la VM à 227 ms au total — le transport était
 * l'essentiel du coût. Le gain exact intra-région reste à mesurer (MIN-221 §5),
 * et le dossier de la migration ne repose pas dessus.
 *
 * CE QUE ÇA NE CHANGE PAS. `resolveWithin` et `assertNotGit` gardent le même
 * sens : ce sont des fonctions de chemin appliquées aux arguments du modèle avant
 * de toucher le disque, et le harness qui tourne dans la machine qu'il garde ne
 * leur retire rien. Ce qui change vraiment, c'est que la microVM cesse d'être
 * « jetable et sans conséquence » : un `rm -rf /vercel/sandbox` du modèle tue
 * maintenant son propre tour. Désagrément, pas faille — rien de durable n'y vit,
 * la branche est poussée — mais l'argument ne peut plus être invoqué tel quel.
 *
 * PAS DE `exec` DE `node:child_process`, et c'est délibéré. `exec` bufferise dans
 * une chaîne plafonnée (`maxBuffer`, 1 Mo par défaut) et LÈVE au-delà, en jetant
 * ce qui avait été produit : un `npm test` bavard rendrait une erreur au lieu de
 * sa sortie. `spawn` + accumulation nous laisse décider, et c'est
 * `command-output.ts` qui décide déjà (cap, spill sur disque).
 */

/**
 * Ce qu'on garde d'un flux, par flux. Très au-dessus de ce que le modèle lira
 * (`formatRunCommandResult` cape bien plus bas, et dépose le reste sur disque) :
 * ce plafond-ci n'est pas une politique d'affichage, c'est le garde-fou mémoire
 * d'un process qui doit vivre des heures. Un watcher oublié en avant-plan ne doit
 * pas faire grossir le tas du harness jusqu'à l'OOM.
 */
const MAX_STREAM_BYTES = 32 * 1024 * 1024;

/** Délai de grâce entre le SIGTERM d'un timeout et le SIGKILL. */
const KILL_GRACE_MS = 2_000;

/**
 * Lance `sh -c <command>` et rend exitCode + stdout + stderr, comme la sandbox.
 *
 * Les trois écarts avec `child_process.exec`, tous voulus :
 *
 * - la sortie est accumulée en buffers et bornée par `MAX_STREAM_BYTES` — TRONQUÉE,
 *   jamais transformée en erreur ;
 * - un timeout TUE proprement (SIGTERM, grâce, SIGKILL) et rend ce qui avait déjà
 *   été écrit, avec un exitCode non nul : le modèle doit lire la sortie partielle
 *   d'un test qui a bouclé, pas un message vide ;
 * - un `signal` déjà abandonné rend tout de suite, sans lancer le process. C'est
 *   ce que l'abandon d'un sous-agent attend.
 */
function execLocal(defaultCwd: string, command: string, opts?: ShellOptions): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    if (opts?.signal?.aborted) {
      resolve({ exitCode: 130, stdout: "", stderr: "aborted" });
      return;
    }
    const child = spawn("sh", ["-c", command], {
      cwd: opts?.cwd ?? defaultCwd,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      // Groupe de process à part : un `npm test` qui a lui-même lancé des enfants
      // ne doit pas leur survivre quand on le tue. `-pid` frappe le groupe entier.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    const collect = (into: Buffer[], counted: number, chunk: Buffer): number => {
      if (counted >= MAX_STREAM_BYTES) return counted;
      into.push(chunk);
      return counted + chunk.length;
    };
    child.stdout.on("data", (c: Buffer) => {
      outBytes = collect(out, outBytes, c);
    });
    child.stderr.on("data", (c: Buffer) => {
      errBytes = collect(err, errBytes, c);
    });

    let timedOut = false;
    const kill = (): void => {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, KILL_GRACE_MS).unref();
    };

    const timer =
      opts?.timeoutMs != null && opts.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            kill();
          }, opts.timeoutMs)
        : null;
    const onAbort = () => kill();
    opts?.signal?.addEventListener("abort", onAbort, { once: true });

    const done = (exitCode: number) => {
      if (timer) clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      const stderrText = Buffer.concat(err).toString("utf8");
      resolve({
        exitCode,
        stdout: Buffer.concat(out).toString("utf8"),
        // Le timeout se DIT dans stderr, comme la sandbox le fait : sans ça, une
        // commande tuée à 180 s rendait un exit 143 nu, que le modèle relit comme
        // un échec de la commande elle-même.
        stderr: timedOut
          ? `${stderrText}${stderrText.endsWith("\n") || !stderrText ? "" : "\n"}Command timed out after ${opts?.timeoutMs} ms and was killed.`
          : stderrText,
      });
    };

    // `sh -c` introuvable, cwd inexistant : ça n'est pas une commande qui échoue,
    // c'est un lancement impossible. L'appelant le traite comme une erreur de tool.
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      reject(e);
    });
    // `close` et pas `exit` : `exit` peut arriver avant que les pipes ne soient
    // drainés, et on rendrait alors une sortie amputée de sa fin.
    child.on("close", (code, signal) => done(code ?? (signal ? 143 : 1)));
  });
}

/**
 * Les mains locales du harness sur le dépôt du run.
 *
 * `layout` vient du JOB depuis MIN-354 : le harness ne décide plus où il
 * travaille, il l'apprend — et deux runs sur une même machine ont deux layouts
 * disjoints, donc deux dépôts, deux dossiers de sorties et deux harness.
 */
export function localHost(layout: HarnessLayout): RepoHost {
  return {
    layout,
    exec: (command, opts) => execLocal(layout.repoDir, command, opts),
    readFile: async (absPath: string): Promise<string | null> => {
      try {
        return await readFile(absPath, "utf8");
      } catch (err) {
        // ENOENT est la réponse attendue (« le fichier n'existe pas »), et c'est
        // le contrat de `sandbox.readFileToBuffer`. Le reste — EACCES, EISDIR —
        // est une vraie erreur : la rendre comme « absent » ferait écrire par
        // `edit_file` un fichier que le modèle croyait vide.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    writeFile: async (absPath: string, content: string): Promise<void> => {
      await writeFile(absPath, content, "utf8");
    },
    mkdir: async (absPath: string): Promise<void> => {
      await mkdir(absPath, { recursive: true });
    },
  };
}
