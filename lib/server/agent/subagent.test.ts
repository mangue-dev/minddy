import { describe, expect, it } from "vitest";
import {
  Subagents,
  subagentUsageSeq,
  MAX_SUBAGENTS_PER_CHUNK,
  PARENT_WRITE_TOOLS,
  SUBAGENT_USAGE_SEQ_BASE,
  SUBAGENT_LIMIT_REASON,
  SUBAGENT_WRITE_LOCKED_REASON,
  type SubagentRecord,
  type SubagentRunOptions,
  type SubagentRunner,
  type SubagentRunResult,
  type SubagentsOptions,
} from "./subagent";

/**
 * Sous-agents (MIN-112). Ce qui se teste ici est la POLITIQUE, celle qui protège
 * les trois choses qu'un run peut vraiment perdre : l'intégrité du diff (un seul
 * écrivain dans une sandbox partagée), l'exactitude du budget (un rapport livré
 * DEUX fois compterait son coût deux fois), et l'honnêteté du fil après un suspend.
 * Les mains — un second appel de `runAgentLoop` — sont derrière un faux runner.
 */

/** Faux runner : chaque fille est résolue à la main par le test. */
function fakeRunner() {
  const started: SubagentRunOptions[] = [];
  const pending = new Map<string, (res: SubagentRunResult) => void>();
  const aborted: string[] = [];

  const runner: SubagentRunner = {
    run(opts) {
      started.push(opts);
      opts.signal.addEventListener("abort", () => aborted.push(opts.id));
      return new Promise<SubagentRunResult>((resolve) => {
        pending.set(opts.id, resolve);
      });
    },
  };

  /** Fait rendre la main à une fille, comme le ferait sa boucle. */
  const finish = async (id: string, res: Partial<SubagentRunResult> = {}) => {
    pending.get(id)?.({
      report: `report of ${id}`,
      rounds: 3,
      costUsd: 0.01,
      status: "done",
      ...res,
    });
    pending.delete(id);
    // Laisse les `.then` du registre s'exécuter.
    await Promise.resolve();
    await Promise.resolve();
  };

  return { runner, started, finish, aborted };
}

function makeSubagents(overrides: Partial<SubagentsOptions> = {}) {
  const fake = fakeRunner();
  const subagents = new Subagents(fake.runner, {
    maxParallel: 2,
    favorites: [
      { id: "deepseek/cheap", label: "Cheap One", use_case: "exploration" },
      { id: "anthropic/strong", label: "Strong One", use_case: "code" },
    ],
    resolveModel: (raw) =>
      raw === "deepseek/cheap" || raw === "Cheap One"
        ? { ok: true, id: "deepseek/cheap" }
        : { ok: false, error: `Unknown model ${raw}` },
    ...overrides,
  });
  return { subagents, ...fake };
}

const EXPLORE = { task: "find every caller of foo", mode: "explore", expected_output: "path:line list" };
const IMPLEMENT = { task: "rename foo to bar", mode: "implement", expected_output: "the diff" };

const asRecord = (r: unknown) => r as Record<string, unknown>;

