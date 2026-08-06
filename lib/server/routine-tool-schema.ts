import "server-only";

import { ROUTINE_FREQUENCIES } from "@/lib/routine-schedule";
import { REASONING_LEVELS } from "@/lib/agent-reasoning";

/**
 * Le SCHÉMA du tool `create_routine`, écrit une fois (MIN-185).
 *
 * Trois surfaces le servent — le chat Numo, l'agent Numo dans sa sandbox, et le
 * MCP (qui le redécrit en zod, parce que son SDK l'exige, mais avec les mêmes
 * phrases). La description ne peut pas être trois fois différente : c'est elle
 * qui dit ce qu'une routine EST, et un modèle qui lit trois définitions d'une
 * même chose en invente une quatrième.
 *
 * Ce que la description doit absolument porter, et qui n'est écrit nulle part
 * ailleurs pour le modèle :
 *  - **ce n'est PAS un ticket récurrent** (`recurrence` sur un ticket) ni une
 *    automatisation de projet (`quand … alors …`). Les trois se ressemblent de
 *    loin ; un client qui les confond crée la mauvaise chose ;
 *  - **elle part seule et ne pourra rien demander** — l'`ask_user` lui est
 *    retiré par le jeu de tools. L'instruction doit donc se suffire ;
 *  - **elle a le mandat d'ouvrir une pull request** sans qu'on le lui demande ;
 *  - **seul le propriétaire du projet peut en poser une** ;
 *  - **le fuseau ne se devine pas**.
 */

const FREQUENCY_VALUES = [...ROUTINE_FREQUENCIES];

export const CREATE_ROUTINE_DESCRIPTION =
  "Create a ROUTINE: a named job that minddy's coding agent runs BY ITSELF on a " +
  "schedule, in a sandbox on the project's linked repository — a security review " +
  "every Monday, a dependency sweep on the first of the month, a monthly inventory " +
  "of something. It is NOT a recurring ticket (that is an issue with a `recurrence`) " +
  "and NOT a project automation (those react to an event): nothing triggers it but " +
  "the clock, and it produces a real agent run with its own streaming, sandbox and " +
  "tools. `prompt` IS the instruction the agent receives, so WRITE it from the " +
  "user's request rather than copying their sentence — nobody will be at the screen " +
  "to clarify it: the routine CANNOT ask questions, it decides and documents its " +
  "choice. It MAY open a pull request on its own when it finds something worth " +
  "fixing, and simply concludes when it does not. OWNER ONLY: only the project's " +
  "owner can create a routine, because it is their usage budget that leaves every " +
  "Monday morning — a member gets a refusal, and there is no way around it. The " +
  "model is chosen PER ROUTINE and frozen on it: a security review deserves the " +
  "strongest model, a monthly inventory the cheapest. Its spend is billed under " +
  "'Routines', separately from agent runs.";

export const UPDATE_ROUTINE_DESCRIPTION =
  "Change an existing routine: turn it on or off (`enabled`), move its cadence, " +
  "swap its model or rewrite its instruction. OWNER ONLY. Touching the cadence or " +
  "re-enabling it recomputes the next run — so 'move it to 7am' takes effect at the " +
  "NEXT occurrence, not at the one already scheduled. Get the id from list_routines.";

export const LIST_ROUTINES_DESCRIPTION =
  "List the routines of a project: id, title, instruction, cadence in plain fields, " +
  "model, whether it is enabled, when it last ran and when it runs next, and the " +
  "code of the last missed run (an exhausted usage budget, an unlinked repository). " +
  "Call it before creating one, to reuse or adjust what is already scheduled instead " +
  "of stacking a second routine that does the same job.";

/** Champs de cadence — partagés par `create_routine` et `update_routine`. */
export const ROUTINE_SCHEDULE_PROPERTIES: Record<string, unknown> = {
  frequency: {
    type: "string",
    enum: FREQUENCY_VALUES,
    description:
      "How often it runs: 'daily', 'weekly' (then pass weekday) or 'monthly' (then " +
      "pass day_of_month).",
  },
  hour: {
    type: "number",
    description: "Hour of the run, 0–23, IN `timezone`. Ask or default to 9 (morning).",
  },
  minute: {
    type: "number",
    description: "Minute of the run, 0–59. Defaults to 0.",
  },
  weekday: {
    type: "number",
    description:
      "Day of the week for a 'weekly' routine: 0 = Sunday, 1 = Monday … 6 = Saturday. " +
      "Required for 'weekly', REFUSED on the other cadences.",
  },
  day_of_month: {
    type: "number",
    description:
      "Day of the month for a 'monthly' routine, 1–31. On a shorter month it falls " +
      "back to the last day (31 in February means the 28th), never skips the month. " +
      "Required for 'monthly', REFUSED on the other cadences.",
  },
  timezone: {
    type: "string",
    description:
      "IANA timezone the hour is expressed in ('Europe/Paris', 'America/New_York'). " +
      "Pass the USER'S timezone — it is in your context; never guess one and never " +
      "default to UTC, or the routine runs hours off every single time. An unknown " +
      "name is refused.",
  },
};

/** Paramètres complets de `create_routine`. */
export const CREATE_ROUTINE_PARAMETERS = {
  type: "object" as const,
  properties: {
    title: {
      type: "string",
      description:
        "Short name shown in the Routines tab, e.g. 'Weekly security review'. Write it " +
        "yourself from the request; do not ask for it.",
    },
    prompt: {
      type: "string",
      description:
        "The INSTRUCTION the agent receives at every run, in the user's language. It " +
        "must stand on its own: say what to look at, what counts as a finding, and " +
        "what to do with one (open a pull request, or just report). The agent cannot " +
        "ask you anything once it has started.",
    },
    ...ROUTINE_SCHEDULE_PROPERTIES,
    model: {
      type: "string",
      description:
        "Exact model id to run this routine on, FROZEN on it. Pass one only when the " +
        "user names a model — resolve the exact id with list_agent_models first. Omit " +
        "to use their default.",
    },
    reasoning_level: {
      type: "string",
      enum: [...REASONING_LEVELS],
      description: "Reasoning effort of the runs. Omit for the user's default.",
    },
    base_branch: {
      type: "string",
      description: "Branch the runs start from. Omit for the repository's default branch.",
    },
  } as Record<string, unknown>,
  // `minute`, `weekday` et `day_of_month` restent hors du requis : les deux
  // derniers dépendent de la cadence, et un champ requis mais interdit selon la
  // fréquence est un piège. Tout le reste EST requis — un petit modèle ne
  // remplit pas un champ optionnel, et `timezone` absent fait partir la routine
  // trois heures à côté sans que personne ne le voie.
  required: ["title", "prompt", "frequency", "hour", "timezone"],
};

/** Paramètres de `update_routine` — tout est optionnel sauf la cible. */
export const UPDATE_ROUTINE_PARAMETERS = {
  type: "object" as const,
  properties: {
    routine_id: { type: "string", description: "Routine id, from list_routines." },
    title: { type: "string", description: "New name." },
    prompt: { type: "string", description: "New instruction (REPLACES the current one)." },
    enabled: {
      type: "boolean",
      description:
        "false pauses the routine without deleting it (its past runs stay readable); " +
        "true re-arms it on its next occurrence.",
    },
    ...ROUTINE_SCHEDULE_PROPERTIES,
    model: { type: "string", description: "New exact model id, or null to use the default." },
    reasoning_level: { type: "string", enum: [...REASONING_LEVELS] },
    base_branch: { type: "string", description: "New base branch." },
  } as Record<string, unknown>,
  required: ["routine_id"],
};
