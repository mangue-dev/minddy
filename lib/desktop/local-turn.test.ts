import { describe, expect, it } from "vitest";

import { assertUsableLayout } from "@/lib/server/agent/harness-layout";
import {
  VM_PROTOCOL_VERSION,
  isCurrentRepoJob,
  isLocalJob,
  parseVmJob,
  type VmJob,
} from "@/lib/server/agent/vm/protocol";
import {
  assignmentToJob,
  localLayout,
  localOpencodeDir,
  localRunRoot,
  localTurnRefusalMessage,
  localTurnSecrets,
  parseLocalTurnAssignment,
  staleRunRoots,
} from "./local-turn";

/**
 * MIN-293 — LE CONTRAT ENTRE LE SERVEUR ET LA MACHINE.
 *
 * L'invariant que ce fichier tient : **le serveur ne pose aucun chemin de cette
 * machine, la machine ne fabrique aucun champ de run.** Le reste des tests en
 * découle — un `layout` venu du serveur est refusé, un `appOrigin` venu du
 * serveur est réécrit, et rien d'autre n'est touché.
 */

const USER_DATA = "/Users/clement/Library/Application Support/minddy";
const RUN_ID = "11111111-2222-4333-8444-555555555555";
const REPO = "/Users/clement/Projets/minddy";

/**
 * Une affectation minimale. `over.job` est fusionné DANS le job, jamais
 * par-dessus — un `...over` posé après `job:` remplacerait le job entier par le
 * seul champ qu'on voulait changer, et la moitié des refus ci-dessous passerait
 * alors pour la mauvaise raison.
 */
function assignment(over: Record<string, unknown> = {}) {
  const { job: jobOver, ...envelope } = over;
  return {
    runId: RUN_ID,
    projectId: "proj-1",
    repoFullName: "mangue-dev/minddy",
    ...envelope,
    job: {
      protocolVersion: VM_PROTOCOL_VERSION,
      runId: RUN_ID,
      controlToken: "jeton.de.bail",
      appOrigin: "https://www.minddy.app",
      authUrl: "https://x-access-token:ghs_secret@github.com/mangue-dev/minddy.git",
      model: "anthropic/claude-sonnet-5",
      repoMode: "clone",
      workBranch: "minddy/run-1",
      commitRef: "MIN-293",
      ...(jobOver as object | undefined),
    },
  };
}

describe("parseLocalTurnAssignment", () => {
  it("accepte une affectation complète", () => {
    const parsed = parseLocalTurnAssignment(assignment());
    expect(parsed?.runId).toBe(RUN_ID);
    expect(parsed?.repoFullName).toBe("mangue-dev/minddy");
  });

  it("REFUSE un `layout` posé par le serveur", () => {
    // Le serveur ne connaît aucun chemin de cette machine. Un layout venu de lui
    // désignerait un dossier que personne n'a choisi — et `repoDir` est la racine
    // de sécurité de toutes les écritures du modèle.
    const forged = assignment();
    (forged.job as Record<string, unknown>).layout = {
      root: "/tmp/pwn",
      repoDir: "/",
      toolOutputDir: "/tmp/pwn/o",
      harnessDir: "/tmp/pwn/h",
      typecheckDir: "/tmp/pwn/t",
      opencodeDir: "/tmp/oc",
    };
    expect(parseLocalTurnAssignment(forged)).toBeNull();
  });

  it("exige une version de protocole, mais ne la JUGE pas ici", () => {
    // La coquille ne parle pas le protocole : elle relaie un job vers un harness
    // qu'elle télécharge à la même origine, dans le même geste. C'est donc au
    // choix du harness que les deux se confrontent (`bundleDecision`), pas ici —
    // sinon l'app porterait une constante qu'elle n'utilise jamais et qui la
    // périmerait à chaque mouvement du contrat.
    expect(
      parseLocalTurnAssignment(assignment({ job: { protocolVersion: VM_PROTOCOL_VERSION + 1 } }))
        ?.job.protocolVersion,
    ).toBe(VM_PROTOCOL_VERSION + 1);
    for (const protocolVersion of [undefined, "2", 2.5, null]) {
      expect(parseLocalTurnAssignment(assignment({ job: { protocolVersion } }))).toBeNull();
    }
  });

  it("refuse un job sans bail : il ne pourrait même pas rendre son rapport", () => {
    expect(parseLocalTurnAssignment(assignment({ job: { controlToken: "" } }))).toBeNull();
    expect(parseLocalTurnAssignment(assignment({ job: { controlToken: undefined } }))).toBeNull();
  });

  it("refuse un job dont l'identité de run ne correspond pas à l'enveloppe", () => {
    // Deux vérités sur le même fait : celle qui décide du dossier (l'enveloppe)
    // et celle qui décide de ce que le bail ouvre (le job). Elles doivent être
    // la même, sans quoi un tour écrirait dans la racine d'un autre run.
    expect(parseLocalTurnAssignment(assignment({ job: { runId: "un-autre" } }))).toBeNull();
  });

  it("refuse une enveloppe incomplète, une chaîne, une page HTML", () => {
    expect(parseLocalTurnAssignment(assignment({ repoFullName: "  " }))).toBeNull();
    expect(parseLocalTurnAssignment(assignment({ projectId: 42 }))).toBeNull();
    expect(parseLocalTurnAssignment({ runId: RUN_ID })).toBeNull();
    expect(parseLocalTurnAssignment("<!doctype html>")).toBeNull();
    expect(parseLocalTurnAssignment(null)).toBeNull();
  });
});

