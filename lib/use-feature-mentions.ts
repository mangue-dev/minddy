"use client";

// The targets MIN-872 adds to the "@" menu: pull requests, routines, the task
// notebook, cycles, connected MCP servers and the project's repository skills.
//
// None of them loads with the editor. They are read once the reader types
// "@" (`arm`), so a description that is only read never pays for a pull
// request list or a repository scan. A pill already written does not wait for
// them either: it resolves its label from the server (lib/mention-resolution.ts).

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { SCRATCHPAD_MENTION_ID, type MentionMeta } from "@/lib/mention-link";
import { useMcpConnections } from "@/lib/use-mcp-connections";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import { useRepositorySkills } from "@/lib/use-repository-skills";
import { useRoutinesQuery } from "@/lib/use-routines-query";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionTargetType } from "@/lib/mention-target";
import type { CycleInfo } from "@/lib/types";

interface MentionPullRequest {
  prId: string;
  pr_number: number;
  pr_state: string;
  title: string | null;
}

/** One page of pull requests in a state, as the Pull requests screen reads it. */
async function fetchPullRequests(state: "open" | "completed"): Promise<MentionPullRequest[]> {
  const response = await fetch(`/api/pull-requests?state=${state}${state === "open" ? "&limit=100" : ""}`);
  if (!response.ok) throw new Error("Could not load pull requests");
  const body = (await response.json()) as { pullRequests?: MentionPullRequest[] };
  return body.pullRequests ?? [];
}

/** A skill's mention id: the folder that holds its `SKILL.md`. */
export function skillMentionId(path: string): string | null {
  const folder = path.split("/").at(-2) ?? "";
  return /^[A-Za-z0-9_.-]{1,64}$/.test(folder) ? folder : null;
}

/** A cycle as its pill reads it before the server answers: the same text. */
export const cycleMentionLabel = (cycle: CycleInfo) => `Cycle ${cycle.start_date} → ${cycle.end_date}`;

/** Two projects may name a skill alike: its project is part of its key. */
const keyOf = (type: MentionTargetType, id: string, meta?: MentionMeta) =>
  type === "skill" ? `skill:${meta?.project}/${id}` : `${type}:${id}`;

/** `26 oct. – 8 nov.`: a cycle's window as its menu line reads it. */
function cycleWindow(cycle: CycleInfo, locale: string): string {
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const day = (value: string) => {
    const [year, month, date] = value.split("-").map(Number);
    return format.format(new Date(year, month - 1, date));
  };
  return `${day(cycle.start_date)} – ${day(cycle.end_date)}`;
}

const NO_ROUTINES: Array<{ id: string; project_id: string; title: string }> = [];

export interface FeatureMentions {
  /** What the menu offers, once armed; skills only inside a project. */
  options: MentionOption[];
  /** The label of a target these sources hold, `null` otherwise. */
  label: (type: MentionTargetType, id: string, meta?: MentionMeta) => string | null;
  /** A skill's description, for its pill's tooltip. */
  detail: (type: MentionTargetType, id: string, meta?: MentionMeta) => string | null;
  /** The first "@": load the sources. */
  arm: () => void;
}

/**
 * The MIN-872 mention sources of a surface. `projectId` is the surface's
 * project: skills are offered only there, as members are. `offeredProject`
 * keeps routines to the projects the reader may be offered (MIN-751).
 */
