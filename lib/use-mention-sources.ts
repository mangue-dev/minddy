"use client";

// What a DESCRIPTION can cite: project people, tickets and
// objectives of all my projects, and the wiki pages of this one.
//
// The source of tickets and goals is the palette index
// (lib/use-search-index): it already carries each ticket and each objective of
// each project, it loads once per tab off the critical path, and it
// is shared. Citing a ticket therefore costs no additional query — that's what
// which makes the cross-project mention affordable where everyone's tickets can be loaded
// projects would not.
//
// COURANT project caches take precedence over the index snapshot, as for
// the palette (lib/palette-index-merge): a ticket created ten seconds ago is
// immediately quotable, and a deleted ticket ceases to be cited.

import { useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppNavigation, useAppRouter } from "@/lib/use-app-router";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { contentMentionScanner } from "@/lib/mention-scan";
import {
  mentionNavigationTarget,
  mentionProjectLookup,
  mentionTargetPath,
} from "@/lib/mention-target";
import { mergeByProject } from "@/lib/palette-index-merge";
import { useProjects } from "@/lib/projects-context";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useSearchIndex } from "@/lib/use-search-index";
import { useOfferedProject } from "@/lib/use-offered-projects";
import { useIssuePanelActions } from "@/lib/issue-panel-context";
import { pagesHref, pushPagesHistory } from "@/lib/pages-navigation";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { MentionLinks } from "@/components/mention-links";
import type { MentionOption } from "@/components/mention-suggest";
import type {
  MentionIssue,
  MentionObjective,
  MentionPage,
  MentionProject,
} from "@/lib/mention-scan";
import type { Member } from "@/lib/types";

const NO_PAGES: MentionPage[] = [];

function sameMentionPages(a: MentionPage[], b: MentionPage[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (page, i) =>
        page.id === b[i].id &&
        page.project_id === b[i].project_id &&
        page.title === b[i].title &&
        page.icon === b[i].icon
    )
  );
}

export interface MentionSources {
  projects: MentionProject[];
  issues: MentionIssue[];
  objectives: MentionObjective[];
  /** The COURANT project wiki pages (MIN-273). They do not come from
      the palette index: quoting a page from another project makes no sense —
      a wiki belongs to his project, and its title is unique only to him. */
  pages: MentionPage[];
  /** What a picker may PROPOSE (MIN-751): the same lists without my hidden
      projects, except the one on screen. The complete lists above keep
      resolving the mentions already written. */
  offered: {
    projects: MentionProject[];
    issues: MentionIssue[];
    objectives: MentionObjective[];
  };
  /** Request the index right away — call at the first “@” typed, rather
      than to wait for the dead time which usually arms it. */
  armNow: () => void;
}

/**
 * Citable tickets and objectives, with STABLE ID from one rendering to another: this is
 * this identity that the markdown rendering scanner and the list of
 * editor's suggestions. Rebuilding them on each render would make it rest
 * the content under the caret.
 *
 * `projectId` is the current project, when the surface has one. The search
 * snapshot remains usable without mounting the three exact project queries;
 * callers can defer those queries until a mention picker is actually used.
 */
