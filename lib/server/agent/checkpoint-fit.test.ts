import { describe, expect, it } from "vitest";

import { fitCheckpoint, MAX_CHECKPOINT_BYTES } from "./checkpoint-fit";
import { IMAGE_ELIDED_NOTE, PRUNE_STUB } from "./prune";
import { isResumableSubagent, type SubagentRecord } from "./subagent";
import type { AgentChatMessage } from "./agent-loop";
import type { AgentCheckpoint } from "./runs";

/**
 * MIN-217 — un checkpoint hors gabarit ne doit jamais être persisté.
 *
 * Ce que ça coûtait. Le garde-fou anti-runaway mesurait le checkpoint, déclarait
 * qu'il ne passait pas, émettait `turnTooBig`… puis écrivait le MÊME objet, tel
 * quel, en invitant l'utilisateur à ouvrir un nouveau tour. Le tour suivant le
 * rehydratait et rejouait exactement la même fin. La session était morte sans
 * qu'aucun message ne le dise : chaque relance coûtait un réveil de microVM pour
 * rejouer la même impasse.
 *
 * Et rien, en amont, ne faisait converger sa TAILLE : l'élagage, le plafond
 * d'images et la compaction se décident tous les trois en TOKENS ESTIMÉS. Une
 * image compte 4 000 caractères quel que soit son poids en base64 (`content.ts`),
 * et l'historique d'une fille suspendue ne vit pas dans `messages` du tout. Les
 * deux cas ci-dessous sont donc exactement ceux qu'aucune hygiène existante ne
 * voyait passer.
 */

const KB = 1024;

/** Un message `tool` porteur d'une sortie texte de `size` octets. */
function toolText(id: string, size: number): AgentChatMessage {
  return { role: "tool", tool_call_id: id, content: "x".repeat(size) };
}

/** Le `tool_call` d'un `read_file` — ce qui donne sa clé de mémoire au résultat. */
function readCall(id: string, path: string) {
  return { id, type: "function" as const, function: { name: "read_file", arguments: JSON.stringify({ path }) } };
}

