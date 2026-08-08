import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La FABRIQUE des routines (MIN-185) — ce que les quatre portes ne revalident
 * pas. Ce qui est testé ici est exactement ce qui, oublié dans une des portes,
 * ne se verrait qu'une fois la routine partie toute seule : la garde owner, la
 * cohérence de la cadence, le plafond de modèle du plan, le dépôt lié, et le
 * réarmement qui recalcule l'échéance au lieu de la laisser périmée.
 *
 * Le faux Supabase porte les trois tables du cœur (`agent_routines`,
 * `projects`, `project_members`) et applique VRAIMENT les filtres : sans ça, le
 * compare-and-set du claim ne dirait rien de la course qu'il est censé perdre.
 */

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const ROUTINE_ID = "44444444-4444-4444-8444-444444444444";

interface RoutineRow extends Record<string, unknown> {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  prompt: string;
  model: string | null;
  reasoning_level: "off" | "low" | "medium" | "high";
  base_branch: string | null;
  max_spend_percent: number;
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

const world = {
  routines: [] as RoutineRow[],
  /** Le projet a-t-il un dépôt lié ? */
  hasRepo: true,
  /** Le modèle demandé dépasse-t-il le plafond du plan ? */
  modelAbovePlan: false,
  /** Le quota du propriétaire — `cap` est le budget mensuel du plan (Go : 5 $). */
  quota: {
    allowed: true,
    unlimited: false,
    mode: "platform" as "platform" | "byok",
    cap: 5 as number | undefined,
    remaining: 5 as number | undefined,
  },
};

function makeRoutine(over: Partial<RoutineRow> = {}): RoutineRow {
  return {
    id: ROUTINE_ID,
    project_id: PROJECT_ID,
    owner_id: OWNER_ID,
    title: "Analyse de sécurité",
    prompt: "Relis le code à la recherche de failles.",
    model: null,
    reasoning_level: "medium",
    base_branch: null,
    max_spend_percent: 15,
    frequency: "weekly",
    hour: 9,
    minute: 0,
    weekdays: [1],
    days_of_month: [],
    timezone: "Europe/Paris",
    enabled: true,
    next_run_at: "2020-01-06T08:00:00.000Z",
    last_run_at: null,
    last_error: null,
    deleted_at: null,
    deleted_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

vi.mock("@/lib/supabase-service", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: { column: string; values: unknown[] } | null = null;
    let patch: Record<string, unknown> | null = null;
    let inserted: Record<string, unknown> | null = null;
    let deleting = false;

    const matches = (row: Record<string, unknown>) =>
      Object.entries(filters).every(([column, value]) => (row[column] ?? null) === value) &&
      (!inFilter || inFilter.values.includes(row[inFilter.column]));

    const rows = (): Record<string, unknown>[] => {
      if (table === "agent_routines") {
        return world.routines.filter((r) => matches(r as unknown as Record<string, unknown>));
      }
      if (table === "projects") {
        // `getProjectAccess` lit le projet ; `listRoutinesForUser` lit les
        // projets possédés.
        return [{ id: PROJECT_ID, owner_id: OWNER_ID, key: "MIN", deleted_at: null }].filter(
          (p) => matches(p),
        );
      }
      if (table === "project_members") {
        return [{ project_id: PROJECT_ID, user_id: MEMBER_ID }].filter((m) => matches(m));
      }
      return [];
    };

    const apply = (): Record<string, unknown>[] => {
      if (inserted) {
        const row = makeRoutine({
          ...(inserted as Partial<RoutineRow>),
          id: ROUTINE_ID,
        });
        world.routines.push(row);
        return [row as unknown as Record<string, unknown>];
      }
      const targets = rows();
      if (deleting) {
        world.routines = world.routines.filter(
          (r) => !targets.includes(r as unknown as Record<string, unknown>),
        );
        return targets;
      }
      if (patch) for (const row of targets) Object.assign(row, patch);
      return targets;
    };

    const query: Record<string, unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.order = chain;
    query.limit = chain;
    query.not = chain;
    query.lte = chain;
    query.insert = (values: Record<string, unknown>) => {
      inserted = values;
      return query;
    };
    query.update = (values: Record<string, unknown>) => {
      patch = values;
      return query;
    };
    query.delete = () => {
      deleting = true;
      return query;
    };
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.is = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.in = (column: string, values: unknown[]) => {
      inFilter = { column, values };
      return query;
    };
    const settle = () =>
      inserted || patch || deleting
        ? apply()
        : rows();
    query.maybeSingle = async () => ({ data: settle()[0] ?? null, error: null });
    query.single = async () => ({ data: settle()[0] ?? null, error: null });
    query.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: settle(), error: null }).then(resolve);
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

vi.mock("@/lib/server/git/repo-links", () => ({
  getProjectLink: async () => (world.hasRepo ? { id: "link-1", connection_id: "c1" } : null),
}));

vi.mock("@/lib/server/agent/quota", () => ({
  checkAgentQuota: async () => world.quota,
}));

// Le petit modèle qui NOMME la routine : on ne l'appelle pas pour de vrai, mais
// on compte ses passages — le titre doit se refaire quand l'instruction change,
// et seulement là.
const titleCalls: string[] = [];
vi.mock("@/lib/server/short-title", () => ({
  generateShortTitle: async ({ text }: { text: string }) => {
    titleCalls.push(text);
    return `Titre de « ${text.slice(0, 12)} »`;
  },
}));

vi.mock("@/lib/server/agent/model-plan", () => ({
  ensureModelInPlan: async () => {
    if (world.modelAbovePlan) {
      const { PlanLimitError } = await import("@/lib/server/plan-limit-error");
      throw new PlanLimitError("model_above_plan", {
        model: "anthropic/claude-opus-5",
        multiplier: 71,
        limit: 15,
        plan: "go",
      });
    }
  },
}));

const {
  claimRoutine,
  createRoutine,
  deleteRoutine,
  dueRoutines,
  getRoutineForUser,
  listRoutinesForUser,
  routineRunBudgetUsd,
  stampRoutineLaunched,
  updateRoutine,
} = await import("./routines");
const { restoreItem } = await import("./trash");

beforeEach(() => {
  world.routines = [];
  world.hasRepo = true;
  world.modelAbovePlan = false;
  world.quota = {
    allowed: true,
    unlimited: false,
    mode: "platform",
    cap: 5,
    remaining: 5,
  };
  titleCalls.length = 0;
});

const validInput = (over: Record<string, unknown> = {}) => ({
  projectId: PROJECT_ID,
  actorId: OWNER_ID,
  prompt: "Relis le code à la recherche de failles et corrige-les.",
  frequency: "weekly",
  hour: 9,
  minute: 0,
  weekdays: [1],
  timezone: "Europe/Paris",
  ...over,
});

describe("createRoutine", () => {
  it("crée pour le propriétaire, avec une échéance armée", async () => {
    const result = await createRoutine(validInput() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.owner_id).toBe(OWNER_ID);
    // Le titre est ÉCRIT à partir de l'instruction, jamais demandé.
    expect(titleCalls).toHaveLength(1);
    expect(result.routine.title).toContain("Titre de");
    expect(result.routine.next_run_at).toBeTruthy();
    // L'échéance est devant : une routine ne naît jamais en retard.
    expect(new Date(result.routine.next_run_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("REFUSE un membre non-propriétaire — c'est le budget du owner qui part", async () => {
    const result = await createRoutine(validInput({ actorId: MEMBER_ID }) as never);
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
  });

  it("refuse un projet sans dépôt lié plutôt que de casser à chaque passage", async () => {
    world.hasRepo = false;
    const result = await createRoutine(validInput() as never);
    expect(result).toMatchObject({ ok: false, status: 409, errorKey: "noRepo" });
  });

  it("ne PAYE pas de titre pour une routine qu'on refuse", async () => {
    // Le nommage est un appel modèle : le faire avant les refus reviendrait à
    // payer pour une routine qui n'existera jamais.
    world.hasRepo = false;
    await createRoutine(validInput() as never);
    world.hasRepo = true;
    await createRoutine(validInput({ actorId: MEMBER_ID }) as never);
    await createRoutine(validInput({ timezone: "Nowhere/Here" }) as never);
    expect(titleCalls).toHaveLength(0);
  });

  it("accepte plusieurs jours de semaine", async () => {
    const result = await createRoutine(validInput({ weekdays: [4, 1, 1] }) as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Dédoublonnés et triés dès l'entrée.
    expect(result.routine.weekdays).toEqual([1, 4]);
  });

  it("refuse un weekday sur une cadence mensuelle", async () => {
    const result = await createRoutine(
      validInput({ frequency: "monthly", weekdays: [1], daysOfMonth: [] }) as never,
    );
    // La cadence mensuelle veut un jour du mois : sans lui, elle est incomplète.
    expect(result).toMatchObject({ ok: false, errorKey: "invalidSchedule" });
  });

  it("refuse un fuseau inconnu au lieu de partir en UTC", async () => {
    const result = await createRoutine(validInput({ timezone: "Europe/Pariss" }) as never);
    expect(result).toMatchObject({ ok: false, errorKey: "unknownTimezone" });
  });

  it("refuse un modèle au-dessus du plafond du plan, À L'ENREGISTREMENT", async () => {
    // Le refus doit tomber devant quelqu'un, pas à 13 h dans un cron.
    world.modelAbovePlan = true;
    const result = await createRoutine(
      validInput({ model: "anthropic/claude-opus-5" }) as never,
    );
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "modelAbovePlan" });
    if (result.ok) return;
    expect(result.modelLimit?.limit).toBe(15);
  });

  it("n'arme pas d'échéance sur une routine créée désactivée", async () => {
    const result = await createRoutine(validInput({ enabled: false }) as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.next_run_at).toBeNull();
  });
});

describe("updateRoutine", () => {
  beforeEach(() => {
    world.routines = [makeRoutine()];
  });

  it("REFUSE un membre non-propriétaire", async () => {
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: MEMBER_ID,
      prompt: "Une autre instruction.",
    });
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
  });

  it("REFAIT le titre quand l'instruction change, et seulement là", async () => {
    await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      prompt: "Une instruction toute neuve.",
    });
    expect(titleCalls).toHaveLength(1);

    // Réécrire À L'IDENTIQUE ne rappelle pas le modèle : rien n'a changé.
    titleCalls.length = 0;
    await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      prompt: "Une instruction toute neuve.",
    });
    expect(titleCalls).toHaveLength(0);

    // Déplacer l'heure non plus — le titre décrit le travail, pas l'horaire.
    await updateRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID, hour: 7 });
    expect(titleCalls).toHaveLength(0);
  });

  it("recalcule l'échéance dès qu'on touche à la cadence", async () => {
    const before = world.routines[0].next_run_at;
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      hour: 14,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.next_run_at).not.toBe(before);
    expect(new Date(result.routine.next_run_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("réarme une routine réactivée sur une échéance FUTURE", async () => {
    // Sans recalcul, réactiver ferait repartir la routine immédiatement : son
    // `next_run_at` d'origine est dans le passé.
    world.routines = [makeRoutine({ enabled: false, next_run_at: null })];
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      enabled: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.routine.next_run_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("désarme l'échéance quand on désactive", async () => {
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      enabled: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.next_run_at).toBeNull();
  });

  it("valide la cadence ENTIÈRE, pas seulement le champ qui bouge", async () => {
    // Passer une routine hebdomadaire en mensuelle sans jour du mois est
    // incohérent — et ne se voit qu'en relisant les deux champs ensemble.
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      frequency: "monthly",
    });
    expect(result).toMatchObject({ ok: false, errorKey: "invalidSchedule" });
  });
});

