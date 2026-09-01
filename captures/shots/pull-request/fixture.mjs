/**
 * The demo pull request — the responses that the capture provides in place of the
 * network. See `intent.md`: the diff of a PR is read LIVE at GitHub, nothing
 * base can't craft it, and the demo world doesn't have a repository connected.
 *
 * It extends the agent run sown on AUR-2: same ticket, same branch, same
 * three files, and the same totals as its “3 files modified” block
 * +58 −7 ».
 *
 * The patches are written line by line: each `additions`/`deletions` is the
 * real count of the patch in front, and each hunk header really describes the
 * beaches it covers. A counter that does not fall correctly would be visible in the image.
 */

/** The Aurora Project, as it really exists — the project badge depends on it. */
export const AURORA_ID = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/**
 * SYNTHETIC run identifier. It does not exist in base, and this is intended:
 * no forgotten request can reach a real run via this path.
 */
export const RUN_ID = "demo-pr-aur-2";

/**
 * PR identifier, also SYNTHETIC, and has become the key to the entire
 * device: since MIN-143 the Pull Requests page is indexed by the PR and
 * no longer by the run (`/api/pull-requests/{prId}/…`), because it shows
 * also human PRs, which have no runs. The roads
 * `agent-runs/{runId}/pr/*` still exist but are only facades,
 * and this page no longer calls them.
 */
export const PR_ID = "demo-pr-aur-2-row";

export const PR_NUMBER = 128;
export const BRANCH = "numo/aur-2-palette-shortcuts";
const REPO = "aurora-labs/aurora";
const PR_URL = `https://github.com/${REPO}/pull/${PR_NUMBER}`;

const OPENED_AT = "2026-07-14T16:42:00.000Z";
const NUMO = { login: "numo-agent", avatar_url: null };
const CAMILLE = { login: "camille-roy", avatar_url: null };
const REVIEW_BOT = { login: "review-helper[bot]", avatar_url: null };

/** +6 −1 */
const PATCH_ACTIONS = `@@ -18,7 +18,12 @@ export interface PaletteAction {
   id: string;
   label: string;
   group: ActionGroup;
-  run: (ctx: PaletteContext) => void;
+  /** Key hint shown on the right of the row, and bound globally. */
+  shortcut?: KeyHint;
+  run: (ctx: PaletteContext) => void;
 }

+/** One key, optionally behind a modifier or a \`g\`-style prefix. */
+export type KeyHint = { keys: string[]; sequence?: boolean };
+
 export const ACTIONS: PaletteAction[] = [`;

/** +14 −2 */
const PATCH_ROW = `@@ -1,11 +1,19 @@
 import { cn } from "mangue-ui";
+import { Kbd } from "mangue-ui";
+import { KeyHintBadge } from "@/components/palette/key-hint";
+import type { KeyHint } from "@/lib/palette/actions";
 import type { PaletteAction } from "@/lib/palette/actions";

-export function PaletteRow({ action }: Props) {
+export function PaletteRow({ action, active }: Props) {
   return (
-    <div className="flex items-center gap-2 px-3 py-2">
+    <div className={cn("palette-row", active && "bg-muted")}>
       <action.icon className="size-4 text-muted-foreground" />
       <span className="min-w-0 flex-1 truncate">{action.label}</span>
+      {/* The hint sits at the end of the row: the eye finds it
+          without leaving the line it was already reading. */}
+      {action.shortcut ? (
+        <KeyHintBadge hint={action.shortcut} />
+      ) : null}
     </div>
   );
 }
@@ -30,8 +42,12 @@ export function PaletteGroup({ actions }: Props) {
   return (
     <div role="group" className="flex flex-col">
       {actions.map((action, i) => (
+        // The active row is the one the arrows landed on: its hint
+        // has to read as "press this", not as decoration.
         <PaletteRow
           key={action.id}
           action={action}
+          active={i === activeIndex}
+          onRun={() => run(action)}
         />
       ))}`;

