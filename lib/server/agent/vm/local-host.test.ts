import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localHost } from "./local-host";
import { cloudLayout } from "../harness-layout";

/**
 * MIN-224 — les mains LOCALES du harness, celles qui remplacent l'aller-retour
 * RPC quand la boucle vit dans la microVM.
 *
 * Ce qui se teste ici n'est pas « est-ce que `ls` marche » : c'est le contrat que
 * `repo-host.ts` attend, et dont chaque écart se paie en silence.
 *
 * - un exit code non nul est un RÉSULTAT, pas une exception — sinon le premier
 *   `grep` sans match ferait échouer un tool ;
 * - une commande tuée par timeout rend ce qu'elle avait DÉJÀ écrit, et le dit —
 *   sinon le modèle lit un échec vide là où il devait lire la sortie partielle
 *   d'un test qui a bouclé ;
 * - un fichier absent rend `null` (c'est le contrat de `readFileToBuffer`), mais
 *   une vraie erreur d'accès LÈVE : rendre `null` sur un EACCES ferait écrire par
 *   `edit_file` un fichier que le modèle croyait vide.
 */

let dir: string;
/**
 * Le host connaît son layout depuis MIN-354 : le `cwd` par défaut de `exec` est
 * `layout.repoDir`, et non plus une constante. Ces cas passent tous un `cwd`
 * explicite (le dossier temporaire), donc seul le contrat compte ici.
 */
const host = localHost(cloudLayout());

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "minddy-local-host-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("exec", () => {
  it("rend stdout, stderr et exit code — sans lever", async () => {
    const res = await host.exec(`echo out; echo err >&2; exit 3`, { cwd: dir });
    expect(res.exitCode).toBe(3);
    expect(res.stdout.trim()).toBe("out");
    expect(res.stderr.trim()).toBe("err");
  });

  it("exécute dans le `cwd` demandé", async () => {
    const res = await host.exec(`pwd`, { cwd: dir });
    // macOS préfixe /private aux chemins de /var : on compare les fins.
    expect(res.stdout.trim().endsWith(dir.replace(/^\/private/, ""))).toBe(true);
  });

  it("passe les variables d'environnement demandées", async () => {
    const res = await host.exec(`echo "$MINDDY_PROBE"`, { cwd: dir, env: { MINDDY_PROBE: "42" } });
    expect(res.stdout.trim()).toBe("42");
  });

  it("tue au timeout, rend la sortie DÉJÀ écrite, et le dit", async () => {
    const res = await host.exec(`echo début; sleep 30`, { cwd: dir, timeoutMs: 300 });
    expect(res.exitCode).not.toBe(0);
    // Ce qui a été produit avant la coupure n'est PAS perdu : c'est souvent tout
    // ce que le modèle avait besoin de lire.
    expect(res.stdout).toContain("début");
    // Et le timeout se DIT : un exit 143 nu se relit comme un échec de la commande.
    expect(res.stderr).toContain("timed out");
  }, 10_000);

  it("tue le GROUPE de process, pas seulement le shell", async () => {
    // Un `npm test` a lui-même lancé des enfants : les laisser survivre mangerait
    // la microVM jusqu'au reaper, et ils écriraient dans le dépôt pendant le
    // `git add -A` de fin de tour.
    const marker = path.join(dir, "orphan.txt");
    await host.exec(`(sleep 1; echo vivant > ${JSON.stringify(marker)}) & sleep 30`, {
      cwd: dir,
      timeoutMs: 200,
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect(await host.readFile(marker)).toBeNull();
  }, 10_000);

  it("rend tout de suite sur un signal DÉJÀ abandonné", async () => {
    const res = await host.exec(`echo jamais`, { cwd: dir, signal: AbortSignal.abort() });
    expect(res.stdout).toBe("");
    expect(res.exitCode).not.toBe(0);
  });

  it("interrompt une commande en vol quand le signal tombe", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const res = await host.exec(`sleep 30`, { cwd: dir, signal: controller.signal });
    expect(res.exitCode).not.toBe(0);
  }, 10_000);
});

describe("fichiers", () => {
  it("écrit, relit, et rend `null` sur un fichier absent", async () => {
    const file = path.join(dir, "a.txt");
    expect(await host.readFile(file)).toBeNull();
    await host.writeFile(file, "bonjour");
    expect(await host.readFile(file)).toBe("bonjour");
  });

  it("LÈVE sur une erreur qui n'est pas « le fichier n'existe pas »", async () => {
    // Un dossier lu comme un fichier : `null` ferait croire à un fichier vide, et
    // `edit_file` écrirait par-dessus un arbre entier.
    await expect(host.readFile(dir)).rejects.toThrow();
  });

  it("crée les dossiers parents, et ne se plaint pas d'un dossier existant", async () => {
    const nested = path.join(dir, "x", "y");
    await host.mkdir(nested);
    await host.mkdir(nested);
    await host.writeFile(path.join(nested, "z.txt"), "ok");
    expect(await host.readFile(path.join(nested, "z.txt"))).toBe("ok");
  });
});