/**
 * La CORBEILLE des routines (MIN-201) — ce que la suppression ne détruit plus.
 *
 * C'était un `delete` sec : la ligne partait, et ses passages avec elle
 * (`agent_runs.routine_id` cascade), donc les conversations, les diffs et les
 * pull requests qui s'y lisent. Ce qui est testé ici, c'est exactement ce qui
 * rend le retour possible : la ligne RESTE, marquée, avec tout ce qu'elle
 * portait, et elle sort quand même de la liste ET du balayage du cron — une
 * routine corbeillée qui repart le lundi matin dépenserait le budget de
 * quelqu'un qui la croit supprimée.
 */
describe("deleteRoutine", () => {
  beforeEach(() => {
    world.routines = [makeRoutine()];
  });

  it("REFUSE un membre non-propriétaire", async () => {
    const result = await deleteRoutine({ routineId: ROUTINE_ID, actorId: MEMBER_ID });
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
    expect(world.routines[0].deleted_at).toBeNull();
  });

  it("ENVOIE À LA CORBEILLE au lieu de détruire", async () => {
    const result = await deleteRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID });
    expect(result).toEqual({ ok: true });
    // La ligne est là, marquée : rien de ce que la routine portait n'a bougé,
    // et ses `agent_runs` n'ont donc pas cascadé.
    expect(world.routines).toHaveLength(1);
    expect(world.routines[0].deleted_at).toBeTruthy();
    expect(world.routines[0].deleted_by).toBe(OWNER_ID);
    expect(world.routines[0].prompt).toBe(makeRoutine().prompt);
    expect(world.routines[0].next_run_at).toBe(makeRoutine().next_run_at);
  });

  it("la fait disparaître de la liste, du détail et du balayage du cron", async () => {
    await deleteRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID });
    expect(await listRoutinesForUser(OWNER_ID)).toEqual([]);
    expect(await getRoutineForUser(ROUTINE_ID, OWNER_ID)).toBeNull();
    // L'échéance reste armée pour que la restauration la rende telle quelle :
    // c'est le filtre de `dueRoutines`, et lui seul, qui l'empêche de partir.
    expect(world.routines[0].next_run_at).toBeTruthy();
    expect(await dueRoutines()).toEqual([]);
  });

  it("refuse de modifier une routine corbeillée — on la restaure d'abord", async () => {
    await deleteRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID });
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      enabled: false,
    });
    expect(result).toMatchObject({ ok: false, status: 404, errorKey: "routineNotFound" });
  });

  it("se restaure À L'IDENTIQUE depuis la corbeille", async () => {
    const before = { ...world.routines[0] };
    await deleteRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID });
    const restored = await restoreItem("routine", ROUTINE_ID, OWNER_ID);
    expect(restored).toEqual({ ok: true });
    // Cadence, instruction, modèle, échéance : la restauration ne remet que les
    // deux marqueurs, il n'y a rien d'autre à reconstruire.
    expect(world.routines[0]).toEqual({ ...before, deleted_at: null, deleted_by: null });
    expect((await listRoutinesForUser(OWNER_ID)).map((r) => r.id)).toEqual([ROUTINE_ID]);
    expect((await dueRoutines()).map((r) => r.id)).toEqual([ROUTINE_ID]);
  });

  it("REFUSE à un membre de restaurer la routine d'un autre", async () => {
    // Même garde qu'à la suppression : la corbeille ne doit pas offrir un chemin
    // de côté pour remettre en marche une dépense qui n'est pas la sienne.
    await deleteRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID });
    const result = await restoreItem("routine", ROUTINE_ID, MEMBER_ID);
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
    expect(world.routines[0].deleted_at).toBeTruthy();
  });
});