describe("spawn_agent — validation", () => {
  it("exige task, mode et expected_output", async () => {
    const { subagents } = makeSubagents();
    for (const args of [
      {},
      { task: "x" },
      { task: "x", mode: "explore" },
      { task: "x", mode: "sideways", expected_output: "y" },
    ]) {
      const out = await subagents.spawn(args);
      expect(out.success).toBe(false);
    }
    // `expected_output` est obligatoire PARCE QUE le rapport est tout ce qui
    // revient : sans lui, le parent ne peut pas poser de question de suivi.
    const out = await subagents.spawn({ task: "x", mode: "explore" });
    expect(asRecord(out.result).error).toMatch(/expected_output/);
  });

  it("refuse un thinking_effort hors low/medium/high (off n'est pas exposé)", async () => {
    const { subagents } = makeSubagents();
    const out = await subagents.spawn({ ...EXPLORE, thinking_effort: "off" });
    expect(out.success).toBe(false);
    expect(asRecord(out.result).error).toMatch(/"low", "medium" or "high"/);
  });

  it("accepte un favori par son id ET par son nom, et liste les favoris sur un id inventé", async () => {
    const { subagents, started } = makeSubagents();
    expect((await subagents.spawn({ ...EXPLORE, model: "Cheap One" })).success).toBe(true);
    expect(started[0].model).toBe("deepseek/cheap");

    const out = await subagents.spawn({ ...EXPLORE, model: "made/up" });
    expect(out.success).toBe(false);
    expect(asRecord(out.result).error).toMatch(/Unknown model/);
  });

  it("refuse le champ model quand le run n'offre pas le choix (BYOK non-OpenRouter)", async () => {
    // `resolveModel` absent = `subagentToolsFor` a retiré le champ du schéma ; un
    // modèle qui le passe quand même doit lire pourquoi, pas se prendre un 400.
    const { subagents } = makeSubagents({ resolveModel: undefined });
    const out = await subagents.spawn({ ...EXPLORE, model: "deepseek/cheap" });
    expect(out.success).toBe(false);
    expect(asRecord(out.result).error).toMatch(/cannot run a sub-agent on another model/);
    // Sans `model`, la délégation reste offerte.
    expect((await subagents.spawn(EXPLORE)).success).toBe(true);
  });

  it("ne consomme pas de slot quand le template est invalide", async () => {
    const { subagents, started } = makeSubagents();
    const out = await subagents.spawn({ ...EXPLORE, prompt_template: "nope" });
    expect(out.success).toBe(false);
    expect(started).toHaveLength(0);
    expect(subagents.pending()).toBe(0);
  });
});

describe("un seul écrivain dans la sandbox partagée", () => {
  it("refuse un second implement tant que le premier est en vol", async () => {
    const { subagents, finish } = makeSubagents();
    expect((await subagents.spawn(IMPLEMENT)).success).toBe(true);
    expect(subagents.hasRunningImplement()).toBe(true);
    expect(subagents.runningImplementId()).toBe("sub-1");

    const second = await subagents.spawn(IMPLEMENT);
    expect(second.success).toBe(false);
    expect(second.reason).toBe(SUBAGENT_LIMIT_REASON);
    // Le refus NOMME le sous-agent à attendre : « réessaie » ne dirait pas quoi faire.
    expect(asRecord(second.result).error).toMatch(/sub-1/);

    // Les explore, eux, passent en parallèle d'un implement.
    expect((await subagents.spawn(EXPLORE)).success).toBe(true);

    await finish("sub-1");
    expect(subagents.hasRunningImplement()).toBe(false);
  });

  it("gèle les tools d'ÉDITION du parent, jamais la lecture", () => {
    // Le parent qui édite pendant qu'une fille écrit est le MÊME risque que deux
    // filles simultanées, dans un dépôt dont la fin de tour fait `git add -A`.
    for (const tool of [
      "edit_file",
      "apply_edits",
      "write_file",
      "apply_patch",
      "move_file",
      "delete_file",
    ]) {
      expect(PARENT_WRITE_TOOLS.has(tool)).toBe(true);
    }
    for (const tool of ["read_file", "grep", "glob", "list_dir", "run_command"]) {
      expect(PARENT_WRITE_TOOLS.has(tool)).toBe(false);
    }
  });

  it("refuse l'édition du PARENT pendant un implement, et la rend après le drain", async () => {
    const { subagents, finish } = makeSubagents();
    // Rien en vol : le parent édite librement.
    expect(subagents.writeLock("edit_file")).toBeNull();

    await subagents.spawn(IMPLEMENT);
    const refused = subagents.writeLock("apply_patch");
    expect(refused).not.toBeNull();
    expect(refused!.success).toBe(false);
    expect(refused!.reason).toBe(SUBAGENT_WRITE_LOCKED_REASON);
    expect(asRecord(refused!.result).error).toMatch(/sub-1/);
    // La lecture et `run_command` ne sont JAMAIS gelés : le parent doit pouvoir
    // relire, chercher et lancer les tests pendant que la fille écrit.
    for (const tool of ["read_file", "grep", "glob", "list_dir", "run_command"]) {
      expect(subagents.writeLock(tool)).toBeNull();
    }

    // Le rapport rendu rouvre l'édition — et le message de rapport le DIT, sinon le
    // parent n'essaierait pas.
    await finish("sub-1");
    expect(subagents.writeLock("edit_file")).toBeNull();
    expect(subagents.drainReports()[0].text).toMatch(/editing tools are available again/);
  });

  it("un explore en vol ne gèle rien : il ne peut rien écrire", async () => {
    const { subagents } = makeSubagents();
    await subagents.spawn(EXPLORE);
    expect(subagents.writeLock("write_file")).toBeNull();
  });
});

