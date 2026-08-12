import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  liveTextOf,
  newTurnStreamState,
  ourToolArgs,
  ourToolName,
  replyOf,
  translateEvent,
  type OpencodeEvent,
  type RoundUsage,
  type TranslatedEvent,
} from "./opencode-events";

/**
 * MIN-286 lot 1 — la traduction du flux d'opencode vers notre fil.
 *
 * **Les événements de ce fichier ne sont pas écrits à la main** : ils ont été
 * capturés sur un vrai serveur `opencode-ai@1.18.16`, pendant un tour complet
 * avec appel de tool (`fixtures/opencode-turn.ndjson`). C'est ce qui donne leur
 * valeur aux assertions : un test sur des événements inventés vérifie qu'on sait
 * lire ce qu'on a écrit, pas qu'on sait lire ce qu'opencode envoie.
 *
 * Ce qu'ils gardent : **le fil raconte la même chose** qu'avec la boucle maison —
 * mêmes types, mêmes payloads, même ordre. C'est le critère de bascule du lot 3,
 * et `agent_run_events` ne garde rien d'autre que ces payloads.
 */

const FIXTURE = join(__dirname, "fixtures", "opencode-turn.ndjson");

function fixtureEvents(): OpencodeEvent[] {
  return readFileSync(FIXTURE, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as OpencodeEvent);
}

/** Rejoue le tour capturé et rend tout ce qu'il a produit. */
function replay() {
  const state = newTurnStreamState();
  const events: TranslatedEvent[] = [];
  const usage: RoundUsage[] = [];
  const live: string[] = [];
  let idle = false;
  for (const raw of fixtureEvents()) {
    const out = translateEvent(raw, state);
    events.push(...out.events);
    if (out.usage) usage.push(out.usage);
    if (out.liveText !== undefined) live.push(out.liveText);
    if (out.idle) idle = true;
  }
  return { events, usage, live, idle, state };
}

