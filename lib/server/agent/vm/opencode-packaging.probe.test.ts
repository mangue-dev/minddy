/**
 * MIN-286 — sonde de PACKAGING : opencode démarre-t-il dans la microVM, et en
 * combien de temps ?
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_OPENCODE_PACKAGING_PROBE=1` n'est pas posé. Elle crée une vraie microVM
 * Vercel Sandbox (facturée à la minute) et y télécharge ~144 Mo de binaire — une
 * suite qui la jouerait à chaque commit serait payante et rouge au hasard.
 *
 *   MDY_OPENCODE_PACKAGING_PROBE=1 \
 *   MDY_OPENCODE_PROBE_OUT=/tmp/packaging.json \
 *   npx vitest run lib/server/agent/vm/opencode-packaging.probe.test.ts --testTimeout=1200000
 *
 * Ce qu'elle établit, et qu'aucune lecture ne peut dire :
 *  1. le binaire natif s'installe et démarre dans le runtime `node24` — le même
 *     que le code agent (`SANDBOX_RUNTIME`, repo-host.ts) ;
 *  2. combien coûte ce démarrage, à comparer au `bootstrapMs` d'aujourd'hui ;
 *  3. ce que ça donne À CHAUD, une microVM reprise ayant déjà son `node_modules` ;
 *  4. si le serveur démarre sans aller chercher le catalogue de modèles en ligne
 *     (`OPENCODE_DISABLE_MODELS_FETCH`), ce qui décide de la dépendance d'un run
 *     à models.dev.
 *
 * PIÈGE, et il coûte deux essais : un `runCommand` attaché dont la sortie n'arrive
 * pas meurt vers 75 s sur `UND_ERR_SOCKET: other side closed`, et l'installation en
 * dure plus. D'où la forme : **un seul script lancé en `detached`**, qui écrit son
 * rapport dans un fichier, et un sondage par commandes courtes jusqu'au marqueur
 * de fin. Le rapport passe par un fichier parce que le reporter de vitest avale
 * les `console.log`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LIVE = process.env.MDY_OPENCODE_PACKAGING_PROBE === "1";
const OPENCODE_VERSION = process.env.MDY_OPENCODE_VERSION ?? "1.18.16";
const PORT = 4399;
const DONE = "__PROBE_DONE__";

/** Les creds vivent dans `.env` ; vitest ne le charge pas tout seul. */
function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/**
 * Un démarrage mesuré. **Rien n'est détaché**, et c'est le cœur de la recette :
 * un `nohup … &` dans un `sh -c` du Sandbox fait tomber la commande RPC (mesuré
 * trois fois, `UND_ERR_SOCKET` en ~25 s, sans une ligne de sortie), alors que le
 * même serveur au premier plan démarre parfaitement. On lit donc la ligne
 * « listening » sur le tube, on chronomètre là, on interroge, et `timeout` rend
 * la main — le tout sous les 75 s au bout desquels la socket RPC se ferme.
 */
function bootScript(label: string, extraEnv: string): string {
  return [
    `START=$(date +%s%3N)`,
    `OPENCODE_DISABLE_AUTOUPDATE=1 ${extraEnv} OPENCODE_DB=/vercel/oc/${label}.db ` +
      `timeout 45 /vercel/oc/node_modules/.bin/opencode serve --port ${PORT} --hostname 127.0.0.1 2>&1 | ` +
      `while IFS= read -r line; do`,
    `  case "$line" in *listening*)`,
    `    echo "${label}_boot_ms=$(( $(date +%s%3N) - START ))"`,
    `    echo "${label}_health=$(curl -sf http://127.0.0.1:${PORT}/global/health)"`,
    `    echo "${label}_tools=$(curl -sf 'http://127.0.0.1:${PORT}/experimental/tool/ids?directory=/vercel/oc/repo')"`,
    `    break;;`,
    `  esac`,
    `  echo "${label}_out=$line"`,
    `done`,
  ].join("\n");
}