describe("plafonds", () => {
  it("refuse au-delà du parallélisme, en listant ce qui tourne", async () => {
    const { subagents, finish } = makeSubagents();
    expect((await subagents.spawn(EXPLORE)).success).toBe(true);
    expect((await subagents.spawn(EXPLORE)).success).toBe(true);
    const third = await subagents.spawn(EXPLORE);
    expect(third.success).toBe(false);
    expect(asRecord(third.result).error).toMatch(/2\/2/);
    expect(asRecord(third.result).error).toMatch(/sub-1 \(explore\), sub-2 \(explore\)/);

    // Une place se libère dès qu'une fille rend la main.
    await finish("sub-1");
    expect((await subagents.spawn(EXPLORE)).success).toBe(true);
  });

  it("refuse au-delà du total du chunk, même si rien ne tourne", async () => {
    const { subagents, finish } = makeSubagents({ maxParallel: 1 });
    for (let i = 1; i <= MAX_SUBAGENTS_PER_CHUNK; i++) {
      expect((await subagents.spawn(EXPLORE)).success).toBe(true);
      await finish(`sub-${i}`);
    }
    const out = await subagents.spawn(EXPLORE);
    expect(out.success).toBe(false);
    expect(asRecord(out.result).error).toMatch(new RegExp(`cap is ${MAX_SUBAGENTS_PER_CHUNK}`));
  });

  it("refuse quand le chunk n'a plus assez de temps, avant toute réservation", async () => {
    const { subagents, started } = makeSubagents({
      budgetGuard: () => "Not enough time left in this turn to delegate (4s)",
    });
    const out = await subagents.spawn(EXPLORE);
    expect(out.success).toBe(false);
    expect(out.reason).toBe(SUBAGENT_LIMIT_REASON);
    expect(started).toHaveLength(0);
  });
});