export function useMentionSources(
  projectId?: string | null,
  loadExactProjectData: boolean = true,
): MentionSources {
  const { index, armNow } = useSearchIndex();
  const { projects } = useProjects();
  const exactProjectId = loadExactProjectData ? (projectId ?? null) : null;
  const { issues: freshIssues, loading: issuesLoading } =
    useIssuesQuery(exactProjectId);
  const { objectives: freshObjectives, loading: objectivesLoading } =
    useObjectivesQuery(exactProjectId);
  const { pages: projectPages, loading: pagesLoading } =
    usePagesQuery(exactProjectId);

  const keyByProject = useMemo(
    () => new Map(projects.map((p) => [p.id, p.key])),
    [projects],
  );

  const mentionProjects = useMemo<MentionProject[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        key: project.key,
        avatarSeed: projectOrbSeed(project),
        iconUrl: project.icon_url,
      })),
    [projects],
  );

  const issues = useMemo<MentionIssue[]>(() => {
    const rows = mergeByProject(
      index?.issues ?? [],
      projectId ?? null,
      exactProjectId && !issuesLoading ? freshIssues : null,
    );
    return rows.flatMap((row) => {
      // Without its project key, a ticket has no identifier — therefore nothing
      // to write after the at sign. It leaves the list rather than entering it
      // under shaky wording.
      const key = keyByProject.get(row.project_id);
      if (!key) return [];
      return [
        {
          id: row.id,
          project_id: row.project_id,
          identifier: issueIdentifier(key, row.number),
          title: row.title,
          status: row.status,
        },
      ];
    });
  }, [index?.issues, projectId, exactProjectId, issuesLoading, freshIssues, keyByProject]);

  const objectives = useMemo<MentionObjective[]>(() => {
    const rows = mergeByProject(
      index?.objectives ?? [],
      projectId ?? null,
      exactProjectId && !objectivesLoading ? freshObjectives : null,
    );
    return rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      color: row.color,
    }));
  }, [
    index?.objectives,
    projectId,
    exactProjectId,
    objectivesLoading,
    freshObjectives,
  ]);

  // Every save acknowledgement patches `version` and `updated_at` into the
  // pages list, which a mention never reads. Keep the previous list while the
  // cited fields are unchanged, so the options, the scanner and the links do
  // not rebuild for a save.
  const previousPages = useRef<MentionPage[]>(NO_PAGES);
  const pages = useMemo<MentionPage[]>(() => {
    const rows = !projectId
      ? []
      : exactProjectId && !pagesLoading
        ? projectPages
        : (index?.pages ?? []).filter((page) => page.project_id === projectId);
    const next = rows.map((page) => ({
      id: page.id,
      project_id: page.project_id,
      title: page.title,
      icon: page.icon,
    }));
    return sameMentionPages(previousPages.current, next) ? previousPages.current : next;
  }, [projectId, exactProjectId, pagesLoading, projectPages, index?.pages]);
  previousPages.current = pages;

  const isOffered = useOfferedProject(projectId);
  const offeredProjects = useMemo(() => offeredRows(mentionProjects, (p) => isOffered(p.id)), [mentionProjects, isOffered]);
  const offeredIssues = useMemo(() => offeredRows(issues, (i) => isOffered(i.project_id)), [issues, isOffered]);
  const offeredObjectives = useMemo(
    () => offeredRows(objectives, (o) => isOffered(o.project_id)),
    [objectives, isOffered],
  );
  const offered = useMemo(
    () => ({ projects: offeredProjects, issues: offeredIssues, objectives: offeredObjectives }),
    [offeredProjects, offeredIssues, offeredObjectives],
  );

  return { projects: mentionProjects, issues, objectives, pages, offered, armNow };
}

/** `rows` itself when nothing is left out, so its consumers keep their identity. */
function offeredRows<T>(rows: T[], keep: (row: T) => boolean): T[] {
  const kept = rows.filter(keep);
  return kept.length === rows.length ? rows : kept;
}

/**
 * Where does each quotable element lead — the project of a ticket, a goal or
 * of a page, resolved by its id.
 *
 * The resolution is done by READING and not by putting the pill: the node does not
 * carries only the type and the id (see components/mention-node.ts), and this is what
 * makes a mention written before this navigation click just as much.
 * A mention whose element is not in the sources — the index is not
 * yet arrived, the ticket belongs to a project that we left — returns `null`
 * and rest of the text.
 */
const NO_MEMBERS: Member[] = [];
const NO_PROJECTS: Array<{ id: string; name: string }> = [];