describe("un vrai tour capturé", () => {
  it("rend l'appel de tool, puis son résultat, dans cet ordre", () => {
    const { events } = replay();
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    // Le tool généré s'appelle déjà comme le nôtre : rien à traduire ici, et
    // c'est le point — les 32 tools de domaine portent nos noms par construction.
    expect(events[0].payload).toEqual({ id: "call_1", name: "read_issue", issue: "MIN-286" });
    expect(events[1].payload.id).toBe("call_1");
    expect(events[1].payload.success).toBe(true);
    expect(String(events[1].payload.preview)).toContain("read_issue");
  });

  it("n'annonce PAS l'appel tant qu'on ne sait pas ce qu'il appelle", () => {
    // Mesuré : le premier `message.part.updated` d'un tool arrive en `pending`
    // avec `input: {}`. L'émettre afficherait un appel sans argument, puis rien.
    const state = newTurnStreamState();
    const pending = fixtureEvents().find(
      (e) =>
        e.type === "message.part.updated" &&
        (e.properties?.part as Record<string, unknown> | undefined)?.type === "tool" &&
        ((e.properties?.part as Record<string, unknown>).state as Record<string, unknown>)
          ?.status === "pending",
    );
    expect(pending, "la fixture doit porter un état `pending`").toBeTruthy();
    expect(translateEvent(pending!, state).events).toEqual([]);
  });

  it("compte le coût du round UNE fois, alors qu'il arrive deux fois", () => {
    const { usage } = replay();
    // Mesuré : `message.updated` se répète à l'identique une fois le round fini.
    // Sans déduplication, chaque round paierait deux lignes de ledger.
    const finished = usage.filter((u) => u.finish);
    expect(finished.length).toBe(usage.length);
    const ids = new Set(usage.map((u) => u.messageId));
    expect(ids.size).toBe(usage.length);
    expect(usage.some((u) => u.costUsd > 0)).toBe(true);
    for (const u of usage) {
      expect(u.inputTokens).toBeGreaterThan(0);
      expect(u.model).toBeTruthy();
    }
  });

  it("ne compte pas un round qui n'a pas fini", () => {
    // Le premier `message.updated` d'un round assistant arrive à `cost: 0`, sans
    // `finish`. Le compter écrirait une ligne vide, puis une vraie.
    const state = newTurnStreamState();
    const early = fixtureEvents().find(
      (e) =>
        e.type === "message.updated" &&
        (e.properties?.info as Record<string, unknown> | undefined)?.role === "assistant" &&
        !(e.properties?.info as Record<string, unknown>).finish,
    );
    expect(early, "la fixture doit porter un round non terminé").toBeTruthy();
    expect(translateEvent(early!, state).usage).toBeUndefined();
  });

  it("voit la fin du tour", () => {
    expect(replay().idle).toBe(true);
  });

  it("n'émet RIEN pour le bruit de session", () => {
    // `session.status`, `session.updated`, `session.diff` : le fil n'a pas
    // d'équivalent, et en inventer un remplirait `agent_run_events`.
    const state = newTurnStreamState();
    for (const raw of fixtureEvents()) {
      if (!raw.type.startsWith("session.") || raw.type === "session.idle") continue;
      expect(translateEvent(raw, state).events, raw.type).toEqual([]);
    }
  });

  it("accumule le texte du round en direct", () => {
    const { live } = replay();
    expect(live.length).toBeGreaterThan(0);
    expect(live.at(-1)).toBeTruthy();
  });

  it("garde ce que le tour a répondu, alors que la fin de round vide le direct", () => {
    // Le piège, et il ne se voit dans aucun test de traduction pris seul :
    // `message.updated` (fin de round) arrive AVANT `session.idle`. Le texte du
    // direct est vidé là — donc si la réponse se lisait dans le même sac, un
    // tour sur deux rendrait une réponse vide, et le message de commit se
    // rabattrait sur sa forme générique sans que rien ne le signale.
    const { state } = replay();
    const session = "ses_00999fb08ffe1CH0pZOeoJnbos";
    expect(liveTextOf(state, session)).toBe("");
    expect(replyOf(state, session)).toBeTruthy();
  });
});

describe("la mère et ses filles, sur le même flux", () => {
  it("dit de quelle session vient chaque événement", () => {
    const { usage } = replay();
    expect(usage.every((u) => u.sessionId === "ses_00999fb08ffe1CH0pZOeoJnbos")).toBe(true);
  });

  it("ne mélange pas les textes de deux sessions", () => {
    // Une fille écrit son rapport pendant que la mère attend : un seul sac le
    // ferait entrer dans la réponse du tour, donc dans le message de commit.
    const state = newTurnStreamState();
    const text = (sessionID: string, id: string, value: string): OpencodeEvent => ({
      type: "message.part.updated",
      properties: { sessionID, part: { type: "text", id, text: value } },
    });
    translateEvent(text("ses_mere", "p1", "réponse de la mère"), state);
    translateEvent(text("ses_fille", "p2", "rapport de la fille"), state);
    expect(liveTextOf(state, "ses_mere")).toBe("réponse de la mère");
    expect(liveTextOf(state, "ses_fille")).toBe("rapport de la fille");
  });

  it("attache l'`idle` à SA session", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      { type: "session.idle", properties: { sessionID: "ses_fille" } },
      state,
    );
    expect(out.idle).toBe(true);
    expect(out.sessionId).toBe("ses_fille");
  });
});