describe("livraison des rapports", () => {
  it("ne livre un rapport qu'UNE fois, avec son coût", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    expect(subagents.drainReports()).toHaveLength(0);

    await finish("sub-1", { costUsd: 0.42, report: "42 call sites" });
    const first = subagents.drainReports();
    expect(first).toHaveLength(1);
    expect(first[0].costUsd).toBe(0.42);
    expect(first[0].text).toContain("42 call sites");
    // Le coût REMONTE dans l'accumulateur de la boucle parente : le livrer deux
    // fois le compterait deux fois, et `budgetUsd` mentirait dans l'autre sens.
    expect(subagents.drainReports()).toHaveLength(0);
  });

  it("dit au parent combien de filles travaillent ENCORE", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    await subagents.spawn(EXPLORE);
    await finish("sub-1");
    const [report] = subagents.drainReports();
    expect(report.text).toMatch(/1 of your sub-agents is still running/);
  });

  it("attend au plus le budget donné, puis rend ce qui est prêt", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    // Budget nul : on ne bloque pas, on ne rend rien.
    expect((await subagents.awaitReports(0)).reports).toHaveLength(0);
    // Une fille qui finit pendant l'attente est livrée sans attendre la fin du budget.
    const waiting = subagents.awaitReports(5_000);
    await finish("sub-1");
    expect((await waiting).reports).toHaveLength(1);
  });

  it("livre les rapports déjà prêts sans attendre les autres", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    await subagents.spawn(EXPLORE);
    await finish("sub-2");
    // sub-1 tourne toujours : on ne l'attend pas, sub-2 est prêt.
    const ready = await subagents.awaitReports(60_000);
    expect(ready.reports).toHaveLength(1);
    expect(ready.reports[0].id).toBe("sub-2");
  });

  /**
   * L'ATTENTE EST INTERRUPTIBLE (demande de Clément) : un sous-agent peut prendre
   * plusieurs minutes, et l'utilisateur doit pouvoir réveiller le parent sans que
   * le travail en cours soit tué. C'est ce qui distingue une vraie attente d'un
   * `sleep` : elle a trois causes de fin, pas une.
   */
  it("rompt l'attente quand l'utilisateur écrit, SANS couper les filles", async () => {
    const { subagents } = makeSubagents();
    await subagents.spawn(IMPLEMENT);
    let userSpoke = false;
    const waiting = subagents.awaitReports(60_000, async () => userSpoke);
    await new Promise((r) => setTimeout(r, 50));
    userSpoke = true;
    const out = await waiting;
    expect(out.interrupted).toBe(true);
    expect(out.reports).toHaveLength(0);
    // La fille tourne TOUJOURS : réveiller le parent ne tue pas son travail.
    expect(subagents.pending()).toBe(1);
    expect(subagents.hasRunningImplement()).toBe(true);
  }, 20_000);

  it("ne se dit pas interrompue quand c'est un rapport qui a mis fin à l'attente", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    const waiting = subagents.awaitReports(60_000, async () => false);
    await finish("sub-1");
    const out = await waiting;
    expect(out.interrupted).toBe(false);
    expect(out.reports).toHaveLength(1);
  });
});

describe("imputation de la dépense des filles", () => {
  it("impute une fille SUSPENDUE, qui n'est pourtant pas livrable, et ne la réimpute pas", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    await finish("sub-1", {
      status: "suspended",
      costUsd: 0.3,
      messages: [{ role: "system", content: "…" }],
    });

    // Elle n'a pas fini : rien à livrer au parent. Sa dépense, elle, est bien réelle —
    // sans `settleUnbilled`, elle n'entrait dans aucun `newCost` et le plafond du run
    // se rechargeait d'autant à chaque continuation.
    expect(subagents.drainReports()).toHaveLength(0);
    expect(subagents.settleUnbilled()).toBeCloseTo(0.3, 6);
    expect(subagents.settleUnbilled()).toBe(0);
  });

  it("ne facture qu'une fois la dépense d'une fille reprise d'un chunk à l'autre", async () => {
    // Chunk 1 : 0,30 $ dépensés, puis suspension — imputés ici, et la marque part
    // dans le checkpoint avec le record.
    const first = makeSubagents();
    await first.subagents.spawn(EXPLORE);
    await first.finish("sub-1", {
      status: "suspended",
      costUsd: 0.3,
      messages: [{ role: "system", content: "…" }],
    });
    expect(first.subagents.settleUnbilled()).toBeCloseTo(0.3, 6);
    const checkpoint = first.subagents.records();

    // Chunk 2 : elle repart avec son cumul et conclut à 0,50 $ CUMULÉS. Livrer ce
    // cumul tel quel repaierait les 0,30 $ déjà imputés.
    const second = makeSubagents();
    second.subagents.restore(checkpoint);
    expect(second.subagents.resumeSuspended()).toBe(1);
    expect(second.started[0].costSoFar).toBeCloseTo(0.3, 6);
    await second.finish("sub-1", { costUsd: 0.5, report: "42 call sites" });

    const [report] = second.subagents.drainReports();
    expect(report.costUsd).toBeCloseTo(0.2, 6);
    // Et il ne reste rien derrière : sur les deux chunks, 0,50 $ imputés, pas 0,80 $.
    expect(second.subagents.settleUnbilled()).toBe(0);
  });
});