export function useMentionLinksFor(
  sources: {
    issues: MentionIssue[];
    objectives: MentionObjective[];
    pages: MentionPage[];
    /** People and projects the surface already shows, so their pills need
     no server round trip (MIN-734). */
    members?: Member[];
    projects?: Array<{ id: string; name: string }>;
    references?: Parameters<typeof mentionProjectLookup>[0]["references"];
  },
  onOpenIssue?: (projectId: string, issueId: string) => void,
): MentionLinks {
  const router = useAppRouter();
  const openDestination = useAppNavigation();
  const pathname = usePathname();
  const { openIssue, closeIssue } = useIssuePanelActions();
  const { issues, objectives, pages, references } = sources;
  const members = sources.members ?? NO_MEMBERS;
  const projects = sources.projects ?? NO_PROJECTS;

  const projectOf = useMemo(
    () => mentionProjectLookup({ issues, objectives, pages, references }),
    [issues, objectives, pages, references],
  );

  return useMemo<MentionLinks>(() => {
    const href: MentionLinks["href"] = (type, id) =>
      mentionTargetPath(type, id, projectOf(type, id));
    const statusByIssueId = new Map(issues.map((issue) => [issue.id, issue.status]));
    const titleByIssueId = new Map(issues.map((issue) => [issue.id, issue.title]));
    const labels = new Map<string, string>([
      ...issues.map((issue) => [`issue:${issue.id}`, issue.identifier] as [string, string]),
      ...objectives.map((objective) => [`objective:${objective.id}`, objective.name] as [string, string]),
      ...pages.filter((page) => page.title.trim())
        .map((page) => [`page:${page.id}`, page.title] as [string, string]),
      ...members.map((member) => [`member:${member.user_id}`, displayName(member)] as [string, string]),
      ...projects.map((project) => [`project:${project.id}`, project.name] as [string, string]),
    ]);
    return {
      href,
      issueStatus: (id) => statusByIssueId.get(id) ?? null,
      issueTitle: (id) => titleByIssueId.get(id) || null,
      label: (type, id) => labels.get(`${type}:${id}`) ?? null,
      navigate: (type, id) => {
        const target = mentionNavigationTarget(type, id, projectOf(type, id));
        if (!target) return;
        if (target.kind === "issue-panel") {
          (onOpenIssue ?? openIssue)(target.projectId, target.issueId);
        } else {
          closeIssue();
          const targetProjectId = projectOf(type, id);
          const base = targetProjectId ? pagesHref(targetProjectId) : null;
          if (
            type === "page" &&
            base &&
            (pathname === base || pathname.startsWith(`${base}/`))
          ) {
            openDestination(target.href, () => pushPagesHistory(target.href));
          } else {
            router.push(target.href);
          }
        }
      },
    };
  }, [projectOf, issues, objectives, pages, members, projects, router, openDestination, pathname, onOpenIssue, openIssue, closeIssue]);
}

/**
 * What to pass to `<DocumentEditor mentions={…} />`: the proposed list
 * after the “@”, and the rule which rereads a text already written.
 *
 * The two lists are not the same, and that is intentional. We PROPOSE the members
 * of the project where we write — quoting someone who does not have access to it does not
 * would not warn, and the server would dismiss the notification. We RELIT in
 * on the other hand everything that could have been cited, including from another project: a
 * description imported or moved must keep his pills.
 */
export function useDescriptionMentions(
  projectId: string | null | undefined,
  members: Member[],
  onOpenIssue?: (projectId: string, issueId: string) => void,
): DocumentEditorMentions {
  const { projects, issues, objectives, pages, offered, armNow } =
    useMentionSources(projectId);
  const links = useMentionLinksFor({ issues, objectives, pages, members, projects }, onOpenIssue);

  // Split from the pages: renaming a page rebuilds its few rows, not the
  // thousands of ticket rows of the index.
  const entityOptions = useMemo<MentionOption[]>(
    () => [
      ...members.map((m) => ({
        type: "member" as const,
        id: m.user_id,
        label: displayName(m),
        avatarSeed: m.avatar_seed,
        keywords: m.email ? [m.email] : [],
      })),
      // Only what I may be offered (MIN-751); the scan and the links below
      // still resolve every mention already written.
      ...offered.projects.map((project) => ({
        type: "project" as const,
        id: project.id,
        label: project.name,
        avatarSeed: project.avatarSeed,
        iconUrl: project.iconUrl,
        keywords: [project.key],
      })),
      ...offered.issues.map((i) => ({
        type: "issue" as const,
        id: i.id,
        label: i.identifier,
        detail: i.title,
        status: i.status,
        keywords: [i.title],
      })),
      ...offered.objectives.map((o) => ({
        type: "objective" as const,
        id: o.id,
        label: o.name,
        color: o.color,
      })),
    ],
    [members, offered],
  );
  const options = useMemo<MentionOption[]>(
    () => [
      ...entityOptions,
      // A page WITHOUT A TITLE is not quotable: “@” followed by nothing denotes
      // nothing, and the pill would appear empty.
      ...pages
        .filter((p) => p.title.trim())
        .map((p) => ({
          type: "page" as const,
          id: p.id,
          label: p.title,
          icon: p.icon,
        })),
    ],
    [entityOptions, pages],
  );

  const scan = useMemo(
    () => contentMentionScanner({ members, projects, issues, objectives, pages }),
    [members, projects, issues, objectives, pages],
  );

  // Memorized: the object is read as a downstream IDENTITY — the editor reconstructs
  // its extensions when its options change, and the context of the destinations
  // would give back all the pills. Making it new on each rendering would do the
  // two with each strike.
  return useMemo(
    () => ({ options, scan, links, onQuery: armNow }),
    [options, scan, links, armNow],
  );
}