describe("le layout de la machine", () => {
  it("donne une racine par run — deux tickets ne partagent ni job ni base SQLite", () => {
    const a = localRunRoot(USER_DATA, RUN_ID);
    const b = localRunRoot(USER_DATA, "99999999-2222-4333-8444-555555555555");
    expect(a).not.toBe(b);
    expect(a.startsWith(`${USER_DATA}/agent-runs/`)).toBe(true);
  });

  it("passe l'identifiant au tamis : aucune racine ne sort du dossier de travail", () => {
    // L'identifiant vient de la base, mais il traverse le réseau avant d'arriver
    // ici : un `/` ou un `..` ferait sortir la racine de son dossier, et c'est
    // elle qui borne le harness, ses sorties de tools et son `.tsbuildinfo`.
    const base = `${USER_DATA}/agent-runs`;
    for (const hostile of ["../../../etc", "a/b", "..", "./.ssh", ""]) {
      const root = localRunRoot(USER_DATA, hostile);
      expect(root.startsWith(`${base}/`)).toBe(true);
      expect(root.slice(base.length + 1)).not.toContain("/");
      expect(root.slice(base.length + 1).startsWith(".")).toBe(false);
    }
  });

  it("installe opencode HORS de la racine du run — 144 Mo par ticket, sinon", () => {
    const dir = localOpencodeDir(USER_DATA);
    expect(dir).toBe(`${USER_DATA}/opencode`);
    expect(dir.startsWith(`${USER_DATA}/agent-runs/`)).toBe(false);
  });

  it("produit un layout que les garde-fous savent tenir", () => {
    const layout = localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO });
    expect(() => assertUsableLayout(layout)).not.toThrow();
    // La règle qui compte : le harness et ses sorties ne sont JAMAIS dans le
    // dépôt, sinon ils apparaissent dans le `git status` de l'utilisateur et
    // dans le périmètre du tour.
    expect(layout.repoDir).toBe(REPO);
    expect(layout.harnessDir.startsWith(`${REPO}/`)).toBe(false);
    expect(layout.toolOutputDir.startsWith(`${REPO}/`)).toBe(false);
    expect(layout.typecheckDir.startsWith(`${REPO}/`)).toBe(false);
  });

  it("survit à un `userData` avec un slash final", () => {
    expect(localRunRoot(`${USER_DATA}/`, RUN_ID)).toBe(localRunRoot(USER_DATA, RUN_ID));
  });
});

