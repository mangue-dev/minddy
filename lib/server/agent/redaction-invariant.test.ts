import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_ENGINES, type AgentEngine } from "@/lib/agent-engines";
import { SecretRedactor } from "./redact";
import { redactDeep } from "./vm/supervisor";

/**
 * MIN-328 — LA SUBSTITUTION DES SECRETS, MOTEUR PAR MOTEUR.
 *
 * L'invariant de MIN-239 tient en une phrase : **le token de forge n'atteint
 * jamais le modèle, et n'entre jamais dans ce qu'on persiste**. Il était vrai
 * quand il n'y avait qu'un harnais — la boucle maison fabriquait elle-même chaque
 * message `role:"tool"` et le substituait au passage. Un second moteur est arrivé,
 * il est devenu LE moteur, et il exécute ses tools sans repasser par nous :
 * l'invariant est resté écrit en commentaire pendant que le chemin qu'il décrivait
 * n'était plus emprunté par personne. Personne ne l'a vu, parce qu'un secret qui
 * passe ne casse rien.
 *
 * D'où ce test, et sa forme : il itère sur `AGENT_ENGINES`. Un moteur DE PLUS sans
 * entrée dans la table ci-dessous fait tomber la suite — c'est exactement comme ça
 * que celui-ci est passé, et c'est le seul endroit du dépôt qui le remarquerait.
 *
 * Lexical plutôt qu'à l'exécution, comme [engine-wiring.test.ts](engine-wiring.test.ts) :
 * ces chemins demandent une microVM, un serveur opencode et un fournisseur. Le
 * COMPORTEMENT, lui, est prouvé ailleurs, sur le vrai code — `llm-proxy.test.ts`
 * (le corps sortant), `supervisor.test.ts` (le journal poussé), et ce fichier-ci
 * pour la substitution en profondeur.
 */

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

/** Ce qui doit être vrai, pour chaque moteur, sur le chemin qui mène au modèle. */
const CHECKS: Record<AgentEngine, Array<{ what: string; file: string; contains: string }>> = {
  loop: [
    {
      what: "le message rendu au modèle est substitué",
      file: "agent-loop.ts",
      contains: "toolMessageContent(result, images, params.redact)",
    },
    {
      what: "l'aperçu persisté dans l'event l'est aussi",
      file: "agent-loop.ts",
      contains: "previewResult(result, params.redact)",
    },
  ],
  opencode: [
    {
      what: "le corps sortant vers le fournisseur est substitué",
      file: "vm/llm-proxy.ts",
      contains: "if (opts.redact) body = opts.redact(body)",
    },
    {
      what: "le superviseur donne bien son registre au proxy",
      file: "vm/supervisor.ts",
      contains: "startLlmProxy({ job: j, redact: secrets.redact })",
    },
    {
      what: "le journal poussé en base est substitué",
      file: "vm/supervisor.ts",
      contains: "redactDeep(raw, secrets.redact)",
    },
    {
      what: "le fil d'events l'est en profondeur",
      file: "vm/supervisor.ts",
      contains: "return redactDeep(payload, secrets.redact)",
    },
  ],
};

describe("chaque moteur substitue les secrets avant le modèle", () => {
  it("aucun moteur déclaré n'est laissé sans garde", () => {
    // Le cœur du test : ajouter un moteur sans dire ce qui le protège échoue ICI,
    // avec le nom du moteur, plutôt que six mois plus tard dans un audit.
    for (const engine of AGENT_ENGINES) {
      expect(CHECKS[engine], `le moteur "${engine}" n'a aucune garde déclarée`).toBeTruthy();
      expect(CHECKS[engine].length).toBeGreaterThan(0);
    }
  });

  for (const engine of AGENT_ENGINES) {
    for (const check of CHECKS[engine] ?? []) {
      it(`${engine} — ${check.what}`, () => {
        expect(read(check.file)).toContain(check.contains);
      });
    }
  }
});

/**
 * MIN-328 — « EN PROFONDEUR » ÉTAIT UN COMMENTAIRE, PAS UN CODE.
 *
 * `redactPayload` annonçait une substitution en profondeur et ne traitait que le
 * premier niveau. Les payloads d'opencode sont imbriqués par construction
 * (`{ part: { state: { output } } }`, des tableaux de parts) : le secret passait,
 * et se persistait dans `agent_run_events`, relisible par tout membre du projet.
 */
describe("la substitution descend dans les payloads imbriqués", () => {
  const TOKEN = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
  const secrets = new SecretRedactor();
  secrets.add(TOKEN);

  it("substitue à trois niveaux, tableaux compris", () => {
    const out = redactDeep(
      {
        name: "bash",
        preview: `remote: ${TOKEN}`,
        state: {
          output: `url = https://x-access-token:${TOKEN}@github.com/org/repo.git`,
          parts: [{ text: `token ${TOKEN}` }, { text: "rien à cacher" }],
        },
      },
      secrets.redact,
    );
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(out)).toContain("[redacted]");
    // La FORME est intacte : le fil et le journal se relisent comme avant.
    expect(out).toMatchObject({
      name: "bash",
      state: { parts: [{ text: "token [redacted]" }, { text: "rien à cacher" }] },
    });
  });

  it("laisse passer ce qui n'est pas du texte", () => {
    const out = redactDeep({ n: 3, ok: true, nothing: null, when: undefined }, secrets.redact);
    expect(out).toEqual({ n: 3, ok: true, nothing: null, when: undefined });
  });
});