describe("le vocabulaire d'opencode, traduit vers le nôtre", () => {
  it("renomme les tools intégrés", () => {
    expect(ourToolName("read")).toBe("read_file");
    expect(ourToolName("bash")).toBe("run_command");
    expect(ourToolName("task")).toBe("spawn_agent");
    // Ce que nous n'avons jamais eu garde son nom : le fil n'a rien à lui
    // opposer, et un mauvais nom vaudrait moins qu'un nom de plus.
    expect(ourToolName("webfetch")).toBe("webfetch");
  });

  it("renomme les arguments, pour que le fil sache encore les lire", () => {
    expect(ourToolArgs("read", { filePath: "/repo/a.ts", limit: 10 })).toEqual({
      path: "/repo/a.ts",
      limit: 10,
    });
    expect(ourToolArgs("grep", { pattern: "x", include: "*.ts" })).toEqual({
      pattern: "x",
      glob: "*.ts",
    });
    // Nos tools de domaine ne passent par aucune table : ce sont nos noms.
    expect(ourToolArgs("read_issue", { issue: "MIN-1" })).toEqual({ issue: "MIN-1" });
  });

  it("produit le MÊME payload que la boucle maison pour un `read_file`", () => {
    // C'est l'assertion qui tient le critère de bascule : le fil, qui affiche
    // `payload.path`, doit trouver `path` — pas `filePath`.
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "read",
            callID: "call_9",
            state: { status: "running", input: { filePath: "/repo/lib/a.ts", offset: 10 } },
          },
        },
      },
      state,
    );
    expect(out.events).toEqual([
      { type: "tool_call", payload: { id: "call_9", name: "read_file", path: "/repo/lib/a.ts" } },
    ]);
  });

  it("rend un échec de tool comme un échec", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "bash",
            callID: "call_3",
            state: { status: "error", error: "command failed: exit 1", input: { command: "ls" } },
          },
        },
      },
      state,
    );
    expect(out.events[0].payload).toMatchObject({
      id: "call_3",
      name: "run_command",
      success: false,
      preview: "command failed: exit 1",
    });
  });
});

describe("le code de sortie d'une commande (MIN-262)", () => {
  /** Un `bash` terminé, tel qu'opencode rend son part. */
  function bashDone(metadata: Record<string, unknown>, command = "npx vitest run") {
    return translateEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "bash",
            callID: "call_7",
            state: { status: "completed", output: "ok", input: { command }, metadata },
          },
        },
      },
      newTurnStreamState(),
    );
  }

  it("rend la commande et son code de sortie", () => {
    // C'est ce que lisait `run_command` chez nous, et ce qui fait taire la porte
    // de livraison quand le modèle a lancé les tests lui-même.
    expect(bashDone({ exit: 0 }).shell).toEqual({ command: "npx vitest run", exit: 0 });
    expect(bashDone({ exit: 1 }).shell).toEqual({ command: "npx vitest run", exit: 1 });
  });

  it("ne conclut RIEN quand le code de sortie manque", () => {
    // Opencode y pose `null` sur une commande abandonnée ou tuée par le timeout.
    // Un code inconnu n'est pas un zéro : le prendre pour tel ferait taire le
    // harness sur un tour que personne n'a vérifié.
    expect(bashDone({ exit: null }).shell).toBeUndefined();
    expect(bashDone({}).shell).toBeUndefined();
  });

  it("ne parle que pour le shell", () => {
    const out = translateEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "read",
            callID: "call_8",
            state: { status: "completed", output: "x", input: { filePath: "/a" }, metadata: { exit: 0 } },
          },
        },
      },
      newTurnStreamState(),
    );
    expect(out.shell).toBeUndefined();
  });
});

