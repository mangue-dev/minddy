import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-286 lot 3 — LE CÂBLAGE DU MOTEUR, vérifié dans la SOURCE.
 *
 * Pourquoi lexicalement et pas à l'exécution : les trois points ci-dessous vivent
 * sur un chemin qui demande une base, une microVM et un modèle
 * ([execute.ts](execute.ts), [vm/main.ts](vm/main.ts)) — le même raisonnement que
 * [vm-launch.test.ts](vm-launch.test.ts), qui garde de la même façon un invariant
 * que le compilateur ne verra jamais. Chacun de ces trois-là type parfaitement en
 * étant faux, et chacun, faux, fait mentir la bascule plutôt que de la casser :
 *
 *  1. **Le moteur est écrit sur la ligne, et la microVM avec lui.** La colonne
 *     `loop_in_vm` est lue par les balayeurs (`reapDeadVmRuns` la veut vraie,
 *     `requeueStuckRuns` la veut fausse) : une ligne qui dirait `false` en jouant
 *     dans la VM se ferait voler son claim et ne serait jamais constatée morte.
 *  2. **Le moteur voyage jusqu'à la VM**, tel qu'il a été écrit à la création — un
 *     run déjà en vol garde le sien, et les deux moteurs ne relisent pas leur
 *     mémoire dans le même champ du checkpoint.
 *  3. **`vm/main.ts` aiguille sur ce champ**, et un job `opencode` sans son entrée
 *     LÈVE plutôt que de poster un tour vide.
 */

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

describe("createRun écrit le moteur du run, sans drapeau", () => {
  const source = read("runs.ts");

  it("part sur opencode et l'inscrit sur la ligne", () => {
    expect(source).toContain("const engine = AGENT_ENGINE");
    expect(source).toContain("agent_engine: engine");
    // Plus de liste de projets à tenir : un interrupteur qu'une seule personne
    // pourrait actionner ne vaut pas la surface qu'il ajoute.
    expect(source).not.toContain("agentEngineForProject");
    expect(source).not.toContain("loopInVmForProject");
  });

  it("dit aussi que le run tourne dans la microVM", () => {
    // opencode ne tourne QUE là : son superviseur pilote un serveur vivant à côté
    // du dépôt, il n'en existe pas de version dans la fonction.
    expect(source).toContain("const loopInVm = true");
  });
});

describe("execute.ts passe le moteur et son entrée à la microVM", () => {
  const source = read("execute.ts");

  it("recopie le moteur gelé sur le job", () => {
    expect(source).toContain("engine: run.agent_engine");
  });

  it("compose l'ancrage et le prompt pour opencode, et pas pour l'autre moteur", () => {
    expect(source).toContain('run.agent_engine === "opencode"');
    expect(source).toContain("buildOpencodeAnchor({");
    expect(source).toContain("prompt: userPromptFromMessages(messages)");
  });

  it("n'envoie pas la conversation en double", () => {
    // Sous opencode, l'historique est le journal d'événements du checkpoint :
    // envoyer AUSSI `messages` paierait le contexte du ticket deux fois, une fois
    // en prompt et une fois en conversation morte.
    expect(source).toContain("messages: opencodeInput ? [] : messages");
  });
});

describe("vm/main.ts aiguille sur le moteur du job", () => {
  const source = read("vm/main.ts");

  it("choisit le superviseur sur `job.engine`", () => {
    expect(source).toContain('job.engine === "opencode"');
    expect(source).toContain("runOpencodeTurn");
    // L'autre moteur reste joignable : la bascule est réversible run par run.
    expect(source).toContain("runVmTurn(job, cp, host)");
  });

  it("lève plutôt que de poster un tour vide", () => {
    expect(source).toContain("engine=opencode job carries no opencodeInput");
    // Le `try` global de `main` en fait un rapport d'erreur : ça se voit dans le
    // fil, au lieu d'un tour qui tourne sans savoir ce qu'on lui demande.
    expect(source).toContain("report = job.engine");
  });
});
