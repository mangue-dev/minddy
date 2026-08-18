import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  bash,
  installOpencode,
  probeConfig,
  probeRoot,
  sleep,
  startProbeServer,
  startProvider,
  waitFor,
  type FakeProvider,
  type ProbeServer,
  type ToolCall,
} from "./opencode-probe-rig";

/**
 * MIN-364 (lot 8, §5.6 of the audit of 08/15) — WHAT A ROUND TRIP COSTS
 * PERMISSION, AND WHAT AN ACL WOULD COST INSTEAD.
 *
 * Does NOT run with `npm test`: `describe.skipIf` skips it as long as
 * `MDY_OPENCODE_COST_PROBE=1` is not set. No models are spent — one
 * fake provider scripts tool calls.
 *
 *   MDY_OPENCODE_COST_PROBE=1 MDY_OPENCODE_BIN=<…>/bin/opencode \
 *     npx vitest run lib/server/agent/vm/opencode-cost.probe.test.ts --testTimeout=900000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION ASKED BY THE AUDIT
 *
 * `read: "ask"` and `bash: "ask"` charge **for an HTTP loop round trip
 * local by reading and by command**. On a 300 reading round, it's 300
 * back and forth to apply a rule that fits in a glob (`*.env`), and
 * 100% of orders for a list that only targets git. The audit says the measure
 * “the most profitable to do”, because the exit is simple: the two rules
 * are expressed in config ACL, where a `deny` bypasses BEFORE publication.
 *
 * And he names the price of this output: a global ACL cannot read
 * `bash -lc "git reset --hard"` ni `env -i git push`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATEMENT OF 2026-08-15 on `opencode-ai@1.18.16` (Mac, 12 cores, N=30)
 *
 * ```
 * read: allow             1 318 ms   43,93 ms/appel    0 demande
 * read: ask + verdict     1 330 ms   44,33 ms/appel   30 demandes   → +0,40 ms/lecture
 * bash: allow             1 402 ms   46,73 ms/appel    0 demande
 * bash: ask + verdict     1 572 ms   52,40 ms/appel   30 demandes   → +5,67 ms/commande
 * ```
 *
 * **THE MEASURE CLOSE AGAINST THE ACL, and without hesitation.**
 *
 * 1. **The round trip is almost free.** A local loop socket and a
 * handler which does nothing: 0.4 ms per read, 5.7 ms per command. The tour
 * at 300 readings that the audit takes as an example therefore pays **~120 ms of wall** —
 * compare to the seconds of a model round, and the minutes of a round. This
 * was not a cost, it was an intuition.
 * 2. **The `*.env` DOOR pattern — contrary to what was feared.** Measured
 * in the three locations that matter since D5: repository root, subfolder
 * from the deposit, and **outside the deposit** — all three are refused. The grammar of
 * `read` judges the base name, not a path relative to the root (this is the one
 * d'`edit` which is anchored on the repository, cf. the permissions probe).
 * 3. **But a `deny` of config DOES NOT SPEAK TO THE MODEL.** It renders “The user has
 *    specified a rule which prevents you from using this specific tool call »,
 * followed by raw ACL dump. Our refusal says a sentence: “these are
 * the real keys to this machine; if you want to know which variables
 * exist, read the `.env.example` next to it”. This is what makes a model
 * corrects instead of trying again — and that's what we would lose for 0.4 ms.
 *
 * **Decision: we keep `ask`.** And §5.6 closes on its own argument
 * inverted: it's not the ACL that becomes tempting, it's the back and forth that
 * ceases to be a problem.
 */

const LIVE = process.env.MDY_OPENCODE_COST_PROBE === "1";

/** How many tool calls per round measured. Enough so that the gap is visible. */
const N = Number(process.env.MDY_OPENCODE_COST_N ?? 30);

let installRoot = "";
let bin = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];
/** The summary table, written at the end — THIS is the output of the probe. */
const measures: Array<{ cas: string; ms: number; parAppel: number; demandes: number }> = [];