describe("cutAll — la fin du chunk", () => {
  it("abort, marque `cut` et laisse un rapport partiel livrable", async () => {
    const { subagents, aborted } = makeSubagents();
    await subagents.spawn(IMPLEMENT);
    // La fille ne rend jamais la main : le délai de grâce tranche.
    const cut = await subagents.cutAll("the turn ended");
    expect(cut).toBe(1);
    expect(aborted).toEqual(["sub-1"]);

    const reports = subagents.drainReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].text).toMatch(/was CUT OFF before finishing/);
    const [record] = subagents.records();
    expect(record.status).toBe("cut");
  }, 20_000);

  it("garde le rapport PARTIEL que la fille a eu le temps de rendre", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    const cutting = subagents.cutAll("the turn ended");
    await finish("sub-1", { status: "cut", report: "read 3 files, then stopped" });
    await cutting;
    expect(subagents.drainReports()[0].text).toContain("read 3 files, then stopped");
  });

  it("ne fait rien quand rien ne tourne", async () => {
    const { subagents } = makeSubagents();
    expect(await subagents.cutAll("nothing")).toBe(0);
  });
});

describe("agent_status / list_agents", () => {
  it("répond sur un sous-agent en cours, et nomme les connus sur un id inconnu", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn({ ...IMPLEMENT, thinking_effort: "high" });

    const running = asRecord(subagents.status({ id: "sub-1" }).result);
    expect(running.status).toBe("running");
    expect(running.mode).toBe("implement");
    expect(running.thinking_effort).toBe("high");
    expect(running.note).toMatch(/do not need to poll/);

    const unknown = subagents.status({ id: "sub-9" });
    expect(unknown.success).toBe(false);
    expect(asRecord(unknown.result).error).toMatch(/sub-1/);

    await finish("sub-1", { report: "renamed in 4 files", rounds: 7 });
    const done = asRecord(subagents.status({ id: "sub-1" }).result);
    expect(done.status).toBe("done");
    expect(done.rounds).toBe(7);
    expect(done.report).toBe("renamed in 4 files");
  });

  it("liste tout, avec le simultané permis", async () => {
    const { subagents } = makeSubagents();
    await subagents.spawn(EXPLORE);
    await subagents.spawn({ ...EXPLORE, model: "Cheap One" });
    const out = asRecord(subagents.list().result);
    expect(out.running).toBe(2);
    expect(out.max_parallel).toBe(2);
    const agents = out.agents as Array<Record<string, unknown>>;
    expect(agents.map((a) => a.id)).toEqual(["sub-1", "sub-2"]);
    expect(agents[1].model).toBe("deepseek/cheap");
  });

  it("liste vide sans mentir : une note plutôt qu'un tableau muet", () => {
    const { subagents } = makeSubagents();
    const out = asRecord(subagents.list().result);
    expect(out.agents).toEqual([]);
    expect(out.note).toMatch(/not launched any/);
  });
});

describe("checkpoint", () => {
  it("cape le rapport persisté", async () => {
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(EXPLORE);
    await finish("sub-1", { report: "x".repeat(50_000) });
    const [record] = subagents.records();
    expect(record.report!.length).toBeLessThan(3_000);
    expect(record.report).toMatch(/truncated/);
  });

  it("restaure des records LISIBLES, et déclare coupé ce qui tournait encore", async () => {
    const { subagents } = makeSubagents({ seqBase: 20 });
    const stale: SubagentRecord[] = [
      {
        id: "sub-1",
        task: "old exploration",
        mode: "explore",
        model: null,
        thinkingEffort: null,
        status: "running",
        rounds: 2,
        costUsd: 0.05,
        startedAt: 1,
        delivered: false,
      },
    ];
    subagents.restore(stale);

    // Une promesse ne survit pas à la fin d'une fonction Vercel : ce record ne peut
    // plus être « en cours », et son rapport est déjà parti dans les messages du
    // chunk précédent — le re-livrer ferait payer son coût deux fois.
    const status = asRecord(subagents.status({ id: "sub-1" }).result);
    expect(status.status).toBe("cut");
    expect(subagents.drainReports()).toHaveLength(0);
    expect(subagents.pending()).toBe(0);

    // Les ids d'un nouveau chunk ne recyclent pas ceux du précédent.
    await subagents.spawn(EXPLORE);
    expect(asRecord(subagents.list().result).agents).toHaveLength(2);
    expect(subagents.records().map((r) => r.id)).toEqual(["sub-1", "sub-21"]);
  });

  it("ignore un record bricolé sans id", () => {
    const { subagents } = makeSubagents();
    subagents.restore([null as unknown as SubagentRecord, { id: 42 } as unknown as SubagentRecord]);
    expect(subagents.records()).toHaveLength(0);
  });
});

