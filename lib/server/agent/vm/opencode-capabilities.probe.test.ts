import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  installOpencode,
  probeConfig,
  probeRoot,
  sleep,
  startProbeServer,
  startProvider,
  waitFor,
  type FakeProvider,
  type ProbeServer,
} from "./opencode-probe-rig";

/**
 * MIN-364 (lot 9, §3 #11-#12 et §5.4 de l'audit du 15/08) — LES TROIS CAPACITÉS
 * « À CADRER », MESURÉES AVANT D'ÊTRE TRANCHÉES.
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_OPENCODE_CAPS_PROBE=1` n'est pas posé. Aucun modèle n'est dépensé.
 *
 *   MDY_OPENCODE_CAPS_PROBE=1 MDY_OPENCODE_BIN=<…>/bin/opencode \
 *     npx vitest run lib/server/agent/vm/opencode-capabilities.probe.test.ts --testTimeout=900000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE
 *
 * L'audit range `skill`, `todowrite` et les serveurs MCP du dépôt en « à
 * cadrer », et le cadrage ne pouvait pas se faire sans savoir **d'où ces choses
 * viennent**. Un `skill: true` posé sans le savoir ouvre — sur la machine de
 * l'utilisateur — une porte dont l'audit ne mesure pas la largeur.
 *
 * ⚠ LA DÉCOUVERTE EST MÉMOÏSÉE au premier accès : toute mesure d'un
 * `OPENCODE_DISABLE_*` demande un serveur NEUF, avec la variable posée dès le
 * `spawn` (`startProbeServer({env})`). Une première version de cette sonde
 * restaurait `process.env` avant de redémarrer, et mesurait donc un serveur sur
 * lequel rien n'était posé — elle disait « oui, c'est bien coupé » sur trois cas
 * où rien ne l'était.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RELEVÉ DU 2026-08-15 sur `opencode-ai@1.18.16`
 *
 * 1. **`skill` lit `$HOME`, pas `XDG_CONFIG_HOME`.** La découverte est
 *    `~/.claude/skills/…/SKILL.md` et `~/.agents/skills/…/SKILL.md`, plus la même
 *    remontée depuis le dossier de session jusqu'à la racine du dépôt. Le harness
 *    relocalise `XDG_*` mais **pas `HOME`** : `skill: true` sur un Mac servirait
 *    donc à l'agent les skills Claude Code de son propriétaire ET celles du
 *    dépôt, sans que rien ne l'ait décidé.
 * 2. **Deux écoutilles existent pour choisir**, et le harness n'en posait aucune :
 *    `OPENCODE_DISABLE_EXTERNAL_SKILLS` (coupe TOUTE la découverte implicite) et
 *    `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` (coupe `~/.claude` seulement). Plus une
 *    clé de config `skills.paths` qui NOMME les dossiers — la seule forme
 *    sélective, et la seule qui survive à `OPENCODE_DISABLE_EXTERNAL_SKILLS`.
 * 3. **`todowrite` est purement local à opencode** : aucune permission publiée,
 *    aucune écriture ailleurs. Son coût est un jeu de tools plus large et une
 *    seconde checklist à côté de la nôtre — pas du réseau.
 * 4. **Les serveurs MCP du dépôt sont bien fermés par
 *    `OPENCODE_DISABLE_PROJECT_CONFIG`**, et la clé `mcp` de NOTRE config reste
 *    lue : servir un serveur MCP nommé par minddy est possible sans rouvrir la
 *    remontée qui ramasse aussi les tools `*.ts` et les plugins.
 */

const LIVE = process.env.MDY_OPENCODE_CAPS_PROBE === "1";

let installRoot = "";
let bin = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  installRoot = probeRoot("install-caps");
  roots.push(installRoot);
  bin = installOpencode(installRoot);
}, 600_000);

afterEach(() => {
  for (const server of running.splice(0)) server.stop();
  for (const provider of providers.splice(0)) provider.close();
});

afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Un décor où le DÉCOR EST POSÉ AVANT LE SERVEUR : `prepare` reçoit la racine et
 * le dépôt, écrit ce qu'il veut, et seulement ensuite opencode démarre. C'est ce
 * que la mémoïsation de la découverte impose.
 */