/** +38 −4 */
const PATCH_PROVIDER = `@@ -3,5 +3,6 @@ export function PaletteProvider({ children }: Props) {
 import { useRouter } from "next/navigation";

 import { ACTIONS, type PaletteAction } from "@/lib/palette/actions";
+import { matchesHint } from "@/lib/palette/keys";

 const PaletteContext = createContext<PaletteApi | null>(null);
@@ -41,13 +42,46 @@ export function PaletteProvider({ children }: Props) {
   const [open, setOpen] = useState(false);
   const router = useRouter();

+  /**
+   * A two-key sequence keeps its prefix for 900 ms. Any other key,
+   * or the timeout, drops it — a stale \`g\` must never swallow a
+   * keystroke typed minutes later.
+   */
+  const prefix = useRef<Prefix | null>(null);
+
+  const runShortcut = useCallback(
+    (event: KeyboardEvent): boolean => {
+      const hit = ACTIONS.find(
+        (a) => a.shortcut && matchesHint(a.shortcut, event, prefix.current),
+      );
+      if (!hit) return false;
+      event.preventDefault();
+      hit.run({ router, close: () => setOpen(false) });
+      prefix.current = null;
+      return true;
+    },
+    [router],
+  );
+
   useEffect(() => {
     const onKeyDown = (event: KeyboardEvent) => {
-      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
-        event.preventDefault();
-        setOpen((value) => !value);
+      // Typing in a field is typing, not a shortcut. Checked first:
+      // everything below would otherwise steal characters.
+      const el = event.target as HTMLElement | null;
+      if (isEditable(el)) return;
+
+      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
+        event.preventDefault();
+        setOpen((value) => !value);
+        return;
+      }
+
+      if (runShortcut(event)) return;
+
+      if (PREFIX_KEYS.has(event.key)) {
+        prefix.current = { key: event.key, at: Date.now() };
       }
     };
     window.addEventListener("keydown", onKeyDown);
     return () => window.removeEventListener("keydown", onKeyDown);
-  }, []);
+  }, [runShortcut]);`;

export const FILES = [
  {
    filename: "lib/palette/actions.ts",
    status: "modified",
    additions: 6,
    deletions: 1,
    patch: PATCH_ACTIONS,
  },
  {
    filename: "components/palette/row.tsx",
    status: "modified",
    additions: 14,
    deletions: 2,
    patch: PATCH_ROW,
  },
  {
    filename: "components/palette/provider.tsx",
    status: "modified",
    additions: 38,
    deletions: 4,
    patch: PATCH_PROVIDER,
  },
];

/**
 * The counters announced must be those of the patch opposite — otherwise the image
 * shows "+14 −2" above a diff that adds eleven lines, and it shows.
 * The control turns on loading the module: impossible to capture with a
 * file from which the account was derived.
 */
function countPatch(patch) {
  const lines = patch.split("\n").filter((l) => !l.startsWith("@@"));
  return {
    additions: lines.filter((l) => l.startsWith("+")).length,
    deletions: lines.filter((l) => l.startsWith("-")).length,
  };
}

for (const file of FILES) {
  const real = countPatch(file.patch);
  if (real.additions !== file.additions || real.deletions !== file.deletions) {
    throw new Error(
      `captures: ${file.filename} annonce +${file.additions} −${file.deletions} ` +
        `mais son patch fait +${real.additions} −${real.deletions}.`,
    );
  }
}

/** Sum of files — must be +58 −7, like the agent capture block. */
export const TOTALS = FILES.reduce(
  (acc, f) => ({
    additions: acc.additions + f.additions,
    deletions: acc.deletions + f.deletions,
  }),
  { additions: 0, deletions: 0 },
);

/** The seeded agent run announces “3 files modified +58 −7”. The two captures
 tell the same job: their totals cannot diverge. */
if (TOTALS.additions !== 58 || TOTALS.deletions !== 7) {
  throw new Error(
    `captures: la PR fait +${TOTALS.additions} −${TOTALS.deletions}, ` +
      `la capture de l'agent annonce +58 −7. Les deux images se contrediraient.`,
  );
}

const DESCRIPTION = `Shortcuts are declared next to the action they trigger, not in a global map: the palette already owns the action registry, so it stays the single source of truth and a new action can never ship without its hint.

- \`shortcut\` becomes an optional field of \`PaletteAction\`
- the row renders the hint at its right edge
- the provider binds the listener once and ignores events coming from inputs, textareas and contenteditable

Two-key sequences (\`g\` then \`n\`) reset after 900 ms. Tests cover the registry and the listener.

🤖 Généré par l'agent numo`;