describe("assignmentToJob", () => {
  const layout = localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO });
  const job = assignmentToJob(parseLocalTurnAssignment(assignment())!, {
    layout,
    appOrigin: "http://localhost:3000",
  });

  it("RÉÉCRIT l'origine : la machine ne parle qu'à qui lui a donné son travail", () => {
    // Le serveur résout `agentControlOrigin()`, qui retombe sur la production
    // hors Vercel. Une coquille de dév parlerait alors à www.minddy.app avec un
    // bail signé par localhost.
    expect(job.appOrigin).toBe("http://localhost:3000");
  });

  it("pose le mode dépôt courant en VALEUR, jamais par déduction", () => {
    expect(job.repoMode).toBe("current");
    expect(isCurrentRepoJob(job)).toBe(true);
  });

  it("ne facture aucun amorçage — il n'y a pas eu de microVM", () => {
    expect(job.bootstrapMs).toBe(0);
  });

  it("reste un job LOCAL au sens du harness", () => {
    expect(isLocalJob(job)).toBe(true);
  });

  it("ne touche à rien d'autre — le run appartient au serveur", () => {
    expect(job.model).toBe("anthropic/claude-sonnet-5");
    expect(job.workBranch).toBe("minddy/run-1");
    expect(job.controlToken).toBe("jeton.de.bail");
  });

  it("pose le layout de la machine, et lui seul", () => {
    expect(job.layout).toEqual(layout);
  });
});

describe("localTurnSecrets", () => {
  it("porte le bail et l'URL de push — les deux choses que le journal ne doit pas garder", () => {
    const job = assignmentToJob(parseLocalTurnAssignment(assignment())!, {
      layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO }),
      appOrigin: "https://www.minddy.app",
    });
    const secrets = localTurnSecrets(job);
    expect(secrets).toContain("jeton.de.bail");
    expect(secrets.some((s) => s.includes("ghs_secret"))).toBe(true);
  });

  it("ne rend jamais de valeur vide — elles substitueraient tout le journal", () => {
    const job = assignmentToJob(
      parseLocalTurnAssignment(assignment({ job: { authUrl: "" } }))!,
      {
        layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO }),
        appOrigin: "https://www.minddy.app",
      },
    );
    expect(localTurnSecrets(job)).toEqual(["jeton.de.bail"]);
  });
});

/**
 * LE SEUL ENDROIT OÙ LES DEUX GRAPHES SE RENCONTRENT.
 *
 * `lib/desktop/local-turn.ts` ne peut PAS importer `VmJob` : `vm/protocol.ts`
 * type-importe `../runs`, qui est `server-only`, et le suivre ferait entrer la
 * moitié du serveur dans le type-check de la coquille — mesuré, il tombe alors
 * sur une quarantaine de fichiers qui n'ont rien à voir avec elle.
 *
 * Ce test tourne sous le tsconfig RACINE, où les deux graphes coexistent sans
 * peine. Il rachète donc la vérification qu'on a dû retirer du module : ce que la
 * machine écrit dans `job.json` est bien un `VmJob`, et le harness qui le relira
 * ne s'y trompera pas. Sans lui, la coquille pourrait dériver du contrat sans
 * qu'aucun compilateur ne le dise.
 */
describe("ce que la machine écrit EST un job du contrat", () => {
  const built = assignmentToJob(parseLocalTurnAssignment(fullAssignment())!, {
    layout: localLayout({ userDataPath: USER_DATA, runId: RUN_ID, repoPath: REPO }),
    appOrigin: "https://www.minddy.app",
  });

  it("passe la porte du HARNESS — `parseVmJob`, et pas une relecture à nous", () => {
    // La seule autorité qui compte : c'est cette fonction que le harness appelle
    // sur le `job.json` qu'on vient d'écrire.
    expect(() => parseVmJob(built)).not.toThrow();
    expect(built.protocolVersion).toBe(VM_PROTOCOL_VERSION);
  });

  it("pose les quatre champs de la machine AU TYPE DU CONTRAT", () => {
    // ⚠ L'annotation EST le test : `tsc` refuse ces lignes le jour où l'un des
    // quatre change de type ou de sens dans `protocol.ts`. C'est ce qui remplace
    // l'import de `VmJob` que la coquille ne peut pas faire — et ça porte
    // exactement sur ce que la coquille écrit, ni plus ni moins.
    const machineFields: Pick<
      VmJob,
      "layout" | "appOrigin" | "repoMode" | "bootstrapMs"
    > = {
      layout: built.layout,
      appOrigin: built.appOrigin,
      repoMode: built.repoMode,
      bootstrapMs: built.bootstrapMs,
    };
    expect(machineFields.repoMode).toBe("current");
  });

  it("ne perd AUCUN champ du serveur en chemin", () => {
    // L'invariant de partage, vérifié à l'exécution : la machine ajoute quatre
    // champs et ne touche à rien d'autre. Un `...spread` mal placé ferait
    // disparaître le journal d'opencode ou les réglages de sous-agents en
    // silence, et le tour repartirait amnésique.
    const server = fullAssignment().job;
    const posesParLaMachine = new Set(["layout", "appOrigin", "repoMode", "bootstrapMs"]);
    for (const [key, value] of Object.entries(server)) {
      if (posesParLaMachine.has(key)) continue;
      expect(built[key]).toEqual(value);
    }
  });
});