async function boot(opts: {
  tag: string;
  config?: Record<string, unknown>;
  env?: Record<string, string>;
  prepare?: (paths: { root: string; repo: string }) => void;
}): Promise<{ server: ProbeServer; provider: FakeProvider }> {
  const provider = await startProvider([{ text: "fini" }]);
  providers.push(provider);
  const root = probeRoot(opts.tag);
  roots.push(root);
  const { execFileSync } = await import("node:child_process");
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=probe", ...args], { cwd: repo });
  git(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "init"]);
  opts.prepare?.({ root, repo });

  const server = await startProbeServer({
    bin,
    tag: opts.tag,
    config: probeConfig(provider.url, opts.config ?? {}),
    reuse: { root, repo },
    ...(opts.env ? { env: opts.env } : {}),
  });
  running.push(server);
  return { server, provider };
}

/** Pose une skill au format attendu (`<dir>/<nom>/SKILL.md`, front-matter YAML). */
function writeSkill(dir: string, name: string, description: string): void {
  const target = path.join(dir, name);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nFais ce qui est écrit ici.\n`,
  );
}

/** Les skills qu'opencode dit connaître, par leur nom (`GET /skill`). */
async function skillNames(server: ProbeServer): Promise<string[]> {
  const res = await server.get("/skill").catch(() => null);
  const body = res?.body;
  const list = Array.isArray(body) ? body : ((body as { skills?: unknown[] })?.skills ?? []);
  return (list as Array<{ name?: string }>)
    .map((s) => String(s?.name ?? ""))
    .filter(Boolean)
    .sort();
}

describe.skipIf(!LIVE)("d'où viennent les skills (§3 #11)", () => {
  const poser = ({ root }: { root: string }): void => {
    // `startProbeServer` pose `HOME` sur la racine de la sonde : on y écrit donc
    // « le home de l'utilisateur », sans jamais toucher au vrai.
    writeSkill(path.join(root, ".claude", "skills"), "skill-de-lhumain", "la sienne");
    writeSkill(path.join(root, ".agents", "skills"), "skill-agents", "la sienne aussi");
  };

  it(
    "les prend dans `$HOME`, que le harness ne relocalise PAS",
    async () => {
      const { server } = await boot({
        tag: "skill-home",
        config: { tools: { skill: true } },
        prepare: poser,
      });
      const names = await skillNames(server);
      // C'EST LE FAIT QUI CADRE LE LOT 9 : ouvrir `skill` sur un Mac, c'est
      // ouvrir le dossier de skills Claude Code de son propriétaire.
      expect(names).toEqual(expect.arrayContaining(["skill-de-lhumain", "skill-agents"]));
    },
    900_000,
  );

  it(
    "`OPENCODE_DISABLE_EXTERNAL_SKILLS` les coupe TOUTES",
    async () => {
      const { server } = await boot({
        tag: "skill-coupe",
        config: { tools: { skill: true } },
        env: { OPENCODE_DISABLE_EXTERNAL_SKILLS: "1" },
        prepare: poser,
      });
      const names = await skillNames(server);
      expect(names).not.toContain("skill-de-lhumain");
      expect(names).not.toContain("skill-agents");
    },
    900_000,
  );

  it(
    "`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` ne coupe QUE `~/.claude`",
    async () => {
      const { server } = await boot({
        tag: "skill-claude",
        config: { tools: { skill: true } },
        env: { OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1" },
        prepare: poser,
      });
      const names = await skillNames(server);
      expect(names).not.toContain("skill-de-lhumain");
      expect(names).toContain("skill-agents");
    },
    900_000,
  );

  it(
    "`skills.paths` NOMME les dossiers — la seule forme sélective",
    async () => {
      let choisi = "";
      const { server } = await boot({
        tag: "skill-paths",
        config: {}, // complété juste après : le chemin dépend de la racine
        prepare: ({ root }) => {
          choisi = path.join(root, "skills-minddy");
          writeSkill(choisi, "skill-nommee", "celle que minddy a choisie");
        },
      });
      server.stop();
      // Le chemin n'existe qu'après `prepare` : on relance avec la config qui le
      // nomme, sur le MÊME décor.
      const repris = await startProbeServer({
        bin,
        tag: "skill-paths",
        config: probeConfig(providers.at(-1)!.url, {
          tools: { skill: true },
          skills: { paths: [choisi] },
        }),
        reuse: { root: server.root, repo: server.repo },
        // Et avec la découverte implicite COUPÉE : c'est la combinaison qui
        // intéresse le cadrage — rien du disque de l'utilisateur, seulement ce
        // que minddy nomme.
        env: { OPENCODE_DISABLE_EXTERNAL_SKILLS: "1" },
      });
      running.push(repris);

      const names = await skillNames(repris);
      expect(names).toContain("skill-nommee");
      expect(names).not.toContain("skill-de-lhumain");
    },
    900_000,
  );
});

describe.skipIf(!LIVE)("ce que `todowrite` coûte vraiment (§3 #12)", () => {
  it(
    "n'écrit nulle part hors d'opencode — le coût est le jeu de tools, pas le réseau",
    async () => {
      const { server, provider } = await boot({
        tag: "todo",
        config: { tools: { todowrite: true } },
      });
      provider.queue.length = 0;
      provider.queue.push({
        tools: [
          {
            name: "todowrite",
            args: {
              todos: [
                { id: "1", content: "explorer", status: "in_progress", priority: "high" },
                { id: "2", content: "écrire", status: "pending", priority: "medium" },
              ],
            },
          },
        ],
      });
      const session = await server.createSession("todo");
      await server.prompt(session);
      await waitFor(() => server.toolParts().some((p) => p.tool === "todowrite"), 30_000);
      await sleep(300);

      const part = server.toolParts().find((p) => p.tool === "todowrite");
      expect(part?.status, `le tool n'a pas abouti : ${part?.error ?? "?"}`).toBe("completed");
      // Aucune permission publiée : rien à arbitrer, donc rien qui sorte du
      // process. Le « 20 écritures réseau » du §3 #12 vise `update_plan`, notre
      // checklist à nous — pas celle-ci.
      expect(server.asks().map((a) => a.permission)).not.toContain("todowrite");
    },
    900_000,
  );
});

