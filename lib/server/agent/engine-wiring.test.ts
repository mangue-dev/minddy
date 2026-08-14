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
 *     `loop_in_vm` est lue par le chien de garde (`reapDeadVmRuns` la veut vraie) :
 *     une ligne qui dirait `false` en jouant dans la VM ne serait jamais constatée
 *     morte.
 *  2. **La fonction compose l'entrée d'opencode** — ancrage et prompt — et
 *     rassemble la mémoire du tour précédent depuis `agent_run_journal`.
 *  3. **`vm/main.ts` lève** plutôt que de poster un tour sans son entrée.
 *
 * Depuis la suppression de la boucle maison (2026-08-14), il n'y a plus de moteur
 * à choisir : `agent_engine` reste écrite sur la ligne pour DIRE qui a joué un
 * run, elle ne décide plus de rien.
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

  it("compose l'ancrage et le prompt du tour", () => {
    expect(source).toContain("buildOpencodeAnchor({");
    expect(source).toContain("userPromptFromMessages(messages)");
  });

  it("DIT au tour repris ce qu'il a perdu quand la boucle l'avait mené", () => {
    // Une conversation écrite par la boucle maison vit dans `checkpoint.messages`,
    // et plus personne ne sait la rejouer. Reprise en silence, elle ferait répondre
    // le modèle à un message dont il ne voit pas le contexte : l'agent aurait l'air
    // amnésique sans que rien n'explique pourquoi.
    expect(source).toContain("function priorConversationLost");
    expect(source).toContain("PRIOR_CONVERSATION_LOST_NOTE");
    expect(source).toContain("priorConversationLost(run)");
  });

  it("n'envoie plus de conversation du tout à la microVM", () => {
    // L'historique d'opencode est son journal d'événements. Un champ `messages`
    // sur le job paierait le contexte du ticket deux fois, une fois en prompt et
    // une fois en conversation morte.
    expect(source).not.toContain("messages: opencodeInput");
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
  /**
   * MIN-286 (2026-08-13) — le journal ne descend plus depuis la LIGNE du run : il
   * est rassemblé depuis `agent_run_journal`, où le superviseur l'écrit en append.
   * La ligne n'en garde que le pointeur, parce qu'elle est relue à chaque appel du
   * plan de contrôle et que le journal porte la sortie complète de chaque tool.
   */
  it("rassemble le journal du tour précédent depuis sa table", () => {
    expect(source).toContain("events: await loadRunJournal(run.id, pointer.sessionId)");
    expect(source).toContain("...(opencodeJournal ? { opencode: opencodeJournal } : {})");
  });

  it("n'amorce pas un tour REPRIS : sa demande arrive par le steering", () => {
    // Rejouer l'amorce reposterait le contexte du ticket et la demande du lanceur
    // PAR-DESSUS l'historique restauré — l'agent relirait la consigne initiale
    // comme si elle venait d'arriver. C'est ce que `VmJob.opencodeInput` promet en
    // toutes lettres (« `prompt` est vide sur un tour REPRIS »).
    expect(source).toContain("if (run.checkpoint?.opencode?.sessionId)");
  });
});

describe("vm/main.ts ne connaît plus qu'un moteur", () => {
  const source = read("vm/main.ts");

  it("appelle le superviseur, sans aiguillage", () => {
    expect(source).toContain("runOpencodeTurn");
    // L'aiguillage est parti avec la boucle : plus de `job.engine`, plus de
    // second chemin à maintenir dans la microVM.
    expect(source).not.toContain("job.engine");
    expect(source).not.toContain("runVmTurn");
  });

  it("lève plutôt que de poster un tour vide", () => {
    expect(source).toContain("job carries no opencodeInput");
    // Le `try` global de `main` en fait un rapport d'erreur : ça se voit dans le
    // fil, au lieu d'un tour qui tourne sans savoir ce qu'on lui demande.
    expect(source).toContain("report = await runOpencodeTurnHere");
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
