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

  it("recopie le moteur du run sur le job", () => {
    expect(source).toContain("engine: effectiveEngine(run)");
  });

  it("laisse un checkpoint de la BOUCLE finir sur la boucle, quoi que dise la ligne", () => {
    // Le cas réel : entre la migration (défaut `opencode`) et le déploiement de ce
    // code, la prod tournait encore la boucle maison, qui n'écrit pas la colonne.
    // Ces runs portent donc `opencode` sur leur ligne et une conversation de boucle
    // dans leur checkpoint — repris chez opencode, ils repartiraient avec un journal
    // vide, c'est-à-dire sans leur conversation, et sans que rien ne le dise.
    expect(source).toContain("if (saved?.messages?.length && !saved.opencode) return");
  });

  it("compose l'ancrage et le prompt pour opencode, et pas pour l'autre moteur", () => {
    expect(source).toContain('effectiveEngine(run) === "opencode"');
    expect(source).toContain("buildOpencodeAnchor({");
    expect(source).toContain("prompt: userPromptFromMessages(messages)");
  });

  it("n'envoie pas la conversation en double", () => {
    // Sous opencode, l'historique est le journal d'événements du checkpoint :
    // envoyer AUSSI `messages` paierait le contexte du ticket deux fois, une fois
    // en prompt et une fois en conversation morte.
    expect(source).toContain("messages: opencodeInput ? [] : messages");
  });

  /**
   * MIN-286 — LA MÉMOIRE D'UN RUN OPENCODE DESCEND DANS LA VM.
   *
   * Le journal d'événements est TOUTE la mémoire d'un run mené par opencode, et
   * il ne descendait pas : `job.opencode` restait `undefined`, le superviseur
   * créait une session neuve, et chaque tour repartait sans une ligne de sa
   * conversation. Le chemin d'écriture, lui, était complet de bout en bout — le
   * superviseur exporte, le plan de contrôle estampille, `AgentCheckpoint` le
   * déclare —, donc rien ne se voyait : ni erreur, ni type qui proteste, juste un
   * agent amnésique d'un tour à l'autre.
   */
  it("descend le journal du tour précédent dans le job", () => {
    expect(source).toContain("opencode: run.checkpoint.opencode");
  });

  it("n'amorce pas un tour REPRIS : sa demande arrive par le steering", () => {
    // Rejouer l'amorce reposterait le contexte du ticket et la demande du lanceur
    // PAR-DESSUS l'historique restauré — l'agent relirait la consigne initiale
    // comme si elle venait d'arriver. C'est ce que `VmJob.opencodeInput` promet en
    // toutes lettres (« `prompt` est vide sur un tour REPRIS »).
    expect(source).toContain("else if (run.checkpoint?.opencode?.events?.length)");
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

/**
 * MIN-286 — UNE RELECTURE NE DÉLÈGUE PAS, ET LE JOB DOIT LE DIRE.
 *
 * Chez opencode, c'est le plafond de simultané qui décide de servir le tool
 * `task` (`primaryTools`, [vm/opencode-config.ts](vm/opencode-config.ts)). Les
 * deux prompts posaient déjà la condition ; le job, lui, l'avait perdue — une
 * relecture recevait donc un tool de délégation que son ancrage ne décrit pas,
 * que `PR_REVIEW_TOOLS` refuse, et dont les filles ÉDITENT le dépôt d'un run
 * censé n'y rien écrire.
 */
describe("le plafond de sous-agents suit l'ancrage", () => {
  const source = read("execute.ts");

  it("ferme la délégation d'un run qui n'écrit pas dans le dépôt", () => {
    expect(source).toContain("maxParallel: writesToRepo ? subagentMaxParallel : 0");
  });
});