describe.skipIf(!LIVE)("les serveurs MCP (§5.4, dernière écoutille)", () => {
  /** Un `opencode.json` de dépôt qui déclare un serveur MCP — ce que n'importe
   *  quel dépôt public peut porter, et qu'une session lance au démarrage. */
  const piegerLeDepot = ({ repo }: { repo: string }): void => {
    fs.writeFileSync(
      path.join(repo, "opencode.json"),
      JSON.stringify({ mcp: { piege: { type: "local", command: ["/bin/echo", "coucou"] } } }),
    );
  };

  it(
    "ceux du DÉPÔT sont bien fermés par `OPENCODE_DISABLE_PROJECT_CONFIG`",
    async () => {
      const { server } = await boot({
        tag: "mcp-depot",
        env: { OPENCODE_DISABLE_PROJECT_CONFIG: "1" },
        prepare: piegerLeDepot,
      });
      const config = await server.get("/config");
      const mcp = (config.body as { mcp?: Record<string, unknown> })?.mcp ?? {};
      expect(
        Object.keys(mcp),
        "le `opencode.json` du dépôt est remonté : la fermeture ne tient plus",
      ).toEqual([]);
    },
    900_000,
  );

  it(
    "…et le TÉMOIN : sans l'écoutille, le dépôt impose bien son serveur",
    async () => {
      // Sans ce témoin, le test du dessus passerait aussi le jour où la clé `mcp`
      // cesserait d'exister — il mesurerait alors l'absence d'une fonctionnalité,
      // pas l'effet d'une écoutille.
      const { server } = await boot({ tag: "mcp-temoin", prepare: piegerLeDepot });
      const config = await server.get("/config");
      const mcp = (config.body as { mcp?: Record<string, unknown> })?.mcp ?? {};
      expect(Object.keys(mcp)).toEqual(["piege"]);
    },
    900_000,
  );

  it(
    "la clé `mcp` de NOTRE config est lue : nommer reste possible",
    async () => {
      const { server } = await boot({
        tag: "mcp-notre",
        config: {
          mcp: { minddy: { type: "local", command: ["/bin/echo", "coucou"], enabled: false } },
        },
        env: { OPENCODE_DISABLE_PROJECT_CONFIG: "1" },
        prepare: piegerLeDepot,
      });
      const config = await server.get("/config");
      const mcp = (config.body as { mcp?: Record<string, unknown> })?.mcp ?? {};
      // Le nôtre passe, celui du dépôt non : la fermeture est SÉLECTIVE, ce qui
      // est exactement ce que le cadrage du lot 9 avait besoin de savoir.
      expect(Object.keys(mcp)).toEqual(["minddy"]);
    },
    900_000,
  );
});
