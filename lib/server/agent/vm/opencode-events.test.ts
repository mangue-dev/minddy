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
 * MIN-286 batch 1 — translating the opencode stream to our feed.
 *
 * **The events in this file are not written by hand**: they have been
 * captured on a real server `opencode-ai@1.18.16`, during a full turn
 * with tool call (`fixtures/opencode-turn.ndjson`). This is what gives them
 * value to assertions: a test on invented events verifies that we know
 * read what we wrote, not that we know how to read what opencode sends.
 *
 * What they keep: **the thread tells the same thing** as with the house loop —
 * same types, same payloads, same order. This is the changeover criterion for lot 3,
 * and `agent_run_events` doesn't keep anything other than these payloads.
 */

const FIXTURE = join(__dirname, "fixtures", "opencode-turn.ndjson");

function fixtureEvents(): OpencodeEvent[] {
  return readFileSync(FIXTURE, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as OpencodeEvent);
}

/**
 * Opens a subtable of a fixture event, or returns `undefined` if the path
 * does not exist. The `properties` of a `OpencodeEvent` are deliberately wide
 * — it’s a third-party feed. Go this way rather than through a chained conversion
 * prevents a `?.` on the first link from leaving the second dereference `undefined`.
 */
function subRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Replays the captured trick and returns everything it produced. */
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
    // The generated tool is already called like ours: nothing to translate here, and
    // That's the point — the 32 domain tools have our names by construction.
    expect(events[0].payload).toEqual({ id: "call_1", name: "read_issue", issue: "MIN-286" });
    expect(events[1].payload.id).toBe("call_1");
    expect(events[1].payload.success).toBe(true);
    expect(String(events[1].payload.preview)).toContain("read_issue");
  });

  it("n'annonce PAS l'appel tant qu'on ne sait pas ce qu'il appelle", () => {
    // Measured: the first `message.part.updated` of a tool arrives at `pending`
    // with `input: {}`. Issuing it would show a call with no arguments, then nothing.
    const state = newTurnStreamState();
    const pending = fixtureEvents().find((e) => {
      if (e.type !== "message.part.updated") return false;
      const part = subRecord(e.properties?.part);
      return part?.type === "tool" && subRecord(part.state)?.status === "pending";
    });
    expect(pending, "la fixture doit porter un état `pending`").toBeTruthy();
    expect(translateEvent(pending!, state).events).toEqual([]);
  });

  it("compte le coût du round UNE fois, alors qu'il arrive deux fois", () => {
    const { usage } = replay();
    // Measured: `message.updated` is repeated identically once the round is over.
    // Without deduplication, each round would pay two ledger lines.
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
    // The first `message.updated` of an assistant round arrives at `cost: 0`, without
    // `finish`. Counting it would write a blank line, then a real one.
    const state = newTurnStreamState();
    const early = fixtureEvents().find((e) => {
      if (e.type !== "message.updated") return false;
      const info = subRecord(e.properties?.info);
      return info?.role === "assistant" && !info.finish;
    });
    expect(early, "la fixture doit porter un round non terminé").toBeTruthy();
    expect(translateEvent(early!, state).usage).toBeUndefined();
  });

  it("voit la fin du tour", () => {
    expect(replay().idle).toBe(true);
  });

  it("n'émet RIEN pour le bruit de session", () => {
    // `session.status`, `session.updated`, `session.diff`: the wire does not have
    // equivalent, and inventing one would fill `agent_run_events`.
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
    // The trap, and it is not seen in any translation test taken alone:
    // `message.updated` (end of round) arrives BEFORE `session.idle`. The text of
    // direct is emptied there - so if the answer was read in the same bag, a
    // every other turn would return an empty response, and the commit message would
    // would fall back on its generic form without anything indicating it.
    const { state } = replay();
    const session = "ses_00999fb08ffe1CH0pZOeoJnbos";
    expect(liveTextOf(state, session)).toBe("");
    expect(replyOf(state, session)).toBeTruthy();
  });
});

