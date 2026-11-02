// @vitest-environment jsdom
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { IssueCardBody } from "./issue-card";
import { IssueCardFace, type IssueCardFaceProps } from "./issue-card-face";
import type { ChipRelation } from "./relation-chips";
import { TooltipProvider } from "./ui/tooltip";

vi.mock("@/components/integration-indicator", () => ({ IntegrationIndicator: () => null }));
vi.mock("@/components/remote-issue-indicator", () => ({ RemoteIssueIndicator: () => null }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const member = {
  user_id: "member-1",
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  avatar_seed: "ada",
  role: "member",
  can_comment: false,
  is_owner: false,
} as const;
const category = { id: "category-1", name: "Bug", color: "#e11d48" } as const;
const objective = { id: "objective-1", name: "Ship the board", color: "#0d9488" } as const;
const relation = {
  id: "relation-1",
  relation: "blocks",
  otherId: "issue-2",
  otherType: "issue",
  otherNumber: 42,
  otherName: "Blocked issue",
  otherStatus: "todo",
  resolved: false,
} as ChipRelation;

function issue(patch: Partial<IssueCardFaceProps["issue"]> = {}): IssueCardFaceProps["issue"] {
  return {
    id: "issue-1",
    project_id: "project-1",
    number: 7,
    title: "Keep the card light",
    description: null,
    status: "todo",
    priority: "medium",
    effort: null,
    assignee_id: null,
    objective_id: null,
    due_date: null,
    recurrence: null,
    category_ids: [],
    plan: null,
    ...patch,
  };
}

const base: Omit<IssueCardFaceProps, "issue"> = {
  projectKey: "MIN",
  memberMap: new Map([[member.user_id, member]]),
  categoryMap: new Map([[category.id, category]]),
  objectiveMap: new Map([[objective.id, objective]]),
};

const fixtures: Array<[string, IssueCardFaceProps]> = [
  ["bare", { ...base, issue: issue() }],
  ["full fields", {
    ...base,
    issue: issue({
      description: "A compact **description**.",
      assignee_id: member.user_id,
      category_ids: [category.id],
      objective_id: objective.id,
      due_date: "2026-12-18",
      recurrence: "weekly",
      plan: "- [x] Draft\n- [ ] Review",
    }),
  }],
  ["open pull request", {
    ...base,
    issue: issue(),
    pr: { prId: "pr-1", prNumber: 34, state: "open" },
  }],
  ["closed pull request with a plan", {
    ...base,
    issue: issue({ plan: "- [x] Draft\n- [ ] Review" }),
    pr: { prId: "pr-4", prNumber: 37, state: "closed" },
  }],
  ["comment follow-up", {
    ...base,
    issue: issue(),
    commentFollowUp: { count: 2 } as IssueCardFaceProps["commentFollowUp"],
  }],
  ["draft pull request", {
    ...base,
    issue: issue(),
    pr: { prId: "pr-2", prNumber: 35, state: "draft" },
  }],
  ["merged pull request", {
    ...base,
    issue: issue(),
    pr: { prId: "pr-3", prNumber: 36, state: "merged" },
  }],
  ["parent and relations", {
    ...base,
    issue: issue(),
    parentNumber: 6,
    relations: [relation],
  }],
  ["cycle selection", {
    ...base,
    issue: issue(),
    inCurrentCycle: true,
    selected: true,
  }],
];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("IssueCardFace", () => {
  it.each(fixtures)("matches IssueCardBody without callbacks: %s", async (_name, props) => {
    await act(() => root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TooltipProvider>
          <div data-testid="body"><IssueCardBody {...props} /></div>
          <div data-testid="face"><IssueCardFace {...props} /></div>
        </TooltipProvider>
      </NextIntlClientProvider>,
    ));

    expect(host.querySelector("[data-testid=body]")?.innerHTML)
      .toBe(host.querySelector("[data-testid=face]")?.innerHTML);
  });
});

const REPO_ROOT = path.resolve(__dirname, "..");
const CANDIDATE_SUFFIXES = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];
// What the face must never load: data access, drag-and-drop, and the app's
// menus, pickers and editors. `mention-hover` is allowed: it is a context
// slot, and the hover card itself is mounted by the app.
const FORBIDDEN_IMPORTS = [
  "@tanstack/react-query",
  "@dnd-kit/core",
  "lib/supabase",
  "lib/agent-api",
  "lib/create-context",
  "components/command-palette",
  "components/use-issue-menu-actions",
  "components/pages/",
  "components/pull-requests/",
];

// The project orb loads an imported project icon through the query client; a
// project without one, as on every read-only surface, never fetches. Copying
// the orb to avoid it would let the two drift apart.
const ALLOWED_FILES = new Set(["components/project-orb.tsx", "lib/use-project-icon.ts"]);

function resolveImport(specifier: string, from: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(REPO_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function faceImportGraph() {
  const seen = new Set<string>();
  const forbidden = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const runtime = source.replace(/^[ \t]*(?:import|export)[ \t]+type[ \t][^;\n]*(?:\n[^;]*)*?;/gm, "");
    for (const match of runtime.matchAll(/(?:from\s*|import\(\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (
        !ALLOWED_FILES.has(path.relative(REPO_ROOT, file)) &&
        FORBIDDEN_IMPORTS.some((entry) => specifier.includes(entry))
      ) {
        forbidden.add(`${path.relative(REPO_ROOT, file)} → ${specifier}`);
      }
      const next = resolveImport(specifier, file);
      if (next) walk(next);
    }
  };
  walk(path.join(REPO_ROOT, "components/issue-card-face.tsx"));
  return { seen, forbidden };
}

describe("IssueCardFace import graph", () => {
  const graph = faceImportGraph();

  it("walks a non-empty local graph", () => {
    expect(graph.seen.size).toBeGreaterThan(8);
  });

  it("does not reach interactive or query-backed card dependencies", () => {
    expect([...graph.forbidden]).toEqual([]);
  });
});
