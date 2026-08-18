import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { newTurnStreamState, translateEvent, type OpencodeEvent } from "./opencode-events";
import { decidePermission } from "./opencode-permissions";
import { describeSpawn, markChildPayload, SubagentRegistry } from "./supervisor";
import { subagentAgentName } from "./opencode-config";
import { subagentUsageSeq } from "../subagent-config";
import { cloudLayout } from "../harness-layout";

/**
 * MIN-286 batch 2, task 12 — THE DELEGATION, played on an actually captured turn.
 *
 * The fixture ([fixtures/opencode-delegation.ndjson](fixtures/opencode-delegation.ndjson))
 * is the stream `/event` from a real server `opencode-ai@1.18.16` during a round where
 * the model delegated: request for permission, birth of the daughter, her round
 * to ANOTHER model, her `session.idle`, then the end of the mother's turn. A
 * fake local provider scripted the calls — zero cost, and this is what allows
 * to replay this file without ever spending a model.
 *
 * What it keeps, and which no test on invented events would keep:
 *
 * - `permission.asked` carries the REQUESTED `subagent_type`, before opencode resolves it
 * - the only point from which to hold the concurrent cap;
 * - the daughter attachment → call of `task` only lives in the `metadata` from
 * of the tool, and the FIRST `running` does not carry it (`metadata: null`);
 * - a daughter's `session.idle` arrives in the middle of the mother's turn.
 */

const FIXTURE = join(__dirname, "fixtures", "opencode-delegation.ndjson");

function fixtureEvents(): OpencodeEvent[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OpencodeEvent);
}

/** The parent session: the first created in the flow. */
const PARENT = "ses_00956f6a1ffeop0VskYrTe4TmL";
const CHILD = "ses_00956f473ffdm7mJnLA7qau6mY";

/** The round replayed as the supervisor plays it, but without a server or network. */
function replay() {
  const state = newTurnStreamState();
  const table = new Map([
    ["explore", { name: "explore", mode: "explore" as const }],
    ["explore-cheap", { name: "explore-cheap", mode: "explore" as const, modelId: "cheap", label: "Cheap" }],
  ]);
  const registry = new SubagentRegistry(new Map([...table].map(([n, a]) => [n, a.mode])));
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const usage: Array<{ sessionId: string; model: string; costUsd: number }> = [];
  const verdicts: Array<{ permission: string; reply: string }> = [];
  let parentIdle = false;
  let runningAtAsk = -1;

  for (const raw of fixtureEvents()) {
    const out = translateEvent(raw, state);
    const child = !!out.sessionId && out.sessionId !== PARENT;
    if (out.child) registry.register(out.child);
    if (out.permission) {
      runningAtAsk = registry.running;
      const verdict = decidePermission(out.permission, cloudLayout().repoDir, {
        names: new Set(table.keys()),
        running: registry.running,
        maxParallel: 2,
      });
      verdicts.push({ permission: out.permission.permission, reply: verdict.reply });
    }
    for (const event of out.events) {
      let payload: Record<string, unknown> = { ...event.payload };
      if (payload.name === "spawn_agent") payload = describeSpawn(payload, table);
      const entry = child ? registry.entry(out.sessionId ?? "") : undefined;
      if (entry) payload = markChildPayload(payload, entry);
      emitted.push({ type: event.type, payload });
    }
    if (out.usage) {
      usage.push({
        sessionId: out.usage.sessionId,
        model: out.usage.model,
        costUsd: out.usage.costUsd,
      });
    }
    if (out.idle && child) registry.finish(out.sessionId ?? "");
    if (out.idle && !child) parentIdle = true;
  }
  return { emitted, usage, registry, verdicts, parentIdle, runningAtAsk };
}

describe("la demande de délégation", () => {
  it("porte le sous-agent demandé, et arrive AVANT que la fille existe", () => {
    const asks = fixtureEvents()
      .map((raw) => translateEvent(raw, newTurnStreamState()).permission)
      .filter(Boolean);
    expect(asks).toHaveLength(1);
    expect(asks[0]!.permission).toBe("task");
    expect(asks[0]!.subagentType).toBe("explore-cheap");
    // Nothing was happening yet: it is indeed the request which precedes birth.
    expect(replay().runningAtAsk).toBe(0);
  });

  it("est arbitrée par le superviseur, et le tour continue", () => {
    const { verdicts, parentIdle } = replay();
    expect(verdicts).toEqual([{ permission: "task", reply: "once" }]);
    expect(parentIdle).toBe(true);
  });
});

