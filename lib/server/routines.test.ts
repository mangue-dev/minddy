import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantMention } from "@/lib/assistant-types";

/**
 * The FACTORY of routines (MIN-185) — what the four gates do not revalidate
 *. What is tested here is exactly what, forgotten in one of the doors,
 * would only be seen once the routine has left on its own: the owner guard, the
 * consistency of the cadence, the plan model ceiling, the linked deposit, and the
 * rearmament which recalculates the deadline instead of leaving it expired.
 *
 * The fake Supabase carries the three core tables (`agent_routines`,
 * `projects`, `project_members`) and REALLY applies the filters: without that, the
 * compare-and-set of the claim would say nothing about the race it is supposed to lose.
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
  prompt_mentions: AssistantMention[];
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
  /** Does the project have a linked repository? */
  hasRepo: true,
  /** Does the requested model exceed the plan ceiling? */
  modelAbovePlan: false,
  /** Owner quota — `cap` is the plan's monthly budget (GB: $5). */
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
    prompt_mentions: [],
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
        // `getProjectAccess` reads the project; `listRoutinesForUser` reads
        // owned projects.
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

// The little model that NAMES the routine: we don't really call it, but
// we count its passages - the title must be redone when the instruction changes,
// and only there.
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
    // Title is WRITTEN from statement, never requested.
    expect(titleCalls).toHaveLength(1);
    expect(result.routine.title).toContain("Titre de");
    expect(result.routine.next_run_at).toBeTruthy();
    // The deadline is ahead: a routine is never born late.
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
    // Naming is a model call: doing it before refusals would amount to
    // pay for a routine that will never exist.
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
    // Deduplicated and sorted upon entry.
    expect(result.routine.weekdays).toEqual([1, 4]);
  });

  it("refuse un weekday sur une cadence mensuelle", async () => {
    const result = await createRoutine(
      validInput({ frequency: "monthly", weekdays: [1], daysOfMonth: [] }) as never,
    );
    // The monthly cadence requires one day of the month: without it, it is incomplete.
    expect(result).toMatchObject({ ok: false, errorKey: "invalidSchedule" });
  });

  it("refuse un fuseau inconnu au lieu de partir en UTC", async () => {
    const result = await createRoutine(validInput({ timezone: "Europe/Pariss" }) as never);
    expect(result).toMatchObject({ ok: false, errorKey: "unknownTimezone" });
  });

  it("refuse un modèle au-dessus du plafond du plan, À L'ENREGISTREMENT", async () => {
    // The refusal must come in front of someone, not at 1 p.m. in a cron.
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

  it("persists resolved prompt mentions", async () => {
    const promptMentions = [
      { type: "issue" as const, id: "issue-42", label: "MIN-42" },
    ];
    const result = await createRoutine(
      validInput({ prompt: "Review @MIN-42", promptMentions }) as never,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routine.prompt_mentions).toEqual(promptMentions);
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

  it("updates resolved prompt mentions with the instruction", async () => {
    const promptMentions = [
      { type: "page" as const, id: "page-guide", label: "Guide" },
    ];
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      prompt: "Follow @Guide",
      promptMentions,
    });
    expect(result.ok).toBe(true);
    expect(world.routines[0].prompt_mentions).toEqual(promptMentions);
  });

  it("clears stale mentions when a non-UI caller replaces the instruction", async () => {
    world.routines = [
      makeRoutine({
        prompt_mentions: [{ type: "issue", id: "issue-42", label: "MIN-42" }],
      }),
    ];
    await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      prompt: "Review the repository without a ticket reference.",
    });
    expect(world.routines[0].prompt_mentions).toEqual([]);
  });

  it("REFAIT le titre quand l'instruction change, et seulement là", async () => {
    await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      prompt: "Une instruction toute neuve.",
    });
    expect(titleCalls).toHaveLength(1);

    // Rewriting THE IDENTICAL does not recall the model: nothing has changed.
    titleCalls.length = 0;
    await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      prompt: "Une instruction toute neuve.",
    });
    expect(titleCalls).toHaveLength(0);

    // Move the time either — the title describes the job, not the schedule.
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
    // Without recalculation, reactivating would restart the routine immediately: its
    // Original `next_run_at` is in the past.
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
    // Switching a weekly routine to monthly without a day of the month is
    // incoherent — and can only be seen by rereading the two fields together.
    const result = await updateRoutine({
      routineId: ROUTINE_ID,
      actorId: OWNER_ID,
      frequency: "monthly",
    });
    expect(result).toMatchObject({ ok: false, errorKey: "invalidSchedule" });
  });
});