/**
 * Le PLAFOND DE DÉPENSE d'un passage — le garde-fou qui manquait : une routine
 * n'était bornée que par le quota du compte, donc un seul passage pouvait
 * prendre tout le mois. Sur un plan à 5 $ d'usage, il ne restait rien.
 */
describe("plafond de dépense", () => {
  it("pose 15 % par défaut, sans que personne ne le demande", async () => {
    // Le défaut protège le MOIS, pas seulement le pire passage : une routine
    // hebdomadaire doit tenir ses quatre passages et laisser l'essentiel au
    // travail à la main.
    const result = await createRoutine(validInput());
    expect(result).toMatchObject({ ok: true });
    expect(world.routines[0].max_spend_percent).toBe(15);
  });

  it("RAMÈNE un plafond absurde dans ses bornes plutôt que de refuser", async () => {
    // Le CHECK de la base, lui, ne pardonnerait pas — et une routine ne doit
    // pas se refuser sur un pourcentage mal écrit par une des quatre portes.
    await createRoutine(validInput({ maxSpendPercent: 400 }));
    expect(world.routines[0].max_spend_percent).toBe(100);
    world.routines = [];
    await createRoutine(validInput({ maxSpendPercent: 0 }));
    expect(world.routines[0].max_spend_percent).toBe(1);
  });

  it("se change après coup, sans toucher au reste", async () => {
    world.routines = [makeRoutine()];
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      maxSpendPercent: 25,
    });
    expect(result).toMatchObject({ ok: true });
    expect(world.routines[0].max_spend_percent).toBe(25);
    // Le titre n'a pas été repayé : seule l'instruction le refait.
    expect(titleCalls).toHaveLength(0);
  });

  it("vaut une part du budget du PLAN, pas du restant du mois", async () => {
    // Un plafond qui fondrait avec la consommation ferait travailler la routine
    // de moins en moins loin à mesure que le mois avance, sans que son réglage
    // ait bougé. Ce qui borne le restant, c'est le quota — l'autre moitié du
    // `min()` de la boucle.
    world.quota.remaining = 1;
    const budget = await routineRunBudgetUsd(makeRoutine({ max_spend_percent: 50 }));
    expect(budget).toBeCloseTo(2.5, 6);
  });

  it("ne pose AUCUN plafond à 100 % ni en BYOK", async () => {
    expect(await routineRunBudgetUsd(makeRoutine({ max_spend_percent: 100 }))).toBeNull();
    // En BYOK l'utilisateur paye ses tokens : le budget du plan ne borne plus
    // rien, et un pourcentage de ce budget lui poserait un plafond qu'il n'a pas
    // demandé. Même doctrine que le plafond de modèle.
    world.quota = { allowed: true, unlimited: true, mode: "byok", cap: undefined, remaining: undefined };
    expect(await routineRunBudgetUsd(makeRoutine({ max_spend_percent: 50 }))).toBeNull();
  });
});

