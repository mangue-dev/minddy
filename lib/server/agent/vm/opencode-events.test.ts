import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  newTurnStreamState,
  ourToolArgs,
  ourToolName,
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
});
