import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localHost } from "./local-host";
import { cloudLayout } from "../harness-layout";

/**
 * MIN-224 — the LOCAL hands of the harness, those which replace the round trip
 * RPC when the loop lives in the microVM.
 *
 * What is tested here is not “does `ls` work”: it is the contract that
 * `repo-host.ts` waits, and each difference is paid for silently.
 *
 * - a non-zero exit code is a RESULT, not an exception — otherwise the first
 * `grep` without a match would cause a tool to fail;
 * - a command killed by timeout returns what it had ALREADY written, and says so —
 * otherwise the model reads an empty failure where it was supposed to read the partial output
 * of a test that completed;
 * - an absent file returns `null` (this is the contract for `readFileToBuffer`), but
 * a real access error RISE: rendering `null` on an EACCES would cause
 * `edit_file` to write a file that the model believed to be empty.
 */

let dir: string;
/**
 * The host knows its layout since MIN-354: the default `cwd` of `exec` is
 * `layout.repoDir`, and no longer a constant. These cases all pass an explicit `cwd`
 * (the temp folder), so only the contract matters here.
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
    // macOS prefix /private to /var paths: we compare the endings.
    expect(res.stdout.trim().endsWith(dir.replace(/^\/private/, ""))).toBe(true);
  });

  it("passe les variables d'environnement demandées", async () => {
    const res = await host.exec(`echo "$MINDDY_PROBE"`, { cwd: dir, env: { MINDDY_PROBE: "42" } });
    expect(res.stdout.trim()).toBe("42");
  });

  it("tue au timeout, rend la sortie DÉJÀ écrite, et le dit", async () => {
    const res = await host.exec(`echo début; sleep 30`, { cwd: dir, timeoutMs: 300 });
    expect(res.exitCode).not.toBe(0);
    // What was produced before the cut is NOT lost: it is often all
    // what the model needed to read.
    expect(res.stdout).toContain("début");
    // And the timeout SAYS: a bare exit 143 is reread as a failure of the command.
    expect(res.stderr).toContain("timed out");
  }, 10_000);

  it("tue le GROUPE de process, pas seulement le shell", async () => {
    // A `npm test` launched children himself: letting them survive would eat
    // the microVM up to the reaper, and they would write to the repository during the
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
    // A folder read as a file: `null` would make it appear as an empty file, and
    // `edit_file` would write over an entire tree.
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