describe.skipIf(!LIVE)("opencode dans la microVM", () => {
  it(
    "s'installe, démarre et répond, à froid puis à chaud",
    async () => {
      loadEnv();
      const { Sandbox } = await import("@vercel/sandbox");

      const sandbox = await Sandbox.create({
        token: process.env.VERCEL_TOKEN!,
        teamId: process.env.VERCEL_TEAM_ID!,
        projectId: process.env.VERCEL_PROJECT_ID!,
        runtime: "node24",
        timeout: 20 * 60_000,
      });

      const sh = async (script: string) => {
        const res = await sandbox.runCommand({ cmd: "sh", args: ["-c", script] });
        return { exitCode: res.exitCode, stdout: await res.stdout() };
      };

      const report: string[] = [];
      try {
        // ── 1. l'installation, en fond : elle dépasse la minute ─────────────
        const install = [
          `mkdir -p /vercel/oc/repo && cd /vercel/oc`,
          `S=$(date +%s%3N)`,
          `npm i --no-audit --no-fund opencode-ai@${OPENCODE_VERSION} >/vercel/oc/install.log 2>&1`,
          `echo "install_code=$?"`,
          `echo "install_ms=$(( $(date +%s%3N) - S ))"`,
          `echo "size_mb=$(du -sm /vercel/oc/node_modules | cut -f1)"`,
          `echo "version=$(/vercel/oc/node_modules/.bin/opencode --version 2>&1)"`,
          `echo "has_curl=$(command -v curl || echo NON)"`,
          `echo "has_git=$(command -v git || echo NON)"`,
          `echo ${DONE}`,
        ].join("\n");
        await sandbox.runCommand({
          cmd: "sh",
          args: ["-c", `{\n${install}\n} > /tmp/probe.out 2>&1`],
          detached: true,
        });
        let out = "";
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 5_000));
          out = (await sh(`cat /tmp/probe.out 2>/dev/null || true`)).stdout;
          if (out.includes(DONE)) break;
        }
        report.push(out);
        expect(out).toContain("install_code=0");

        // ── 2. le dépôt de sonde, puis les démarrages ───────────────────────
        // ATTACHÉ : chacun rend en quelques secondes, et une erreur se VOIT —
        // c'est ce que la version tout-en-fond cachait.
        const prep = await sh(
          `cd /vercel/oc/repo && git init -q 2>&1; echo hi > a.txt; ` +
            `git -c user.email=a@b -c user.name=a add -A 2>&1; ` +
            `git -c user.email=a@b -c user.name=a commit -qm init 2>&1; echo prep_ok`,
        );
        report.push(prep.stdout);

        for (const [label, bootEnv] of [
          ["cold", ""],
          ["warm", ""],
          [
            "offline",
            "OPENCODE_DISABLE_MODELS_FETCH=1 OPENCODE_DISABLE_LSP_DOWNLOAD=1 OPENCODE_DISABLE_EMBEDDED_WEB_UI=1",
          ],
        ] as const) {
          const res = await sh(`cd /vercel/oc/repo\n${bootScript(label, bootEnv)}`);
          report.push(res.stdout);
        }

        out = report.join("\n");
        expect(out).toContain('"healthy":true');
        expect(out).toContain('"bash"');

        const outFile = process.env.MDY_OPENCODE_PROBE_OUT;
        if (outFile) fs.writeFileSync(outFile, out);
      } finally {
        const outFile = process.env.MDY_OPENCODE_PROBE_OUT;
        // Le rapport est écrit MÊME sur échec : sur une sonde, ce qu'on a mesuré
        // avant de tomber vaut souvent plus que l'assertion qui tombe.
        if (outFile && report.length) fs.writeFileSync(outFile, report.join("\n"));
        await sandbox.stop().catch(() => {});
      }
    },
    1_200_000,
  );
});