const HEAD_SHA = "6b1f4c9e2d0a7385c41ff20b9e3d5a6714c8be92";

export const PR = {
  number: PR_NUMBER,
  url: PR_URL,
  state: "open",
  draft: false,
  merged: false,
  title: "Add keyboard shortcuts to the command palette",
  body: DESCRIPTION,
  head: BRANCH,
  base: "main",
  headSha: HEAD_SHA,
  commitCount: 2,
  // `mergeable: true` + `clean`: forges calculate mergeability using
  // asynchronous, and `null` displays “unknown” (MIN-138). A showcase PR
  // does not have to carry this reservation — it is mergeable, and says so.
  mergeable: true,
  mergeableState: "clean",
  mergeabilityReason: "clean",
  user: NUMO,
  createdAt: OPENED_AT,
};

/**
 * What THIS account can do on this deposit (MIN-144). Without it, the panel
 * displays the “connect a git account” banner instead of its bar
 * of actions: `capability` governs the entire affordance.
 */
export const VIEWER = {
  provider: "github",
  configured: true,
  connected: true,
  login: CAMILLE.login,
  avatarUrl: null,
  capability: "write",
  numoLogin: NUMO.login,
};

/** The methods offered by the forge — they fill the smelting menu. */
export const MERGE_METHODS = ["squash", "merge", "rebase"];

/**
 * Branch commits. They are not in the image (the open tab is
 * « Fichiers »), mais l'onglet « Commits » porte leur compte : deux, comme
 * `PR.commitCount`, and the second is the fix requested in the thread.
 */
export const COMMITS = [
  {
    sha: "4c21ea08d7b3f95106ad8e2fb47c0d9351768abc",
    message:
      "Declare shortcuts on the action itself\n\nThe registry already owns every action, so the hint travels with it.",
    author: NUMO,
    authorName: "numo",
    authorEmail: "numo@minddy.app",
    authoredAt: "2026-07-14T16:38:00.000Z",
  },
  {
    sha: HEAD_SHA,
    message: "Ignore contenteditable in the global listener",
    author: NUMO,
    authorName: "numo",
    authorEmail: "numo@minddy.app",
    authoredAt: "2026-07-14T17:18:00.000Z",
  },
];

/** The thread: a human proofreading, the agent's response. */
export const COMMENTS = [
  {
    id: 9001,
    body: "Nice. One thing before I merge: the listener has to ignore contenteditable too, not just inputs — the notebook is a ProseMirror surface and `g` would open the board from inside a note.",
    user: CAMILLE,
    created_at: "2026-07-14T17:05:00.000Z",
    html_url: `${PR_URL}#issuecomment-9001`,
  },
  {
    id: 9002,
    body: "Good catch — `isContentEditable` is now the first check of the handler, before the ⌘K branch. Pushed to the same branch.",
    user: NUMO,
    created_at: "2026-07-14T17:19:00.000Z",
    html_url: `${PR_URL}#issuecomment-9002`,
  },
];

/** An unresolved line conversation recalled in the Conversation tab. */
export const REVIEW_COMMENTS = [
  {
    id: 9101,
    body: "Please keep the shortcut type next to the action contract so every new action declares its own hint.",
    path: "lib/palette/actions.ts",
    line: null,
    original_line: 27,
    side: "RIGHT",
    start_line: null,
    original_start_line: 26,
    start_side: null,
    in_reply_to_id: null,
    review_id: 9201,
    diff_hunk: PATCH_ACTIONS,
    user: REVIEW_BOT,
    created_at: "2026-07-14T17:08:00.000Z",
    html_url: `${PR_URL}#discussion_r9101`,
  },
];

export const REVIEW_THREADS = [
  {
    rootCommentId: 9101,
    threadId: "PRRT_demo_9101",
    resolved: false,
    resolvedBy: null,
    outdated: true,
  },
];

export const TIMELINE = [
  {
    id: "review:9201",
    kind: "reviewed",
    actor: REVIEW_BOT,
    createdAt: "2026-07-14T17:08:00.000Z",
    reviewState: "commented",
    body: "One inline point before merge.",
    reviewId: 9201,
  },
];