describe("listRoutinesForUser", () => {
  it("LAISSE LIRE un membre non-propriétaire", async () => {
    // La lecture est ouverte : un membre doit voir ce qui tourne sur le dépôt
    // qu'il partage, même s'il ne peut ni le poser ni l'arrêter.
    world.routines = [makeRoutine()];
    const rows = await listRoutinesForUser(MEMBER_ID);
    expect(rows.map((r) => r.id)).toEqual([ROUTINE_ID]);
  });
});

describe("stampRoutineLaunched", () => {
  it("note le passage à la main SANS déplacer l'échéance", async () => {
    // « Lancer maintenant » ne passe pas par le claim du cron : sans cette
    // écriture, `last_run_at` restait sur le passage d'avant, et les deux
    // `list_routines` (chat, MCP) annonçaient la mauvaise date. L'échéance, en
    // revanche, appartient à la cadence — essayer sa routine un mardi ne doit
    // pas faire sauter le lundi suivant.
    world.routines = [makeRoutine({ next_run_at: "2030-01-07T08:00:00.000Z", last_error: "quota" })];
    await stampRoutineLaunched(ROUTINE_ID);
    expect(world.routines[0].last_run_at).toBeTruthy();
    expect(world.routines[0].last_error).toBeNull();
    expect(world.routines[0].next_run_at).toBe("2030-01-07T08:00:00.000Z");
  });
});

