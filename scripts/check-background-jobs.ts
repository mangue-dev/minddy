/**
 * Vérifie le shell des JOBS DE FOND (`run_background`, MIN-114) sur une VRAIE
 * microVM : détachement, survie au lanceur, sonde incrémentale, bornage d'un job
 * bavard, code de sortie, arrêt de l'arbre entier, aucun processus oublié.
 *
 * Ce script existe parce que les tests unitaires ne peuvent pas voir ce que fait
 * un vrai noyau : il a trouvé deux bugs qu'aucune relecture n'aurait attrapés — un
 * `exit` dans la commande sautait la ligne du code de sortie, et le PID 1 de la
 * microVM ne moissonnant pas ses orphelins, `kill -0` disait « vivant » sur un
 * zombie. À relancer si l'on touche aux scripts de lib/server/agent/background.ts.
 *
 * Usage (lit VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID dans .env) :
 *   npx tsx scripts/check-background-jobs.ts
 */
import fs from "node:fs";
import { Sandbox } from "@vercel/sandbox";
import {
  backgroundProbeScript,
  backgroundStartScript,
  backgroundStopScript,
  parseBackgroundProbe,
  BACKGROUND_FETCH_BYTES,
} from "../lib/server/agent/background";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^(VERCEL_TOKEN|VERCEL_TEAM_ID|VERCEL_PROJECT_ID)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const DIR = "/vercel/sandbox/tool-output";
const paths = (jobId: string) => ({
  log: `${DIR}/${jobId}.log`,
  pid: `${DIR}/${jobId}.pid`,
  exit: `${DIR}/${jobId}.exit`,
});

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const sandbox = await Sandbox.create({
    token: process.env.VERCEL_TOKEN!,
    teamId: process.env.VERCEL_TEAM_ID!,
    projectId: process.env.VERCEL_PROJECT_ID!,
    runtime: "node24",
    timeout: 300_000,
  });
  const sh = async (script: string) => {
    const res = await sandbox.runCommand({ cmd: "sh", args: ["-c", script], cwd: "/vercel/sandbox" });
    return { code: res.exitCode, out: await res.stdout(), err: await res.stderr() };
  };

  try {
    const setsid = await sh("command -v setsid || echo MISSING");
    check("setsid présent dans la microVM", !setsid.out.includes("MISSING"), setsid.out.trim());

    // ── A. Un serveur de dev : démarrer, sonder, curler, arrêter ─────────────
    const server =
      `node -e "require('http').createServer((_,res)=>res.end('hello minddy')).listen(3000,()=>console.log('listening on 3000'))"`;
    const t0 = Date.now();
    const started = await sh(backgroundStartScript(paths("bg-1"), server, DIR));
    const pid = Number.parseInt(started.out.trim(), 10);
    check("start rend la main tout de suite", Date.now() - t0 < 15_000, `${Date.now() - t0} ms`);
    check("start renvoie un PID", Number.isInteger(pid) && pid > 0, `pid=${pid}`);

    await new Promise((r) => setTimeout(r, 2500));
    const probe1 = parseBackgroundProbe(
      (await sh(backgroundProbeScript(paths("bg-1"), pid, 0, BACKGROUND_FETCH_BYTES))).out,
      { offset: 0, maxBytes: BACKGROUND_FETCH_BYTES },
    );
    check("le serveur tourne encore après le retour du lanceur", probe1.running);
    check("la sonde voit sa sortie", probe1.chunk.includes("listening on 3000"), JSON.stringify(probe1.chunk));

    const curl = await sh("curl -s --retry 5 --retry-connrefused http://localhost:3000/");
    check("le serveur répond au curl", curl.out.includes("hello minddy"), curl.out.trim());

    const probe2 = parseBackgroundProbe(
      (await sh(backgroundProbeScript(paths("bg-1"), pid, probe1.nextOffset, BACKGROUND_FETCH_BYTES))).out,
      { offset: probe1.nextOffset, maxBytes: BACKGROUND_FETCH_BYTES },
    );
    check("la 2e sonde ne rejoue pas la 1re", probe2.chunk === "", JSON.stringify(probe2.chunk));

    // Un `node -e` sous un `sh -c` : deux processus. L'arrêt doit prendre les deux.
    const before = await sh(`ps -o pid=,pgid=,args= | grep -c "[h]ello minddy" || true`);
    await sh(backgroundStopScript(pid));
    const after = await sh(`ps -o pid=,args= | grep "[h]ello minddy" || echo CLEAN`);
    check(
      "stop tue l'arbre entier (père + enfant)",
      after.out.includes("CLEAN"),
      `avant=${before.out.trim()} après=${after.out.trim()}`,
    );
    const port = await sh("curl -s -m 2 http://localhost:3000/ >/dev/null 2>&1 && echo STILL_UP || echo DOWN");
    check("le port est libéré", port.out.includes("DOWN"));

    const probe3 = parseBackgroundProbe(
      (await sh(backgroundProbeScript(paths("bg-1"), pid, probe2.nextOffset, BACKGROUND_FETCH_BYTES))).out,
      { offset: probe2.nextOffset, maxBytes: BACKGROUND_FETCH_BYTES },
    );
    check("la sonde d'après l'arrêt le dit mort", !probe3.running);

    // ── B. Un watcher bavard : l'incrément est borné, l'offset avance ────────
    const noisy = `i=0; while [ $i -lt 20000 ]; do echo "line $i ---------------------------------"; i=$((i+1)); done`;
    const noisyStart = await sh(backgroundStartScript(paths("bg-2"), noisy, DIR));
    const noisyPid = Number.parseInt(noisyStart.out.trim(), 10);
    await new Promise((r) => setTimeout(r, 4000));
    const big = parseBackgroundProbe(
      (await sh(backgroundProbeScript(paths("bg-2"), noisyPid, 0, BACKGROUND_FETCH_BYTES))).out,
      { offset: 0, maxBytes: BACKGROUND_FETCH_BYTES },
    );
    check(
      "un job bavard ne ramène que la queue",
      big.chunk.length <= BACKGROUND_FETCH_BYTES + 1,
      `${big.chunk.length} octets tirés sur ${big.nextOffset}`,
    );
    check("le reste est compté comme sauté", big.skippedBytes > 0, `${big.skippedBytes} octets`);
    check("la queue est bien la FIN du log", big.chunk.trimEnd().endsWith("line 19999 ---------------------------------"));
    check("le code de sortie est récupéré", big.exitCode === 0, `exit=${big.exitCode}, running=${big.running}`);

    // ── C. Une commande qui meurt : code de sortie visible ───────────────────
    const dead = await sh(backgroundStartScript(paths("bg-3"), "echo boom >&2; exit 3", DIR));
    const deadPid = Number.parseInt(dead.out.trim(), 10);
    await new Promise((r) => setTimeout(r, 1000));
    const deadProbe = parseBackgroundProbe(
      (await sh(backgroundProbeScript(paths("bg-3"), deadPid, 0, BACKGROUND_FETCH_BYTES))).out,
      { offset: 0, maxBytes: BACKGROUND_FETCH_BYTES },
    );
    check("un job mort rend son code", deadProbe.exitCode === 3 && !deadProbe.running, JSON.stringify(deadProbe));
    check("stderr atterrit dans le log", deadProbe.chunk.includes("boom"));
    // Arrêter un job déjà mort ne doit pas exploser.
    const stopDead = await sh(backgroundStopScript(deadPid));
    check("stop sur un job déjà mort sort 0", stopDead.code === 0);

    // ── D. Fin de tour : plus rien ne tourne ─────────────────────────────────
    const leftovers = await sh(`ps -o pid=,args= | grep -E "[n]ode -e|[l]ine \\$i" || echo NONE`);
    check("aucun processus oublié", leftovers.out.includes("NONE"), leftovers.out.trim());

    // Les logs restent lisibles (ils vivent dans TOOL_OUTPUT_DIR, hors du dépôt).
    const ls = await sh(`ls -1 ${DIR}`);
    check("les logs restent sur disque", ls.out.includes("bg-1.log"), ls.out.trim().replace(/\n/g, " "));
  } finally {
    await sandbox.stop().catch(() => {});
  }

  console.log(failures === 0 ? "\n🎉 tout est vert" : `\n💥 ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