describe("ce qui ne doit jamais casser un tour", () => {
  it("avale une forme inattendue sans lever", () => {
    // Le flux vient d'un tiers dont on adopte la cadence de release. Une forme
    // qu'on ne connaît pas doit être ignorée, pas tuer un tour de deux heures.
    const state = newTurnStreamState();
    for (const raw of [
      { type: "message.part.updated" },
      { type: "message.part.updated", properties: { part: { type: "tool" } } },
      { type: "message.updated", properties: {} },
      { type: "quelque.chose.de.neuf", properties: { x: 1 } },
      { type: "message.part.delta", properties: { field: "reasoning", delta: "…" } },
    ] as OpencodeEvent[]) {
      expect(() => translateEvent(raw, state)).not.toThrow();
    }
  });

  it("dit l'erreur de session avec son message", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      { type: "session.error", properties: { error: { message: "provider is down" } } },
      state,
    );
    expect(out.error).toBe("provider is down");
    expect(out.events).toEqual([{ type: "error", payload: { message: "provider is down" } }]);
  });

  it("ne prend PAS une coupure voulue pour une panne", () => {
    // Mesuré : tout `abort` publie `session.error` `MessageAbortedError`. Or nous
    // coupons nous-mêmes dans trois cas voulus (plafond de dépense, question à
    // l'utilisateur, deadline) — sans ce filtre, chacun écrivait un event `error`
    // au fil et un `errorMessage: "Aborted"` par-dessus le vrai motif.
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "session.error",
        properties: { sessionID: "ses_1", error: { name: "MessageAbortedError", data: { message: "Aborted" } } },
      },
      state,
    );
    expect(out.error).toBeUndefined();
    expect(out.events).toEqual([]);
  });
});

describe("les garde-fous et les questions", () => {
  it("rend la demande de permission d'un `bash` telle que le garde-fou l'attend", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_1",
          sessionID: "ses_1",
          permission: "bash",
          patterns: ["git reset --hard"],
          metadata: { command: "git reset --hard" },
          always: ["git reset *"],
          tool: { messageID: "msg_1", callID: "call_1" },
        },
      },
      state,
    );
    expect(out.permission).toEqual({
      id: "per_1",
      sessionId: "ses_1",
      permission: "bash",
      callId: "call_1",
      command: "git reset --hard",
    });
    // Rien au fil : un refus se raconte dans le `tool_result` du tool refusé.
    expect(out.events).toEqual([]);
  });

  it("rend le chemin ABSOLU d'une écriture", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_2",
          sessionID: "ses_1",
          permission: "edit",
          patterns: [".git/config"],
          metadata: { filepath: "/vercel/sandbox/repo/.git/config", diff: "…" },
          tool: { messageID: "msg_1", callID: "call_2" },
        },
      },
      state,
    );
    expect(out.permission).toMatchObject({
      permission: "edit",
      filepath: "/vercel/sandbox/repo/.git/config",
      callId: "call_2",
    });
  });

  it("traduit `question.asked` en NOTRE event `question`", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "question.asked",
        properties: {
          id: "que_1",
          sessionID: "ses_1",
          questions: [
            {
              question: "Quelle approche pour le cache ?",
              header: "Cache",
              multiple: true,
              options: [
                { label: "Redis (Recommended)", description: "Rapide." },
                { label: "En mémoire", description: "Zéro dépendance." },
              ],
            },
          ],
          tool: { messageID: "msg_1", callID: "call_7" },
        },
      },
      state,
    );
    // Le MÊME event que la boucle maison : `id` est l'appel de tool, et les
    // questions sont normalisées par le parseur partagé — c'est ce qui permet à
    // la carte de questions du feed de ne rien savoir du moteur.
    expect(out.events).toEqual([
      {
        type: "question",
        payload: {
          id: "call_7",
          questions: [
            {
              question: "Quelle approche pour le cache ?",
              header: "Cache",
              // `multiple` chez opencode, `multi_select` chez nous.
              multiSelect: true,
              options: [
                { label: "Redis", description: "Rapide.", recommended: true },
                { label: "En mémoire", description: "Zéro dépendance.", recommended: false },
              ],
            },
          ],
        },
      },
    ]);
    expect(out.question?.id).toBe("que_1");
  });

  it("ignore une question vide plutôt que d'arrêter le tour pour rien", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      { type: "question.asked", properties: { id: "que_2", sessionID: "ses_1", questions: [] } },
      state,
    );
    expect(out.events).toEqual([]);
    expect(out.question).toBeUndefined();
  });
});