/**
 * MIN-286 — WHAT THE MODEL WRITES BETWEEN TWO SETS OF TOOLS.
 *
 * The live showed it then erased it: nothing persisted, so on the screen the
 * agent text appeared for a few seconds then disappeared forever
 * (observed on the run of 2026-08-12 — 148 events, not a text bubble).
 * This is the rule of the house loop, taken literally: narration in `thinking`
 * when the round CONTINUES, response in `summary` when it stops.
 */
describe("la narration entre deux rounds", () => {
  function roundEnd(finish: string, id: string): OpencodeEvent {
    return {
      type: "message.updated",
      properties: {
        sessionID: "ses_1",
        info: { id, role: "assistant", finish, modelID: "m", cost: 0, tokens: {} },
      },
    };
  }

  function wrote(text: string, partId: string): OpencodeEvent {
    return {
      type: "message.part.delta",
      properties: { sessionID: "ses_1", messageID: "msg_a", partID: partId, field: "text", delta: text },
    };
  }

  it("dit au fil le texte d'un round qui appelle des tools", () => {
    const state = newTurnStreamState();
    translateEvent(wrote("je regarde les deux fichiers", "prt_1"), state);
    const out = translateEvent(roundEnd("tool-calls", "msg_1"), state);
    expect(out.events).toEqual([
      { type: "thinking", payload: { text: "je regarde les deux fichiers" } },
    ]);
  });

  it("ne dit RIEN du texte d'un round qui s'arrête : c'est la réponse du tour", () => {
    // It starts in `summary` (8,000 characters); repeat it here in `thinking`
    // (2,000) would make two bubbles as soon as it is long — the thread duplicates by
    // text equality, and two different ceilings are no longer equal.
    const state = newTurnStreamState();
    translateEvent(wrote("voilà, c'est fait", "prt_2"), state);
    const out = translateEvent(roundEnd("stop", "msg_2"), state);
    expect(out.events).toEqual([]);
    expect(replyOf(state, "ses_1")).toBe("voilà, c'est fait");
  });

  it("ne parle pas d'un round muet", () => {
    const state = newTurnStreamState();
    expect(translateEvent(roundEnd("tool-calls", "msg_3"), state).events).toEqual([]);
  });

  /**
   * MIN-286 — THE RULE IS ON `tool-calls`, NOT “≠ stop”.
   *
   * `tool-calls` is the ONLY end that lets the session work; all
   * others put it to rest, so end the round. Tested by negation, a
   * round terminal ended on `length` (full window) or `error` started TWO
   * times: in `thinking` at 2,000 characters, then in `summary` at 8,000 — and the
   * deduplication of the thread is done by equality of text, only two caps
   * different never give back.
   */
  it("se tait sur toute fin qui TERMINE le tour, pas seulement `stop`", () => {
    for (const finish of ["length", "content-filter", "error", "other"]) {
      const state = newTurnStreamState();
      translateEvent(wrote("réponse coupée net", `prt_${finish}`), state);
      const out = translateEvent(roundEnd(finish, `msg_${finish}`), state);
      expect(out.events).toEqual([]);
      // …and the text remains the response of the round, which will start at `summary`.
      expect(replyOf(state, "ses_1")).toBe("réponse coupée net");
    }
  });
});