export function useFeatureMentions(
  projectId: string | null | undefined,
  offeredProject: (projectId: string) => boolean,
): FeatureMentions {
  const t = useTranslations("Common");
  const locale = useLocale();
  const { user } = useAuth();
  const [armed, setArmed] = useState(false);
  const arm = useCallback(() => setArmed(true), []);

  const { routines } = useRoutinesQuery({ enabled: armed });
  const { cyclesEnabled, currentCycle, upcomingCycles } = useMyCycleQuery();
  const { data: mcp } = useMcpConnections(armed ? user?.id : undefined);
  const { skills } = useRepositorySkills(armed ? (projectId ?? null) : null, "cloud", "mention");
  // Open pull requests first; the completed ones follow once those arrived.
  const open = useQuery({
    queryKey: ["mention-pull-requests", "open"],
    queryFn: () => fetchPullRequests("open"),
    enabled: armed,
    staleTime: 5 * 60_000,
  });
  const completed = useQuery({
    queryKey: ["mention-pull-requests", "completed"],
    queryFn: () => fetchPullRequests("completed"),
    enabled: armed && open.isSuccess,
    staleTime: 5 * 60_000,
  });

  const pullRequests = useMemo(
    () => [...(open.data ?? []), ...(completed.data ?? [])],
    [open.data, completed.data],
  );
  const visibleRoutines = useMemo(
    () => (armed ? routines : NO_ROUTINES).filter((routine) => offeredProject(routine.project_id)),
    [armed, routines, offeredProject],
  );
  const cycles = useMemo(
    () => (cyclesEnabled ? [...(currentCycle ? [currentCycle] : []), ...upcomingCycles] : []),
    [cyclesEnabled, currentCycle, upcomingCycles],
  );
  const projectSkills = useMemo(
    () => (projectId
      ? skills.flatMap((skill) => {
          const id = skillMentionId(skill.path);
          return id ? [{ id, name: skill.name, description: skill.description }] : [];
        })
      : []),
    [projectId, skills],
  );
  const connections = useMemo(
    () => (mcp?.connections ?? []).filter((connection) => connection.enabled),
    [mcp?.connections],
  );

  const options = useMemo<MentionOption[]>(() => {
    if (!armed) return [];
    const scratchpad: MentionOption = {
      type: "scratchpad",
      id: SCRATCHPAD_MENTION_ID,
      label: t("mentionScratchpad"),
    };
    return [
      scratchpad,
      ...cycles.map((cycle) => ({
        type: "cycle" as const,
        id: cycle.id,
        label: cycle === currentCycle ? t("mentionCurrentCycle") : t("mentionUpcomingCycle"),
        detail: cycleWindow(cycle, locale),
        keywords: [t("mentionCycle")],
      })),
      ...visibleRoutines.map((routine) => ({ type: "routine" as const, id: routine.id, label: routine.title })),
      ...projectSkills.map((skill) => ({
        type: "skill" as const,
        id: skill.id,
        label: skill.name,
        detail: skill.description,
        meta: { project: projectId as string },
        keywords: [skill.id],
      })),
      ...connections.map((connection) => ({ type: "mcp" as const, id: connection.id, label: connection.name })),
      ...pullRequests.map((pr) => ({
        type: "pull_request" as const,
        id: pr.prId,
        label: `#${pr.pr_number}`,
        detail: pr.title ?? undefined,
        keywords: pr.title ? [pr.title] : [],
      })),
    ];
  }, [armed, t, locale, cycles, currentCycle, visibleRoutines, projectSkills, projectId, connections, pullRequests]);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const routine of visibleRoutines) map.set(`routine:${routine.id}`, routine.title);
    for (const cycle of cycles) map.set(`cycle:${cycle.id}`, cycleMentionLabel(cycle));
    for (const connection of connections) map.set(`mcp:${connection.id}`, connection.name);
    for (const pr of pullRequests) map.set(`pull_request:${pr.prId}`, `#${pr.pr_number}${pr.title ? ` ${pr.title}` : ""}`);
    for (const skill of projectSkills) map.set(`skill:${projectId}/${skill.id}`, skill.name);
    return map;
  }, [visibleRoutines, cycles, connections, pullRequests, projectSkills, projectId]);
  const details = useMemo(
    () => new Map(projectSkills.map((skill) => [`skill:${projectId}/${skill.id}`, skill.description])),
    [projectSkills, projectId],
  );

  const label = useCallback(
    (type: MentionTargetType, id: string, meta?: MentionMeta) => labels.get(keyOf(type, id, meta)) ?? null,
    [labels],
  );
  const detail = useCallback(
    (type: MentionTargetType, id: string, meta?: MentionMeta) => details.get(keyOf(type, id, meta)) || null,
    [details],
  );
  return useMemo(() => ({ options, label, detail, arm }), [options, label, detail, arm]);
}