describe("bande de seq ai_usage", () => {
  it("espace les slots et reste DANS les bornes de l'integer Postgres", () => {
    expect(subagentUsageSeq(0)).toBe(SUBAGENT_USAGE_SEQ_BASE);
    expect(subagentUsageSeq(1)).toBe(SUBAGENT_USAGE_SEQ_BASE + 1_000);
    // Hors bornes, l'INSERT serait REJETÉ par Postgres et la ligne d'usage perdue :
    // on préfère un ordre d'affichage ambigu à une facture incomplète.
    for (const slot of [1e6, 1e9, Number.MAX_SAFE_INTEGER]) {
      expect(subagentUsageSeq(slot)).toBeLessThanOrEqual(2_147_483_647);
      expect(subagentUsageSeq(slot)).toBeGreaterThan(SUBAGENT_USAGE_SEQ_BASE);
    }
    // Hors de la bande de la sandbox (1e9) et du web (1,5e9).
    expect(subagentUsageSeq(0)).toBeGreaterThan(1_500_000_000);
  });
});

/**
 * REPRISE ENTRE CHUNKS (MIN-112, second temps). Ce que la fonction Vercel tue au
 * bout de 300 s, ce n'est PAS la microVM — elle a une session de 45 min et un
 * snapshot persistant — mais l'état EN MÉMOIRE de la boucle fille. En le posant
 * dans le checkpoint, une fille peut travailler bien au-delà d'un chunk.
 *
 * Ce qui se teste ici est ce qu'on ne peut pas vérifier à la lecture : qu'une
 * fille suspendue n'est PAS livrée comme finie, qu'elle tient toujours le verrou
 * d'écriture entre les deux chunks, et qu'elle repart là où elle s'était arrêtée.
 */
const HISTORY = [
  { role: "system" as const, content: "you are a sub-agent" },
  { role: "user" as const, content: "list the files" },
  { role: "assistant" as const, content: "I read three files so far" },
];