describe("la mère et ses filles, sur le même flux", () => {
  it("dit de quelle session vient chaque événement", () => {
    const { usage } = replay();
    expect(usage.every((u) => u.sessionId === "ses_00999fb08ffe1CH0pZOeoJnbos")).toBe(true);
  });

  it("ne mélange pas les textes de deux sessions", () => {
    // A daughter writes her report while the mother waits: only one bag
    // would enter in the response of the round, therefore in the commit message.
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
    // What we never had keeps its name: the thread has nothing of its own
    // oppose, and a bad name would be worth less than an additional name.
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
    // Our domain tools do not go through any tables: these are our names.
    expect(ourToolArgs("read_issue", { issue: "MIN-1" })).toEqual({ issue: "MIN-1" });
  });

  it("produit le MÊME payload que la boucle maison pour un `read_file`", () => {
    // It is the assertion which holds the switching criterion: the thread, which displays
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

  /**
   * MIN-286 — `webfetch` DOES NOT HAVE A HOUSE OPPOSITE, so no summary: it
   * fell in the `default` of `toolArgSummary`, and the event started at `{}`.
   * The URL that the model went to read was neither reaching the wire nor
   * `agent_run_events` — un tour entier de lecture web illisible au replay.
   */
  it("porte l'URL d'un `webfetch`, qui arrive sous le nom d'opencode", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "webfetch",
            callID: "call_web",
            state: {
              status: "running",
              input: { url: "https://example.com/doc", format: "markdown" },
            },
          },
        },
      },
      state,
    );
    expect(out.events).toEqual([
      {
        type: "tool_call",
        payload: {
          id: "call_web",
          name: "webfetch",
          url: "https://example.com/doc",
          format: "markdown",
        },
      },
    ]);
  });

  /**
   * “Patch of 0 files”, read on each edition of a run `gpt-*`: opencode
   * names `patchText` what `toolArgSummary` reads under `patch`, and the summary
   * therefore left at `{count: 0, paths: []}` — on the ONLY editing path of these
   * models.
   */
  it("compte les fichiers d'un `apply_patch`, dont opencode nomme l'entrée `patchText`", () => {
    const state = newTurnStreamState();
    const patchText = [
      "*** Begin Patch",
      "*** Update File: lib/a.ts",
      "@@",
      "-const a = 1;",
      "+const a = 2;",
      "*** Add File: lib/b.ts",
      "+export const b = 3;",
      "*** Delete File: lib/c.ts",
      "*** End Patch",
    ].join("\n");
    const out = translateEvent(
      {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "apply_patch",
            callID: "call_11",
            state: { status: "running", input: { patchText } },
          },
        },
      },
      state,
    );
    expect(out.events).toEqual([
      {
        type: "tool_call",
        payload: {
          id: "call_11",
          name: "apply_patch",
          count: 3,
          paths: ["lib/a.ts", "lib/b.ts", "lib/c.ts"],
        },
      },
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
  /** A completed `bash`, such that opencode returns its part. */
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
    // This is what `run_command` read at home, and what silences the door
    // of delivery when the model launched the tests itself.
    expect(bashDone({ exit: 0 }).shell).toEqual({ command: "npx vitest run", exit: 0 });
    expect(bashDone({ exit: 1 }).shell).toEqual({ command: "npx vitest run", exit: 1 });
  });

  it("ne conclut RIEN quand le code de sortie manque", () => {
    // Opencode places `null` on a command abandoned or killed by the timeout.
    // An unknown code is not a zero: taking it as such would silence the
    // harness on a ride that no one has checked.
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
    // The flow comes from a third party whose release cadence we adopt. A shape
    // that we don't know should be ignored, not kill a two-hour tour.
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
    // Measured: all `abort` publishes `session.error` `MessageAbortedError`. But we
    // let's cut it ourselves in three necessary cases (expenditure ceiling, question to
    // the user, deadline) — without this filter, everyone wrote an event `error`
    // on the thread and a `errorMessage: "Aborted"` over the real pattern.
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
    // …but she SAYS herself, so that the supervisor can distinguish the cut
    // that he asked for from what he suffered: without this flag, a round decided
    // en vol disparaissait sans laisser un event.
    expect(out.aborted).toBe(true);
  });

  it("ferme le sac de texte d'un round coupé, comme une fin de round", () => {
    /**
     * MIN-286 — the text of an aborted round was glued together in front of the next one.
     *
     * The bag was only emptied at the end of a CHARGED round (`message.updated` with
     * `finish`), and a cut round does not have one. On a steering — `abort`, then
     * new prompt on the SAME session — the fragment written before the break
     * therefore left at the head of the live, the response of the round, the `summary` and the
     * message de commit.
     */
    const state = newTurnStreamState();
    const wrote = (text: string, partId: string): OpencodeEvent => ({
      type: "message.part.delta",
      properties: { sessionID: "ses_1", messageID: "msg_a", partID: partId, field: "text", delta: text },
    });
    translateEvent(wrote("Je commence par corriger le parseur, ensu", "prt_1"), state);
    translateEvent(
      {
        type: "session.error",
        properties: { sessionID: "ses_1", error: { name: "MessageAbortedError" } },
      },
      state,
    );
    // The next round starts with an empty bag…
    translateEvent(wrote("C'est fait : le test passe.", "prt_2"), state);
    expect(liveTextOf(state, "ses_1")).toBe("C'est fait : le test passe.");
    expect(replyOf(state, "ses_1")).toBe("C'est fait : le test passe.");
  });

  it("garde le texte coupé quand la coupure TERMINE le tour", () => {
    // “Stop”, ceiling, deadline: there is no round behind, and this fragment
    // is still the most recent thing the agent said.
    const state = newTurnStreamState();
    translateEvent(
      {
        type: "message.part.delta",
        properties: { sessionID: "ses_1", messageID: "msg_a", partID: "prt_1", field: "text", delta: "j'ai commencé par" },
      },
      state,
    );
    translateEvent(
      {
        type: "session.error",
        properties: { sessionID: "ses_1", error: { name: "MessageAbortedError" } },
      },
      state,
    );
    expect(replyOf(state, "ses_1")).toBe("j'ai commencé par");
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
    // Nothing on the thread: a refusal is reported in the `tool_result` of the rejected tool.
    expect(out.events).toEqual([]);
  });

  /**
   * MIN-360 — THE PATH OF A READING IS NOT WHERE YOU THINK IT IS.
   *
   * Noted in binary 1.18.16: `ReadTool` calls
   * `ask({permission: "read", patterns: [<relatif au worktree>], always: ["*"],
   * metadata: {}})`. Le `metadata` is **empty**. This test is what prevents the
   * verdict de lecture du chemin local de refuser 100 % des lectures en croyant
   * keep the `.env`.
   */
  it("rend le chemin d'une LECTURE, qu'opencode met dans `patterns`", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_3",
          sessionID: "ses_1",
          permission: "read",
          patterns: [".env.local"],
          always: ["*"],
          metadata: {},
          tool: { messageID: "msg_1", callID: "call_3" },
        },
      },
      state,
    );
    expect(out.permission?.filepath).toBe(".env.local");
  });

  it("retrouve la RACINE d'une lecture dans le part du tool quand son pattern est vide", () => {
    const state = newTurnStreamState();
    translateEvent(
      {
        type: "message.part.updated",
        properties: {
          sessionID: "ses_1",
          part: {
            type: "tool",
            tool: "read",
            callID: "call_root",
            state: {
              status: "running",
              input: { filePath: "/Users/dev/project", offset: 0, limit: 200 },
            },
          },
        },
      },
      state,
    );
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_root",
          sessionID: "ses_1",
          permission: "read",
          patterns: [""],
          metadata: {},
          tool: { messageID: "msg_1", callID: "call_root" },
        },
      },
      state,
    );
    expect(out.permission?.filepath).toBe("/Users/dev/project");
  });

  it("ne prend pas le joker d'un `always` pour un chemin", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_4",
          sessionID: "ses_1",
          permission: "read",
          patterns: ["*"],
          metadata: {},
          tool: { messageID: "msg_1", callID: "call_4" },
        },
      },
      state,
    );
    // Without a legible path, the verdict refuses — and that is the right outcome.
    expect(out.permission?.filepath).toBeUndefined();
  });

  it("rend l'URL d'un `webfetch`, et elle seule", () => {
    const state = newTurnStreamState();
    const fetch = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_5",
          sessionID: "ses_1",
          permission: "webfetch",
          patterns: ["http://127.0.0.1:4096/x"],
          metadata: { url: "http://127.0.0.1:4096/x", format: "markdown" },
          tool: { messageID: "msg_1", callID: "call_5" },
        },
      },
      state,
    );
    expect(fetch.permission?.url).toBe("http://127.0.0.1:4096/x");
    // On a `bash`, `patterns` carries the COMMAND: copy it into “url”
    // serait un champ qui ment.
    const bash = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_6",
          sessionID: "ses_1",
          permission: "bash",
          patterns: ["curl http://x"],
          metadata: { command: "curl http://x" },
          tool: { messageID: "msg_1", callID: "call_6" },
        },
      },
      state,
    );
    expect(bash.permission?.url).toBeUndefined();
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

  /**
   * `apply_patch` only requests ONCE for N files, and its `filepath` is
   * the list glued to the comma. `metadata.files` is the only place where
   * paths are read one by one — without it, the “changed files” view displayed
   * “a.ts, b.ts, c.ts” on one line.
   */
  it("lit les fichiers d'un patch un par un, avec la nature du geste", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_3",
          sessionID: "ses_1",
          permission: "edit",
          patterns: ["lib/a.ts", "lib/b.ts"],
          metadata: {
            filepath: "/vercel/sandbox/repo/lib/a.ts, /vercel/sandbox/repo/lib/b.ts",
            diff: "…",
            files: [
              { type: "update", filePath: "/vercel/sandbox/repo/lib/a.ts", relativePath: "lib/a.ts" },
              { type: "add", filePath: "/vercel/sandbox/repo/lib/b.ts", relativePath: "lib/b.ts" },
              { type: "delete", filePath: "/vercel/sandbox/repo/lib/c.ts", relativePath: "lib/c.ts" },
            ],
          },
          tool: { messageID: "msg_1", callID: "call_9" },
        },
      },
      state,
    );
    expect(out.permission?.files).toEqual([
      { path: "/vercel/sandbox/repo/lib/a.ts", status: "modified" },
      { path: "/vercel/sandbox/repo/lib/b.ts", status: "added" },
      { path: "/vercel/sandbox/repo/lib/c.ts", status: "deleted" },
    ]);
  });

  it("ne pose `files` que quand opencode en publie", () => {
    const state = newTurnStreamState();
    const out = translateEvent(
      {
        type: "permission.asked",
        properties: {
          id: "per_4",
          sessionID: "ses_1",
          permission: "edit",
          metadata: { filepath: "/vercel/sandbox/repo/lib/a.ts" },
          tool: { messageID: "msg_1", callID: "call_10" },
        },
      },
      state,
    );
    expect(out.permission).not.toHaveProperty("files");
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
    // The SAME event as the home loop: `id` is the call to tool, and the
    // questions are normalized by the shared parser — this is what allows
    // the question card from the feed to know nothing about the engine.
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
 * MIN-286 — REFLECTION, AND WHY IT CANNOT BE GUESSED FROM A DELTA.
 *
 * Fixture ([fixtures/opencode-reasoning.ndjson](fixtures/opencode-reasoning.ndjson))
 * captured on 2026-08-12 on a real `opencode-ai@1.18.16` in the microVM, a
 * fake local provider scripting the response (deltas `reasoning` then
 * text deltas) — zero cost, authentic flow.
 *
 * WHAT IT SHOWS, and this is the fault that it closes: **the deltas on one side of
 * reflection carry `field: "text"`, exactly like those in the answer**. Nothing
 * in the frame they cannot be distinguished; only the opening of the part says it. As long as we don't
 * didn't read it, the chain of thought entered the text of the round - so in this
 * which the thread displays as the agent's speech, and in the commit message.
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
    // The live broadcast only shows the response: not a fragment of “I’m watching…”.
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
    // The duration comes from opencode timestamps: the module remains without a clock.
    expect(thinking[0].payload.durationMs).toBe(11);
  });

  it("n'avale pas NOTRE prompt en le prenant pour la réponse", () => {
    // The session republishes the posted message (`dis bonjour`) in the same form
    // as a text of the model. He came out on top in the answer of the round — so
    // of the commit message — until we remember the role of the messages.
    const { state } = replayReasoning();
    expect(replyOf(state, SESSION).startsWith("dis bonjour")).toBe(false);
  });

  it("ne dit `thinking` qu'une fois, alors que le part est publié deux fois", () => {
    const { events } = replayReasoning();
    expect(events.map((e) => e.type)).toEqual(["thinking"]);
  });
});
