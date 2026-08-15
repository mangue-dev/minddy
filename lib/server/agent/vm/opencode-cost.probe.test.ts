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
 * MIN-364 (lot 8, §5.6 de l'audit du 15/08) — CE QUE COÛTE UN ALLER-RETOUR DE
 * PERMISSION, ET CE QU'UNE ACL COÛTERAIT À LA PLACE.
 *
 * Ne tourne PAS avec `npm test` : `describe.skipIf` la saute tant que
 * `MDY_OPENCODE_COST_PROBE=1` n'est pas posé. Aucun modèle n'est dépensé — un
 * faux fournisseur scripte les appels de tool.
 *
 *   MDY_OPENCODE_COST_PROBE=1 MDY_OPENCODE_BIN=<…>/bin/opencode \
 *     npx vitest run lib/server/agent/vm/opencode-cost.probe.test.ts --testTimeout=900000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION POSÉE PAR L'AUDIT
 *
 * `read: "ask"` et `bash: "ask"` font payer **un aller-retour HTTP en boucle
 * locale par lecture et par commande**. Sur un tour à 300 lectures, c'est 300
 * allers-retours pour appliquer une règle qui tient en un glob (`*.env`), et
 * 100 % des commandes pour une liste qui ne vise que git. L'audit dit la mesure
 * « la plus rentable à faire », parce que la sortie est simple : les deux règles
 * s'expriment en ACL de config, où un `deny` court-circuite AVANT publication.
 *
 * Et il nomme le prix de cette sortie : une ACL en glob ne sait pas lire
 * `bash -lc "git reset --hard"` ni `env -i git push`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RELEVÉ DU 2026-08-15 sur `opencode-ai@1.18.16` (Mac, 12 cœurs, N=30)
 *
 * ```
 * read: allow             1 318 ms   43,93 ms/appel    0 demande
 * read: ask + verdict     1 330 ms   44,33 ms/appel   30 demandes   → +0,40 ms/lecture
 * bash: allow             1 402 ms   46,73 ms/appel    0 demande
 * bash: ask + verdict     1 572 ms   52,40 ms/appel   30 demandes   → +5,67 ms/commande
 * ```
 *
 * **LA MESURE TRANCHE CONTRE L'ACL, et sans hésitation.**
 *
 * 1. **L'aller-retour est quasi gratuit.** Une socket de boucle locale et un
 *    handler qui ne fait rien : 0,4 ms par lecture, 5,7 ms par commande. Le tour
 *    à 300 lectures que l'audit prend en exemple paie donc **~120 ms de mur** —
 *    à comparer aux secondes d'un round de modèle, et aux minutes d'un tour. Ce
 *    n'était pas un coût, c'était une intuition.
 * 2. **Le motif `*.env` PORTE, lui — contrairement à ce qu'on craignait.** Mesuré
 *    aux trois emplacements qui comptent depuis D5 : racine du dépôt, sous-dossier
 *    du dépôt, et **hors du dépôt** — les trois sont refusés. La grammaire de
 *    `read` juge le nom de base, pas un chemin relatif à la racine (c'est celle
 *    d'`edit` qui est ancrée sur le dépôt, cf. la sonde de permissions).
 * 3. **Mais un `deny` de config NE PARLE PAS AU MODÈLE.** Il rend « The user has
 *    specified a rule which prevents you from using this specific tool call »,
 *    suivi du vidage brut de l'ACL. Notre refus, lui, dit une phrase : « ce sont
 *    les vraies clés de cette machine ; si tu veux savoir quelles variables
 *    existent, lis le `.env.example` d'à côté ». C'est ce qui fait qu'un modèle
 *    corrige au lieu de réessayer — et c'est ce qu'on perdrait pour 0,4 ms.
 *
 * **Décision : on garde `ask`.** Et le §5.6 se referme sur son propre argument
 * inversé : ce n'est pas l'ACL qui devient tentante, c'est l'aller-retour qui
 * cesse d'être un problème.
 */

const LIVE = process.env.MDY_OPENCODE_COST_PROBE === "1";

/** Combien d'appels de tool par round mesuré. Assez pour que l'écart se voie. */
const N = Number(process.env.MDY_OPENCODE_COST_N ?? 30);

let installRoot = "";
let bin = "";
const running: ProbeServer[] = [];
const providers: FakeProvider[] = [];
const roots: string[] = [];
/** Le tableau récapitulatif, écrit à la fin — c'est LUI la sortie de la sonde. */
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
 * LE RÉPONDEUR, ET IL FAIT CE QUE FAIT LE SUPERVISEUR : il lit le flux, décide
 * (ici : toujours oui), et POSTe `/permission/:id/reply`. C'est ce qui rend la
 * mesure honnête — l'aller-retour mesuré est celui qui existe en production, pas
 * une approximation.
 *
 * Le sondage à 1 ms est le seul écart avec le superviseur, qui lit le flux au fil
 * de l'eau. Il ne peut qu'ALOURDIR le chiffre : ce qu'on mesure est donc une
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

/** Un décor complet, avec N fichiers à lire dans le dépôt. */
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

/** Joue le round et rend le temps de mur du prompt au repos. */
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

      // CHAQUE lecture publie : c'est le fait que l'audit avance, et il est vrai.
      expect(responder.count(), "toutes les lectures n'ont pas publié").toBe(N);
      /**
       * ET LE SURCOÛT EST DÉRISOIRE. La borne est large parce que la machine qui
       * mesure n'est pas dédiée ; ce qu'elle garde est l'ordre de grandeur, et il
       * suffit à trancher : un aller-retour de boucle locale coûte une fraction
       * de milliseconde, quand un round de modèle coûte des secondes.
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
 * CE QU'UNE ACL SAURAIT DIRE, ET CE QU'ELLE NE SAURAIT PAS.
 *
 * La sortie que l'audit propose est de remplacer l'`ask` par des motifs de
 * config. Ces mesures disent si notre règle y tient — et la réponse est non, pour
 * une raison qui n'existait pas avant D5 : le disque est ouvert, donc un `.env`
 * n'est plus forcément dans le dépôt.
 */
describe.skipIf(!LIVE)("ce qu'une ACL de `read` sait exprimer", () => {
  /** Le fichier a été lu si le tool est `completed` et rend son contenu. */
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
   * OÙ LE MOTIF `*.env` PORTE VRAIMENT — les trois emplacements qui comptent
   * depuis D5, mesurés plutôt que supposés.
   *
   * ⚠ LA PREMIÈRE VERSION DE CETTE MESURE ÉTAIT FAUSSE, et la faute vaut d'être
   * écrite : la file du faux fournisseur portait un premier tour bidon (le chemin
   * réel n'est connu qu'après le boot), le prompt consommait CELUI-LÀ, et le
   * `read` échouait sur un fichier inexistant. La sonde lisait « refusé » et
   * mesurait un ENOENT. D'où le `boot` à file VIDE, et l'assertion sur le MOTIF
   * de l'erreur — « rule which prevents you » et pas n'importe quel échec.
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

      // Le motif porte sur le NOM DE BASE : il couvre les deux emplacements, donc
      // l'ACL n'est PAS trouée sur ce point-là. Ce qui la disqualifie est ailleurs
      // — le message rendu au modèle, mesuré juste en dessous.
      expect(releve["hors du dépôt"]).toBe("refusé par l'ACL");
      expect(releve["imbriqué dans le dépôt"]).toBe("refusé par l'ACL");
    },
    900_000,
  );

  /**
   * ET UN `deny` NE PARLE PAS AU MODÈLE. Notre refus lui dit « lis le
   * `.env.example` d'à côté » ; un `deny` de config lui dit qu'une règle
   * l'empêche, sans dire quoi faire — donc il réessaie.
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
       * CE QUE LE MODÈLE LIT VRAIMENT : « The user has specified a rule which
       * prevents you from using this specific tool call », suivi du VIDAGE DE
       * L'ACL — nos motifs concaténés après ceux d'opencode (relevé du 15/08 :
       * `[{"permission":"*","action":"allow"},…,{"permission":"read",
       * "pattern":"*.env","action":"deny"}]`).
       *
       * Il y a donc bien `.env.example` dans le texte, mais comme une LIGNE DE
       * RÈGLE, pas comme un conseil. Notre refus, lui, dit une phrase : « lis le
       * `.env.example` d'à côté ». C'est ce qui fait qu'un modèle corrige au lieu
       * de réessayer — et c'est ce qu'un `deny` de config ne sait pas dire.
       */
      expect(part?.error).toContain("rule which prevents you");
      expect(part?.error).toContain('"action":"deny"');
      expect(part?.error).not.toMatch(/read the .*\.env\.example/i);
      expect(part?.error).not.toMatch(/this machine's real credentials/i);
    },
    900_000,
  );
});