/** Un job COMPLET — celui que le serveur remet vraiment, tous champs peuplés. */
function fullAssignment() {
  const job: Omit<VmJob, "layout" | "bootstrapMs"> = {
    protocolVersion: VM_PROTOCOL_VERSION,
    runId: RUN_ID,
    ledgerRunId: RUN_ID,
    projectId: "proj-1",
    appOrigin: "https://www.minddy.app",
    controlToken: "jeton.de.bail",
    model: "anthropic/claude-sonnet-5",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "minddy-placeholder-key",
    reasoningLevel: "medium",
    contextWindow: 200_000,
    inputUsdPerMTok: 3,
    anchor: "issue",
    writesToRepo: true,
    interactive: true,
    chain: false,
    imageInput: true,
    webSearch: false,
    webSearchMax: 5,
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    opencodeInput: { prompt: "vas-y", anchorInstructions: "# ancrage" },
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: "minddy/run-1",
    repoMode: "clone",
    committer: { name: "minddy agent", email: "agent@minddy.app" },
    authUrl: "https://x-access-token:ghs_secret@github.com/mangue-dev/minddy.git",
    commitRef: "MIN-293",
    filesFromSha: "deadbeef",
    locale: "fr",
    feature: "agent_code",
  };
  return { runId: RUN_ID, projectId: "proj-1", repoFullName: "mangue-dev/minddy", job };
}

describe("staleRunRoots", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;

  it("supprime ce qui n'a pas bougé depuis une semaine", () => {
    expect(
      staleRunRoots(
        [
          { name: "vieux", modifiedMs: now - 8 * DAY },
          { name: "recent", modifiedMs: now - 2 * DAY },
        ],
        { nowMs: now },
      ),
    ).toEqual(["vieux"]);
  });

  it("ne touche JAMAIS à la racine d'un run qui tourne", () => {
    // Le ménage tourne aussi à la fin d'un tour, et un second tour peut être en
    // vol : lui retirer son job et sa base SQLite le tuerait sans un mot.
    expect(
      staleRunRoots([{ name: "en-vol", modifiedMs: now - 30 * DAY }], {
        nowMs: now,
        live: new Set(["en-vol"]),
      }),
    ).toEqual([]);
  });

  it("ne supprime rien sur une date illisible", () => {
    expect(
      staleRunRoots([{ name: "?", modifiedMs: Number.NaN }], { nowMs: now }),
    ).toEqual([]);
  });

  it("respecte un délai plus court quand on le lui donne", () => {
    expect(
      staleRunRoots([{ name: "hier", modifiedMs: now - 2 * DAY }], { nowMs: now, keepDays: 1 }),
    ).toEqual(["hier"]);
  });
});

describe("ce que l'utilisateur lit quand rien n'a démarré", () => {
  it("nomme le geste de réparation, pas seulement la panne", () => {
    expect(localTurnRefusalMessage("no_repo", "mangue-dev/minddy")).toContain("mangue-dev/minddy");
    expect(localTurnRefusalMessage("no_repo", "x/y")).toMatch(/attach/i);
    expect(localTurnRefusalMessage("repo_invalid", "x/y")).toMatch(/moved|unmounted/i);
    expect(localTurnRefusalMessage("assignment_invalid", "x/y")).toMatch(/update/i);
  });
});