describe("claimRoutine", () => {
  it("réserve l'échéance et avance à la suivante", async () => {
    world.routines = [makeRoutine()];
    const result = await claimRoutine(world.routines[0]);
    expect(result.claimed).toBe(true);
    expect(new Date(result.nextRunAt as string).getTime()).toBeGreaterThan(Date.now());
    expect(world.routines[0].last_run_at).toBeTruthy();
  });

  it("perd la course quand l'échéance a déjà bougé (compare-and-set)", async () => {
    const stale = makeRoutine({ next_run_at: "2020-01-06T08:00:00.000Z" });
    // Un autre cron est passé entre-temps : la ligne ne porte plus l'échéance
    // qu'on avait lue.
    world.routines = [makeRoutine({ next_run_at: "2030-01-07T08:00:00.000Z" })];
    const result = await claimRoutine(stale);
    expect(result.claimed).toBe(false);
    expect(world.routines[0].next_run_at).toBe("2030-01-07T08:00:00.000Z");
  });

  it("ne RATTRAPE pas les passages manqués", async () => {
    // Trois jours sans budget : la routine repart sur la prochaine occurrence
    // réelle, elle ne joue pas trois fois.
    world.routines = [makeRoutine({ frequency: "daily", weekdays: [] })];
    const result = await claimRoutine(world.routines[0]);
    expect(result.claimed).toBe(true);
    const next = new Date(result.nextRunAt as string).getTime();
    expect(next).toBeGreaterThan(Date.now());
    expect(next - Date.now()).toBeLessThanOrEqual(25 * 3600_000);
  });
});