/** Un message `tool` porteur d'une image de `size` octets de base64. */
function toolImage(id: string, size: number): AgentChatMessage {
  return {
    role: "tool",
    tool_call_id: id,
    content: [
      { type: "text", text: "{}" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${"B".repeat(size)}` } },
    ],
  };
}

function suspendedChild(id: string, historyBytes: number): SubagentRecord {
  return {
    id,
    task: "read the tests",
    mode: "explore",
    model: null,
    thinkingEffort: null,
    status: "suspended",
    rounds: 4,
    costUsd: 0.2,
    startedAt: 0,
    delivered: false,
    messages: [toolText(`${id}-t1`, historyBytes)],
  };
}

/** Le checkpoint minimal d'un tour ordinaire. */
function checkpoint(over: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    messages: [
      { role: "system", content: "you are an agent" },
      { role: "user", content: "fix the bug" },
    ],
    usageSeq: 12,
    lastFilesSha: "abc123",
    instructions: { paths: ["AGENTS.md"], bytes: 400 },
    ...over,
  };
}

describe("fitCheckpoint", () => {
  it("ne touche à rien quand le checkpoint tient (et rend l'objet d'entrée)", () => {
    const cp = checkpoint();
    const fit = fitCheckpoint(cp);
    expect(fit.dropped).toEqual([]);
    // Identité, pas égalité : le cas normal ne doit pas payer une copie de
    // l'historique à chaque mise au repos.
    expect(fit.checkpoint).toBe(cp);
    expect(fit.bytes).toBe(JSON.stringify(cp).length);
  });

  it("lâche d'abord les historiques des filles suspendues — le poste invisible à la compaction", () => {
    // Six filles au budget de `SUBAGENT_HISTORY_MAX_BYTES` : 9 Mo de checkpoint
    // sans un token de plus dans la fenêtre du modèle. C'est LE cas qui bouclait.
    const subagents = Array.from({ length: 6 }, (_, i) => suspendedChild(`sub-${i}`, 1_500_000));
    const fit = fitCheckpoint(checkpoint({ subagents, parkedForSubagents: true }));

    expect(fit.bytes).toBeGreaterThan(MAX_CHECKPOINT_BYTES);
    expect(fit.dropped).toEqual(["subagentHistories"]);
    expect(JSON.stringify(fit.checkpoint).length).toBeLessThanOrEqual(MAX_CHECKPOINT_BYTES);
    // L'historique de la conversation, lui, n'a pas été touché : le palier 1 a suffi.
    expect(fit.checkpoint.messages).toHaveLength(2);
  });

  it("laisse les records de filles LISIBLES mais irreprenables", () => {
    const fit = fitCheckpoint(
      checkpoint({
        subagents: [suspendedChild("sub-0", 9_000_000)],
        parkedForSubagents: true,
      }),
    );
    const [record] = fit.checkpoint.subagents ?? [];

    // Ce que `agent_status` / `list_agents` continuent de savoir dire.
    expect(record).toMatchObject({ id: "sub-0", task: "read the tests", rounds: 4 });
    // Et ce qui empêche le zombie : `restore()` reclassera ce record en `cut` +
    // `delivered`, et l'admission de chunk cessera de différer un réveil pour une
    // reprise qui n'aura pas lieu.
    expect(record.messages).toBeUndefined();
    expect(isResumableSubagent(record)).toBe(false);
    // Garer le parent en attente de filles qui ne repartiront jamais lui ferait
    // passer son chunk entier à attendre le vide.
    expect(fit.checkpoint.parkedForSubagents).toBeUndefined();
  });

  it("lâche ensuite images et sorties de tools, en laissant de quoi les relire", () => {
    const messages: AgentChatMessage[] = [
      { role: "system", content: "you are an agent" },
      toolImage("t1", 5_000_000),
      toolText("t2", 4_000_000),
      { role: "assistant", content: "done" },
    ];
    const fit = fitCheckpoint(checkpoint({ messages }));

    expect(fit.dropped).toEqual(["images", "toolOutputs"]);
    expect(JSON.stringify(fit.checkpoint).length).toBeLessThanOrEqual(MAX_CHECKPOINT_BYTES);
    // Rien d'irrécupérable : les deux marqueurs disent au modèle comment y revenir.
    expect(JSON.stringify(fit.checkpoint.messages[1])).toContain(IMAGE_ELIDED_NOTE);
    expect(fit.checkpoint.messages[2].content).toBe(PRUNE_STUB);
    // La conversation, elle, tient debout : le tour suivant continue.
    expect(fit.checkpoint.messages).toHaveLength(4);
    expect(fit.checkpoint.messages[3].content).toBe("done");
  });

  it("rase TOUTES les lectures, même la dernière de chaque chemin", () => {
    // MIN-248 a donné à l'élagage une mémoire par chemin : la dernière lecture d'un
    // fichier survit à la boucle, quel que soit son âge. Le chemin de SAUVETAGE, lui,
    // ne la passe pas — et ne doit jamais la passer. Ici on n'optimise plus le
    // contexte, on sauve un checkpoint qui déborde des 8 Mo : une lecture épargnée
    // par principe, c'est le palier suivant (la conversation entière) qui saute.
    const messages: AgentChatMessage[] = [
      { role: "system", content: "you are an agent" },
      { role: "assistant", content: null, tool_calls: [readCall("t1", "src/a.ts")] },
      toolText("t1", 3_000_000),
      { role: "assistant", content: null, tool_calls: [readCall("t2", "src/b.ts")] },
      toolText("t2", 3_000_000),
      { role: "assistant", content: null, tool_calls: [readCall("t3", "src/c.ts")] },
      toolText("t3", 3_000_000),
    ];
    const fit = fitCheckpoint(checkpoint({ messages }));

    expect(fit.dropped).toEqual(["toolOutputs"]);
    expect(JSON.stringify(fit.checkpoint).length).toBeLessThanOrEqual(MAX_CHECKPOINT_BYTES);
    const outputs = fit.checkpoint.messages.filter((m) => m.role === "tool");
    expect(outputs).toHaveLength(3);
    expect(outputs.every((m) => m.content === PRUNE_STUB)).toBe(true);
  });

  it("ne mute pas l'historique qu'on lui passe", () => {
    const messages: AgentChatMessage[] = [toolText("t1", 9_000_000)];
    fitCheckpoint(checkpoint({ messages }));
    // `result.messages` de la boucle est passé tel quel : le raboter en place
    // ferait disparaître des sorties de tools du tour EN COURS.
    expect((messages[0].content as string).length).toBe(9_000_000);
  });

  it("en dernier recours lâche l'historique — et REMET `instructions` à zéro", () => {
    // Un historique que ni l'élagage ni le plafond d'images ne peuvent réduire :
    // que de l'assistant, que du texte.
    const messages: AgentChatMessage[] = Array.from({ length: 90 }, (_, i) => ({
      role: "assistant",
      content: `${i}`.padEnd(100 * KB, "x"),
    }));
    const fit = fitCheckpoint(
      checkpoint({ messages, editedPaths: ["app/page.tsx"], repoTouched: true }),
      1_000_000,
    );

    expect(fit.dropped).toEqual(["history"]);
    expect(fit.checkpoint.messages).toEqual([]);
    // Le piège de ce palier : `instructions` dit « AGENTS.md déjà servi », or le
    // message qui le portait vient de partir avec l'historique. Le laisser passer,
    // c'est un agent qui ne lira plus jamais les consignes du dépôt de la session.
    expect(fit.checkpoint.instructions).toBeUndefined();
    // Ce qui survit : l'état de RUN, pour que le tour suivant reparte du bon diff
    // et retrouve son travail.
    expect(fit.checkpoint).toMatchObject({
      usageSeq: 12,
      lastFilesSha: "abc123",
      editedPaths: ["app/page.tsx"],
      repoTouched: true,
    });
  });

  it("rend toujours quelque chose qui TIENT — c'est tout le ticket", () => {
    // Les trois postes en même temps, chacun largement au-dessus du gabarit.
    const fit = fitCheckpoint(
      checkpoint({
        messages: [toolImage("t1", 4_000_000), toolText("t2", 4_000_000)],
        subagents: [suspendedChild("sub-0", 4_000_000), suspendedChild("sub-1", 4_000_000)],
        parkedForSubagents: true,
      }),
    );
    expect(fit.bytes).toBeGreaterThan(MAX_CHECKPOINT_BYTES);
    expect(JSON.stringify(fit.checkpoint).length).toBeLessThanOrEqual(MAX_CHECKPOINT_BYTES);
  });
});