beforeAll(async () => {
  if (!LIVE) return;
  installRoot = probeRoot("install-cost");
  roots.push(installRoot);
  bin = installOpencode(installRoot);
}, 600_000);

afterEach(() => {
  for (const server of running.splice(0)) server.stop();
  for (const provider of providers.splice(0)) provider.close();
});

afterAll(() => {
  if (measures.length > 0) {
    console.log(
      `\n── Coût d'un aller-retour de permission (opencode 1.18.16, N=${N}) ──\n` +
        measures
          .map(
            (m) =>
              `${m.cas.padEnd(28)} ${String(Math.round(m.ms)).padStart(6)} ms  ` +
              `${m.parAppel.toFixed(2).padStart(6)} ms/appel  ${m.demandes} demande(s)`,
          )
          .join("\n") +
        "\n",
    );
  }
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * THE ANSWER MACHINE, AND IT DOES WHAT THE SUPERVISOR DOES: it reads the flow, decides
 * (here: always yes), and POSTe `/permission/:id/reply`. This is what makes the
 * honest measurement — the measured round trip is the one that exists in production, not
 * an approximation.
 *
 * The 1 ms poll is the only difference with the supervisor, who reads the stream as it goes
 * water. It can only INCREASE the figure: what we measure is therefore a
 * borne haute.
 */
function autoAnswer(server: ProbeServer): { stop: () => void; count: () => number } {
  const answered = new Set<string>();
  let alive = true;
  const loop = async (): Promise<void> => {
    while (alive) {
      for (const ask of server.asks()) {
        const id = String(ask.id ?? "");
        if (!id || answered.has(id)) continue;
        answered.add(id);
        await server.post(`/permission/${id}/reply`, { reply: "once" }).catch(() => {});
      }
      await sleep(1);
    }
  };
  void loop();
  return { stop: () => (alive = false), count: () => answered.size };
}

/** A complete decor, with N files to read in the repository. */
async function boot(
  tag: string,
  turns: Parameters<typeof startProvider>[0],
  permission: Record<string, unknown>,
): Promise<{ server: ProbeServer; provider: FakeProvider }> {
  const provider = await startProvider(turns);
  providers.push(provider);
  const server = await startProbeServer({
    bin,
    tag,
    config: probeConfig(provider.url, { permission }),
  });
  running.push(server);
  roots.push(server.root);
  for (let i = 0; i < N; i++) {
    fs.writeFileSync(path.join(server.repo, `f-${i}.txt`), `contenu ${i}\n`);
  }
  return { server, provider };
}

const readCall = (filePath: string): ToolCall => ({ name: "read", args: { filePath } });

/** Play the round and return the prompt wall time to rest. */
async function timeTurn(server: ProbeServer, sessionId: string): Promise<number> {
  const started = Date.now();
  await server.prompt(sessionId);
  await waitFor(() => server.sawIdle(), 120_000, 5);
  return Date.now() - started;
}

describe.skipIf(!LIVE)("le coût d'un aller-retour de permission", () => {
  it(
    `${N} lectures : \`read: "allow"\` (aucune demande) contre \`read: "ask"\` (une par lecture)`,
    async () => {
      const calls = Array.from({ length: N }, (_, i) => readCall(`f-${i}.txt`));

      const libre = await boot("cost-read-allow", [{ tools: calls }], { read: "allow" });
      const sessionLibre = await libre.server.createSession("allow");
      const msLibre = await timeTurn(libre.server, sessionLibre);
      expect(libre.server.asks(), "une lecture en `allow` ne publie rien").toEqual([]);
      measures.push({ cas: "read: allow", ms: msLibre, parAppel: msLibre / N, demandes: 0 });

      const garde = await boot("cost-read-ask", [{ tools: calls }], { read: "ask" });
      const responder = autoAnswer(garde.server);
      const sessionGarde = await garde.server.createSession("ask");
      const msGarde = await timeTurn(garde.server, sessionGarde);
      responder.stop();
      measures.push({
        cas: "read: ask + verdict",
        ms: msGarde,
        parAppel: msGarde / N,
        demandes: responder.count(),
      });

      // EVERY reading publishes: this is the fact that the audit is moving forward, and it is true.
      expect(responder.count(), "toutes les lectures n'ont pas publié").toBe(N);
      /**
       * AND THE EXTRA COST IS IGNORABLE. The terminal is wide because the machine which
       * measurement is not dedicated; what it keeps is the order of magnitude, and it
       * is enough to decide: a local loop round trip costs a fraction
       * of millisecond, when a model round costs seconds.
       */
      const surcout = (msGarde - msLibre) / N;
      expect(surcout, `surcoût mesuré : ${surcout.toFixed(2)} ms par lecture`).toBeLessThan(20);
    },
    900_000,
  );

  it(
    `${N} commandes : \`bash: "allow"\` contre \`bash: "ask"\``,
    async () => {
      const calls = Array.from({ length: N }, (_, i) => bash(`echo ${i}`));

      const libre = await boot("cost-bash-allow", [{ tools: calls }], { bash: "allow" });
      const sessionLibre = await libre.server.createSession("allow");
      const msLibre = await timeTurn(libre.server, sessionLibre);
      measures.push({ cas: "bash: allow", ms: msLibre, parAppel: msLibre / N, demandes: 0 });

      const garde = await boot("cost-bash-ask", [{ tools: calls }], { bash: "ask" });
      const responder = autoAnswer(garde.server);
      const sessionGarde = await garde.server.createSession("ask");
      const msGarde = await timeTurn(garde.server, sessionGarde);
      responder.stop();
      measures.push({
        cas: "bash: ask + verdict",
        ms: msGarde,
        parAppel: msGarde / N,
        demandes: responder.count(),
      });

      expect(responder.count()).toBe(N);
      const surcout = (msGarde - msLibre) / N;
      expect(surcout, `surcoût mesuré : ${surcout.toFixed(2)} ms par commande`).toBeLessThan(20);
    },
    900_000,
  );
});

/**
 * WHAT AN ACL COULD SAY, AND WHAT IT WOULD NOT KNOW.
 *
 * The output that the audit proposes is to replace the `ask` with reasons for
 * config. These measurements say whether our rule holds up — and the answer is no, for
 * a reason that did not exist before D5: the disk is open, therefore a `.env`
 * is no longer necessarily in the repository.
 */
describe.skipIf(!LIVE)("ce qu'une ACL de `read` sait exprimer", () => {
  /** The file has been read if the tool is `completed` and renders its contents. */
  const readWorked = (server: ProbeServer): boolean =>
    server.toolParts().some((p) => p.tool === "read" && p.status === "completed");

  it(
    "refuse bien un `.env` À LA RACINE du dépôt",
    async () => {
      const { server } = await boot(
        "acl-env-racine",
        [{ tools: [readCall(".env")] }],
        { read: { "*": "allow", "*.env": "deny", "*.env.*": "deny" } },
      );
      fs.writeFileSync(path.join(server.repo, ".env"), "OPENROUTER_API_KEY=sk-or-v1-x\n");
      const session = await server.createSession("acl");
      await server.prompt(session);
      await waitFor(() => server.toolParts().length > 0, 30_000);
      await sleep(500);
      expect(readWorked(server), "le `.env` de la racine a été lu malgré le `deny`").toBe(false);
    },
    900_000,
  );

  /**
   * WHERE THE `*.env` PATTERN REALLY MATTERS — the three locations that matter
   * since D5, measured rather than assumed.
   *
   * ⚠ THE FIRST VERSION OF THIS MEASURE WAS FALSE, and the fault deserves to be
   * written: the line of the false supplier carried a bogus first turn (the path
   * real is only known after boot), the prompt consumed THIS ONE, and the
   * `read` failed on a non-existent file. The probe read “refused” and
   * measured an ENOENT. Hence the `boot` with EMPTY file, and the assertion on the PATTERN
   * of the error — “rule which prevents you” and not just any failure.
   */
  it(
    "porte sur le nom de base, dépôt ou pas — mais ne dit toujours rien au modèle",
    async () => {
      const { server, provider } = await boot("acl-env-partout", [], {
        read: { "*": "allow", "*.env": "deny", "*.env.*": "deny" },
        external_directory: "allow",
      });
      const dehors = path.join(server.root, "ailleurs");
      fs.mkdirSync(dehors, { recursive: true });
      const horsDepot = path.join(dehors, ".env");
      fs.writeFileSync(horsDepot, "OPENROUTER_API_KEY=sk-or-v1-x\n");
      fs.mkdirSync(path.join(server.repo, "apps", "web"), { recursive: true });
      const imbrique = path.join(server.repo, "apps", "web", ".env");
      fs.writeFileSync(imbrique, "X=1\n");

      const releve: Record<string, string> = {};
      for (const [nom, cible] of [
        ["hors du dépôt", horsDepot],
        ["imbriqué dans le dépôt", imbrique],
      ] as const) {
        provider.queue.push({ tools: [readCall(cible)] });
        const session = await server.createSession(nom);
        const avant = server.toolParts().length;
        await server.prompt(session);
        await waitFor(() => server.toolParts().length > avant, 30_000);
        await sleep(300);
        const part = server.toolParts().at(-1);
        releve[nom] =
          part?.status === "completed"
            ? "LU"
            : part?.error?.includes("rule which prevents you")
              ? "refusé par l'ACL"
              : `échec autre (${(part?.error ?? "").slice(0, 60)})`;
      }
      console.log(
        `\n[ACL] \`{"*.env":"deny"}\` — où le motif porte, mesuré :\n` +
          Object.entries(releve)
            .map(([nom, verdict]) => `      ${nom.padEnd(24)} → ${verdict}`)
            .join("\n") +
          "\n",
      );

      // The pattern is on the BASE NAME: it covers both slots, so
      // the ACL is NOT holed at this point. What disqualifies it is elsewhere
      // — the message delivered to the model, measured just below.
      expect(releve["hors du dépôt"]).toBe("refusé par l'ACL");
      expect(releve["imbriqué dans le dépôt"]).toBe("refusé par l'ACL");
    },
    900_000,
  );

  /**
   * AND A `deny` DOES NOT TALK TO THE MODEL. Our refusal tells him “read it
   * `.env.example` next door”; a `deny` of config tells him that a rule
   * stops him, without saying what to do — so he tries again.
   */
  it(
    "un `deny` de config rend un message générique, pas le mot du harness",
    async () => {
      const { server } = await boot(
        "acl-message",
        [{ tools: [readCall(".env")] }],
        { read: { "*": "allow", "*.env": "deny" } },
      );
      fs.writeFileSync(path.join(server.repo, ".env"), "X=1\n");
      const session = await server.createSession("message");
      await server.prompt(session);
      await waitFor(() => server.toolParts().some((p) => p.status === "error"), 30_000);
      const part = server.toolParts().find((p) => p.tool === "read");
      expect(part?.status).toBe("error");
      /**
       * WHAT THE TEMPLATE REALLY READS: “The user has specified a rule which
       * prevents you from using this specific tool call », suivi du VIDAGE DE
       * The ACL — our patterns concatenated after those of opencode (reported on 08/15:
       * `[{"permission":"*","action":"allow"},…,{"permission":"read",
       * "pattern":"*.env","action":"deny"}]`).
       *
       * So there is indeed `.env.example` in the text, but like a LINE OF
       * RULE, not as advice. Our refusal says a sentence: “read it
       * `.env.example` next door”. This is what makes a model correct instead
       * to try again — and that's what a config `deny` can't say.
       */
      expect(part?.error).toContain("rule which prevents you");
      expect(part?.error).toContain('"action":"deny"');
      expect(part?.error).not.toMatch(/read the .*\.env\.example/i);
      expect(part?.error).not.toMatch(/this machine's real credentials/i);
    },
    900_000,
  );
});