describe("le rattachement de la fille", () => {
  it("se lit sur la `metadata` du part de `task`, pas avant", () => {
    const state = newTurnStreamState();
    const children = fixtureEvents()
      .map((raw) => translateEvent(raw, state).child)
      .filter(Boolean);
    // The `pending` and the first `running` have nothing to say: measured,
    // `metadata: null` until the child is created.
    expect(children.length).toBeGreaterThan(0);
    expect(children[0]).toEqual({
      sessionId: CHILD,
      callId: "call_task_1",
      agent: "explore-cheap",
      model: "cheap",
    });
  });

  it("donne à la fille un nom court, et le libère à son `session.idle`", () => {
    const { registry } = replay();
    expect(registry.entry(CHILD)?.id).toBe("sub-1");
    expect(registry.entry(CHILD)?.mode).toBe("explore");
    // Space frees up: without that, the simultaneous ceiling would close for
    // the rest of the round on girls who have already reported.
    expect(registry.running).toBe(0);
  });
});

describe("ce que le fil raconte", () => {
  it("replie les gestes de la fille sous l'appel de `task` qui l'a lancée", () => {
    const { emitted } = replay();
    const childEvents = emitted.filter((e) => e.payload.subagent_id);
    for (const event of childEvents) {
      expect(event.payload.subagent_id).toBe("sub-1");
      expect(event.payload.parent_call_id).toBe("call_task_1");
      expect(event.payload.subagent_mode).toBe("explore");
    }
  });

  it("rend au `spawn_agent` le mode et le modèle, que le nom d'agent seul cachait", () => {
    // Thread shows `mode` and `model` since MIN-112; opencode does not know
    // that `explore-cheap`. Replaying a run should say the same thing about both
    // motors — this is the changeover criterion for lot 3.
    const spawn = replay().emitted.find(
      (e) => e.type === "tool_call" && e.payload.name === "spawn_agent",
    );
    expect(spawn?.payload.mode).toBe("explore");
    expect(spawn?.payload.model).toBe("Cheap");
    expect(spawn?.payload.task).toBe("look around");
  });

  it("préfixe les ids de tool-call d'une fille", () => {
    // Two models can render the same `call_1`, and the thread matches by id.
    const marked = markChildPayload(
      { id: "call_1", name: "read_file" },
      { id: "sub-2", callId: "call_task_9", mode: "implement" },
    );
    expect(marked.id).toBe("sub-2:call_1");
  });
});

describe("ce que la fille coûte", () => {
  it("facture son round à ELLE, sur SON modèle", () => {
    const { usage } = replay();
    const child = usage.filter((u) => u.sessionId === CHILD);
    expect(child).toHaveLength(1);
    // The girl's model is indeed the other: it's `agent.<id>.model` who has it
    // decided, since the tool `task` does not have a `model` field.
    expect(child[0].model).toBe("cheap");
    // And it is not free: a model declared without price would make `cost: 0`.
    expect(child[0].costUsd).toBeGreaterThan(0);
    expect(usage.some((u) => u.sessionId === PARENT && u.costUsd > 0)).toBe(true);
  });

  it("écrit dans la bande de `seq` des sous-agents, comme la boucle maison", () => {
    const registry = new SubagentRegistry(new Map());
    expect(subagentUsageSeq(registry.slotOf("ses_a"))).toBe(subagentUsageSeq(0));
    expect(subagentUsageSeq(registry.slotOf("ses_b"))).toBe(subagentUsageSeq(1));
    // A session that no `task` has attached still obtains its tape:
    // an expense that you don't know how to relate is better stored than lost.
    expect(registry.entry("ses_a")?.id).toBe("sub-1");
  });
});

describe("le nom d'un sous-agent", () => {
  it("est un slug sûr pour un patron de permission", () => {
    expect(subagentAgentName("explore", null)).toBe("explore");
    expect(subagentAgentName("implement", null)).toBe("general");
    expect(subagentAgentName("explore", "anthropic/claude-haiku-4.5")).toBe(
      "explore-anthropic-claude-haiku-4-5",
    );
    // Neither wildcard nor separator: the name serves as a pattern in `permission.task`.
    expect(subagentAgentName("implement", "x_y*z/w")).toMatch(/^[a-z0-9-]+$/);
  });
});
