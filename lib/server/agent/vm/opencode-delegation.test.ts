import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { newTurnStreamState, translateEvent, type OpencodeEvent } from "./opencode-events";
import { decidePermission } from "./opencode-permissions";
import { describeSpawn, markChildPayload, SubagentRegistry } from "./supervisor";
import { subagentAgentName } from "./opencode-config";
import { subagentUsageSeq } from "../subagent";

/**
 * MIN-286 lot 2, tâche 12 — LA DÉLÉGATION, jouée sur un tour réellement capturé.
 *
 * La fixture ([fixtures/opencode-delegation.ndjson](fixtures/opencode-delegation.ndjson))
 * est le flux `/event` d'un vrai serveur `opencode-ai@1.18.16` pendant un tour où
 * le modèle a délégué : demande de permission, naissance de la fille, son round
 * sur un AUTRE modèle, son `session.idle`, puis la fin du tour de la mère. Un
 * faux fournisseur local scriptait les appels — coût nul, et c'est ce qui permet
 * de rejouer ce fichier sans jamais dépenser un modèle.
 *
 * Ce qu'elle garde, et qu'aucun test sur des événements inventés ne garderait :
 *
 *  - `permission.asked` porte le `subagent_type` DEMANDÉ, avant qu'opencode ne le
 *    résolve — le seul point d'où tenir le plafond de simultané ;
 *  - le rattachement fille → appel de `task` ne vit que dans la `metadata` du part
 *    du tool, et le PREMIER `running` ne la porte pas (`metadata: null`) ;
 *  - un `session.idle` de fille arrive au milieu du tour de la mère.
 */

const FIXTURE = join(__dirname, "fixtures", "opencode-delegation.ndjson");

function fixtureEvents(): OpencodeEvent[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OpencodeEvent);
}

/** La session de la mère : la première créée du flux. */
const PARENT = "ses_00956f6a1ffeop0VskYrTe4TmL";
const CHILD = "ses_00956f473ffdm7mJnLA7qau6mY";

/** Le tour rejoué comme le superviseur le joue, mais sans serveur ni réseau. */
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
      const verdict = decidePermission(out.permission, {
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
    // Rien ne tournait encore : c'est bien la demande qui précède la naissance.
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
    // Le `pending` et le premier `running` n'ont rien à dire : mesuré,
    // `metadata: null` tant que la fille n'est pas créée.
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
    // La place se libère : sans ça, le plafond de simultané se refermerait pour
    // le reste du tour sur des filles qui ont déjà rapporté.
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
    // Le fil affiche `mode` et `model` depuis MIN-112 ; opencode, lui, ne connaît
    // que `explore-cheap`. La relecture d'un run doit dire la même chose des deux
    // moteurs — c'est le critère de bascule du lot 3.
    const spawn = replay().emitted.find(
      (e) => e.type === "tool_call" && e.payload.name === "spawn_agent",
    );
    expect(spawn?.payload.mode).toBe("explore");
    expect(spawn?.payload.model).toBe("Cheap");
    expect(spawn?.payload.task).toBe("look around");
  });

  it("préfixe les ids de tool-call d'une fille", () => {
    // Deux modèles peuvent rendre le même `call_1`, et le fil apparie par id.
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
    // Le modèle de la fille est bien l'autre : c'est `agent.<id>.model` qui l'a
    // décidé, puisque le tool `task` n'a pas de champ `model`.
    expect(child[0].model).toBe("cheap");
    // Et il n'est pas gratuit : un modèle déclaré sans prix rendrait `cost: 0`.
    expect(child[0].costUsd).toBeGreaterThan(0);
    expect(usage.some((u) => u.sessionId === PARENT && u.costUsd > 0)).toBe(true);
  });

  it("écrit dans la bande de `seq` des sous-agents, comme la boucle maison", () => {
    const registry = new SubagentRegistry(new Map());
    expect(subagentUsageSeq(registry.slotOf("ses_a"))).toBe(subagentUsageSeq(0));
    expect(subagentUsageSeq(registry.slotOf("ses_b"))).toBe(subagentUsageSeq(1));
    // Une session qu'aucun `task` n'a rattachée obtient quand même sa bande :
    // une dépense qu'on ne sait pas rattacher vaut mieux rangée que perdue.
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
    // Ni joker ni séparateur : le nom sert de patron dans `permission.task`.
    expect(subagentAgentName("implement", "x_y*z/w")).toMatch(/^[a-z0-9-]+$/);
  });
});