/**
 * The list item, such as /api/pull-requests would return it. `prId` is
 * now the key: it is he who the page selects and he who addresses
 * all detailed readings. `title`, `author` and `head_branch` are
 * arrived with human PRs — without `author`, the list would no longer be able to say
 * that a PR comes from Numo.
 */
export const LIST_ITEM = {
  prId: PR_ID,
  runId: RUN_ID,
  pr_number: PR_NUMBER,
  pr_url: PR_URL,
  pr_state: "open",
  provider: "github",
  title: PR.title,
  author: NUMO,
  head_branch: BRANCH,
  model: "anthropic/claude-sonnet-4.5",
  created_at: OPENED_AT,
  updated_at: "2026-07-14T17:19:00.000Z",
  issue: {
    id: "b7f1c0de-2a54-4c81-9f2e-6d0a1c3b5e47",
    number: 2,
    title: "Add keyboard shortcuts to the command palette",
  },
  project: { id: AURORA_ID, key: "AUR", name: "Aurora", icon_url: null },
  activeRunId: null,
  busyRunId: null,
  runIds: [RUN_ID],
};

/**
 * The complete envelope of `/api/pull-requests`. The four fields which
 * accompany the list are not decorative: the page makes its screen empty
 * as soon as `repoCount === 0` or `anyPr === false`, BEFORE even looking at the
 * list. The fixture which only served `pullRequests` therefore obtained “Link a
 * GitHub or GitLab repository” — a green, empty page.
 */
export const LIST_RESPONSE = {
  pullRequests: [LIST_ITEM],
  hasMore: false,
  truncated: false,
  repoCount: 1,
  anyPr: true,
};

/** The envelope of `/api/pull-requests/{prId}` — the detail read at the forge. */
export const DETAIL_RESPONSE = {
  pr: PR,
  files: FILES,
  provider: "github",
  checks: {
    checks: [
      {
        name: "Tests",
        state: "success",
        url: `${PR_URL}/checks`,
        appName: "GitHub Actions",
        appAvatarUrl: null,
        description: null,
        durationMs: 92_000,
        startedAt: "2026-07-14T16:43:00.000Z",
        completedAt: "2026-07-14T16:44:32.000Z",
        required: true,
        rerunRef: null,
      },
      {
        name: "Preview",
        state: "success",
        url: `${PR_URL}/checks`,
        appName: "Vercel",
        appAvatarUrl: null,
        description: null,
        durationMs: 48_000,
        startedAt: "2026-07-14T16:43:05.000Z",
        completedAt: "2026-07-14T16:43:53.000Z",
        required: false,
        rerunRef: null,
      },
    ],
    state: "success",
    passing: 2,
    total: 2,
    startedAt: "2026-07-14T16:43:00.000Z",
    completedAt: "2026-07-14T16:44:32.000Z",
  },
  checksError: null,
  reviews: null,
  viewer: VIEWER,
  mergeMethods: MERGE_METHODS,
  mergePolicy: {
    provider: "github",
    available: true,
    methods: MERGE_METHODS,
    preferredMethod: "squash",
    requiredApprovals: 0,
    codeOwnerReviewRequired: false,
    conversationsMustBeResolved: true,
    checksMustPass: true,
    requiredCheckNames: ["Tests"],
    branchMustBeUpToDate: false,
    linearHistoryRequired: false,
    mergeQueueRequired: false,
    autoMergeAllowed: true,
    commitMessages: {
      github: {
        squashTitle: "COMMIT_OR_PR_TITLE",
        squashMessage: "COMMIT_MESSAGES",
        mergeTitle: "MERGE_MESSAGE",
        mergeMessage: "PR_TITLE",
      },
      gitlab: null,
    },
  },
  reviewThreads: REVIEW_THREADS,
  readiness: {
    state: "ready",
    blockers: [],
    passed: [
      {
        id: "reviewable",
        kind: "reviewable",
        required: true,
        source: "pull_request",
      },
      {
        id: "mergeable",
        kind: "mergeability",
        required: true,
        source: "pull_request",
      },
      {
        id: "policy-readable",
        kind: "policy",
        required: true,
        source: "repository",
      },
      {
        id: "checks-passed",
        kind: "checks",
        required: true,
        source: "checks",
        count: 1,
      },
    ],
    mergeAllowed: true,
    methods: MERGE_METHODS,
    preferredMethod: "squash",
  },
};