/**
 * The TRASH of routines (MIN-201) — what deletion no longer destroys.
 *
 * It was a dry `delete`: the line left, and its passages with it
 * (`agent_runs.routine_id` cascade), therefore the conversations, the diffs and the
 * pull requests that read there. What is being tested here is exactly what
 * makes the return possible: the line REMAINS, marked, with whatever it
 * carried, and it still comes out of the list AND the cron scan — a trashed
 * routine that restarts on Monday morning would spend the budget of
 * anyone who believes it deleted.
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
    // The line is there, marked: nothing that the routine carried has moved,
    // and its `agent_runs` therefore did not cascade.
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
    // The deadline remains set so that the restoration returns it as it is:
    // it is the `dueRoutines` filter, and it alone, which prevents it from leaving.
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
    // Cadence, instruction, model, deadline: the restoration only restores the
    // two markers, there is nothing else to rebuild.
    expect(world.routines[0]).toEqual({ ...before, deleted_at: null, deleted_by: null });
    expect((await listRoutinesForUser(OWNER_ID)).map((r) => r.id)).toEqual([ROUTINE_ID]);
    expect((await dueRoutines()).map((r) => r.id)).toEqual([ROUTINE_ID]);
  });

  it("REFUSE à un membre de restaurer la routine d'un autre", async () => {
    // Same guard as for deletion: the trash must not offer a path
    // aside to restart an expense that is not yours.
    await deleteRoutine({ routineId: ROUTINE_ID, actorId: OWNER_ID });
    const result = await restoreItem("routine", ROUTINE_ID, MEMBER_ID);
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "ownerOnly" });
    expect(world.routines[0].deleted_at).toBeTruthy();
  });
});

/**
 * The SPENDING LIMIT of a pass — the safeguard that was missing: a routine
 * was limited only by the account quota, so a single pass could take
 * the whole month. On a $5 usage plan, there was nothing left.
 */
describe("plafond de dépense", () => {
  it("pose 15 % par défaut, sans que personne ne le demande", async () => {
    // The default protects the MONTH, not just the worst passage: a routine
    // weekly must hold its four passages and leave the essential to
    // hand work.
    const result = await createRoutine(validInput());
    expect(result).toMatchObject({ ok: true });
    expect(world.routines[0].max_spend_percent).toBe(15);
  });

  it("RAMÈNE un plafond absurde dans ses bornes plutôt que de refuser", async () => {
    // The CHECK of the base would not forgive — and a routine should not
    // not refuse a percentage poorly written by one of the four doors.
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
    // The title has not been repaid: only the instruction does it again.
    expect(titleCalls).toHaveLength(0);
  });

  it("vaut une part du budget du PLAN, pas du restant du mois", async () => {
    // A ceiling that would melt with consumption would make routine work
    // less and less far as the month progresses, without its setting
    // moved. What limits the remainder is the quota — the other half of the
    // `min()` of the loop.
    world.quota.remaining = 1;
    const budget = await routineRunBudgetUsd(makeRoutine({ max_spend_percent: 50 }));
    expect(budget).toBeCloseTo(2.5, 6);
  });

  it("ne pose AUCUN plafond à 100 % ni en BYOK", async () => {
    expect(await routineRunBudgetUsd(makeRoutine({ max_spend_percent: 100 }))).toBeNull();
    // In BYOK the user pays for his tokens: the budget of the plan is no longer limited
    // nothing, and a percentage of this budget would put a ceiling on it that it does not have
    // request. Same doctrine as the model cap.
    world.quota = { allowed: true, unlimited: true, mode: "byok", cap: undefined, remaining: undefined };
    expect(await routineRunBudgetUsd(makeRoutine({ max_spend_percent: 50 }))).toBeNull();
  });
});

describe("listRoutinesForUser", () => {
  it("LAISSE LIRE un membre non-propriétaire", async () => {
    // Reading is open: a member must see what is running on the repository
    // that he shares, even if he can neither put it down nor stop it.
    world.routines = [makeRoutine()];
    const rows = await listRoutinesForUser(MEMBER_ID);
    expect(rows.map((r) => r.id)).toEqual([ROUTINE_ID]);
  });
});

describe("stampRoutineLaunched", () => {
  it("note le passage à la main SANS déplacer l'échéance", async () => {
    // “Launch now” does not go through the cron claim: without this
    // writing, `last_run_at` remained on the passage before, and both
    // `list_routines` (cat, MCP) announced the wrong date. The deadline, in
    // on the other hand, belongs to the cadence — trying your routine on a Tuesday should not
    // not blow up the following Monday.
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
    // Another cron has passed in the meantime: the line no longer has the deadline
    // qu'on avait lue.
    world.routines = [makeRoutine({ next_run_at: "2030-01-07T08:00:00.000Z" })];
    const result = await claimRoutine(stale);
    expect(result.claimed).toBe(false);
    expect(world.routines[0].next_run_at).toBe("2030-01-07T08:00:00.000Z");
  });

  it("ne RATTRAPE pas les passages manqués", async () => {
    // Three days without a budget: the routine starts again on the next occurrence
    // real, it doesn't play three times.
    world.routines = [makeRoutine({ frequency: "daily", weekdays: [] })];
    const result = await claimRoutine(world.routines[0]);
    expect(result.claimed).toBe(true);
    const next = new Date(result.nextRunAt as string).getTime();
    expect(next).toBeGreaterThan(Date.now());
    expect(next - Date.now()).toBeLessThanOrEqual(25 * 3600_000);
  });
});