describe("suspension et reprise entre chunks", () => {
  it("suspendAll sauve l'état SANS livrer de rapport", async () => {
    const { subagents, finish, aborted } = makeSubagents();
    await subagents.spawn(IMPLEMENT);
    const suspending = subagents.suspendAll();
    // Le runner voit l'abort, comprend que c'est une suspension et rend son état.
    await finish("sub-1", {
      status: "suspended",
      report: "",
      messages: HISTORY,
      usageSeq: 2_000_001_004,
      rounds: 4,
    });
    expect(await suspending).toBe(1);
    expect(aborted).toEqual(["sub-1"]);

    // Rien n'est livré au parent : la fille n'a pas fini.
    expect(subagents.drainReports()).toHaveLength(0);
    expect(subagents.suspendedCount()).toBe(1);
    // Et elle compte TOUJOURS comme en vol — sinon le parent croirait pouvoir finir.
    expect(subagents.pending()).toBe(1);

    const [record] = subagents.records();
    expect(record.status).toBe("suspended");
    expect(record.messages).toEqual(HISTORY);
    expect(record.usageSeq).toBe(2_000_001_004);
  });

  it("un implement SUSPENDU tient toujours le verrou d'écriture", async () => {
    // C'est la fenêtre que Clément a repérée : entre deux chunks, les éditions de
    // la fille sont à moitié posées sur le disque. Laisser le parent écrire, ou
    // lancer un second implement, corromprait le diff aussi sûrement qu'en plein vol.
    const { subagents, finish } = makeSubagents();
    await subagents.spawn(IMPLEMENT);
    const suspending = subagents.suspendAll();
    await finish("sub-1", { status: "suspended", report: "", messages: HISTORY });
    await suspending;

    expect(subagents.hasRunningImplement()).toBe(true);
    expect(subagents.runningImplementId()).toBe("sub-1");
    expect(subagents.writeLock("write_file")).not.toBeNull();
    expect((await subagents.spawn(IMPLEMENT)).success).toBe(false);
  });

  it("repart du checkpoint avec son historique, son slot et sa bande de seq", async () => {
    const { subagents, started } = makeSubagents({ seqBase: 40 });
    subagents.restore([
      {
        id: "sub-7",
        task: "rename foo",
        mode: "implement",
        model: "deepseek/cheap",
        thinkingEffort: "low",
        status: "suspended",
        rounds: 4,
        costUsd: 0.02,
        startedAt: 1,
        delivered: false,
        messages: HISTORY,
        usageSeq: 2_000_007_004,
        parentCallId: "call_abc",
        expectedOutput: "the diff",
        slot: 7,
      },
    ]);
    // Avant relance : suspendue, pas livrable, et elle tient déjà le verrou.
    expect(subagents.suspendedCount()).toBe(1);
    expect(subagents.drainReports()).toHaveLength(0);
    expect(subagents.hasRunningImplement()).toBe(true);

    expect(subagents.resumeSuspended()).toBe(1);
    expect(started).toHaveLength(1);
    // Elle CONTINUE : même historique, même bande d'usage, même ligne du fil.
    expect(started[0].resumeMessages).toEqual(HISTORY);
    expect(started[0].resumeUsageSeq).toBe(2_000_007_004);
    expect(started[0].slot).toBe(7);
    expect(started[0].parentCallId).toBe("call_abc");
    expect(started[0].roundsSoFar).toBe(4);
    expect(started[0].costSoFar).toBe(0.02);
    expect(subagents.pending()).toBe(1);
    // L'historique ne vit plus en double : la boucle l'a repris.
    expect(subagents.records()[0].messages).toBeUndefined();
  });

  it("totalise rounds et coût à travers les chunks", async () => {
    const { subagents, finish } = makeSubagents({ seqBase: 40 });
    subagents.restore([
      {
        id: "sub-7", task: "t", mode: "explore", model: null, thinkingEffort: null,
        status: "suspended", rounds: 4, costUsd: 0.02, startedAt: 1, delivered: false,
        messages: HISTORY, slot: 7,
      },
    ]);
    subagents.resumeSuspended();
    // Le runner rend le CUMUL (il reçoit roundsSoFar/costSoFar) — ici on simule un
    // second chunk de 3 rounds et 0,01 $ de plus.
    await finish("sub-7", { status: "done", rounds: 7, costUsd: 0.03, report: "done at last" });
    const [report] = subagents.drainReports();
    expect(report.costUsd).toBe(0.03);
    expect(report.text).toContain("Steps: 7");
    expect(report.text).toContain("done at last");
  });

  it("dégrade en COUPURE quand l'état n'a pas pu être sauvé", async () => {
    // Historique trop gros pour le checkpoint, ou fille qui n'a pas rendu la main :
    // on ne promet pas une reprise impossible, on livre le partiel une bonne fois.
    const { subagents } = makeSubagents();
    await subagents.spawn(EXPLORE);
    await subagents.suspendAll();
    const [record] = subagents.records();
    expect(record.status).toBe("cut");
    expect(subagents.suspendedCount()).toBe(0);
    expect(subagents.drainReports()).toHaveLength(1);
  }, 20_000);

  it("un record `suspended` SANS historique n'est pas repris (checkpoint bricolé)", () => {
    const { subagents, started } = makeSubagents();
    subagents.restore([
      {
        id: "sub-1", task: "t", mode: "explore", model: null, thinkingEffort: null,
        status: "suspended", rounds: 1, costUsd: 0, startedAt: 1, delivered: false,
      },
    ]);
    expect(subagents.resumeSuspended()).toBe(0);
    expect(started).toHaveLength(0);
    expect(subagents.pending()).toBe(0);
  });
});