/**
 * MIN-286 — LA RÉFLEXION, ET POURQUOI ELLE NE PEUT PAS SE DEVINER D'UN DELTA.
 *
 * Fixture ([fixtures/opencode-reasoning.ndjson](fixtures/opencode-reasoning.ndjson))
 * capturée le 2026-08-12 sur un vrai `opencode-ai@1.18.16` dans la microVM, un
 * faux fournisseur local scriptant la réponse (des deltas `reasoning` puis des
 * deltas de texte) — coût nul, flux authentique.
 *
 * CE QU'ELLE MONTRE, et c'est le défaut qu'elle ferme : **les deltas d'un part de
 * réflexion portent `field: "text"`, exactement comme ceux de la réponse**. Rien
 * dans la frame ne les distingue ; seule l'ouverture du part le dit. Tant qu'on ne
 * la lisait pas, la chaîne de pensée entrait dans le texte du round — donc dans ce
 * que le fil affiche comme la parole de l'agent, et dans le message de commit.
 */
describe("la réflexion du modèle (MIN-122, sous opencode)", () => {
  const REASONING_FIXTURE = join(__dirname, "fixtures", "opencode-reasoning.ndjson");
  const SESSION = "ses_008ba49dfffe9FbZVRqW6nMKtw";

  function replayReasoning() {
    const state = newTurnStreamState();
    const events: TranslatedEvent[] = [];
    const reasoning: Array<{ active: boolean; startedAt: number }> = [];
    const live: string[] = [];
    for (const line of readFileSync(REASONING_FIXTURE, "utf8").split("\n").filter(Boolean)) {
      const out = translateEvent(JSON.parse(line) as OpencodeEvent, state);
      events.push(...out.events);
      if (out.reasoning) reasoning.push(out.reasoning);
      if (out.liveText !== undefined) live.push(out.liveText);
    }
    return { state, events, reasoning, live };
  }

  it("garde la chaîne de pensée HORS de la réponse du tour", () => {
    const { state, live } = replayReasoning();
    expect(replyOf(state, SESSION)).toBe("Salut, voici la réponse.");
    // Le direct ne montre que la réponse : pas un fragment de « Je regarde… ».
    expect(live.some((text) => text.includes("Je regarde"))).toBe(false);
  });

  it("dit que ça pense, puis que ça ne pense plus", () => {
    const { reasoning } = replayReasoning();
    expect(reasoning.length).toBeGreaterThan(1);
    expect(reasoning[0].active).toBe(true);
    expect(reasoning[0].startedAt).toBeGreaterThan(0);
    expect(reasoning.at(-1)?.active).toBe(false);
  });

  it("rend la trace repliée sous le MÊME event que la boucle maison", () => {
    const { events } = replayReasoning();
    const thinking = events.filter((e) => e.type === "thinking");
    expect(thinking).toHaveLength(1);
    expect(thinking[0].payload).toMatchObject({
      kind: "reasoning",
      text: "Je regarde ce qu'il demande.",
    });
    // La durée vient des horodatages d'opencode : le module reste sans horloge.
    expect(thinking[0].payload.durationMs).toBe(11);
  });

  it("n'avale pas NOTRE prompt en le prenant pour la réponse", () => {
    // La session republie le message posté (`dis bonjour`) sous la même forme
    // qu'un texte du modèle. Il ressortait en tête de la réponse du tour — donc
    // du message de commit — jusqu'à ce qu'on retienne le rôle des messages.
    const { state } = replayReasoning();
    expect(replyOf(state, SESSION).startsWith("dis bonjour")).toBe(false);
  });

  it("ne dit `thinking` qu'une fois, alors que le part est publié deux fois", () => {
    const { events } = replayReasoning();
    expect(events.map((e) => e.type)).toEqual(["thinking"]);
  });
});
