/**
 * La pull request de démo — les réponses que la capture fournit à la place du
 * réseau. Voir `intent.md` : le diff d'une PR est lu EN DIRECT chez GitHub, rien
 * en base ne peut le fabriquer, et le monde de démo n'a pas de dépôt connecté.
 *
 * Elle prolonge le run d'agent semé sur AUR-2 : même ticket, même branche, mêmes
 * trois fichiers, et les mêmes totaux que son bloc « 3 fichiers modifiés
 * +58 −7 ».
 *
 * Les patches sont écrits ligne à ligne : chaque `additions`/`deletions` est le
 * compte réel du patch en face, et chaque en-tête de hunk décrit vraiment les
 * plages qu'il couvre. Un compteur qui ne tombe pas juste se verrait à l'image.
 */

/** Le projet Aurora, tel qu'il existe vraiment — la pastille de projet en dépend. */
export const AURORA_ID = "6cd36606-c297-4920-8ce3-31b5f3697be8";

/**
 * Identifiant de run SYNTHÉTIQUE. Il n'existe pas en base, et c'est voulu :
 * aucune requête oubliée ne peut atteindre un vrai run par ce chemin.
 */
export const RUN_ID = "demo-pr-aur-2";

export const PR_NUMBER = 128;
export const BRANCH = "numo/aur-2-palette-shortcuts";
const REPO = "aurora-labs/aurora";
const PR_URL = `https://github.com/${REPO}/pull/${PR_NUMBER}`;

const OPENED_AT = "2026-07-14T16:42:00.000Z";
const NUMO = { login: "numo-agent", avatar_url: null };
const CAMILLE = { login: "camille-roy", avatar_url: null };

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
 * Les compteurs annoncés doivent être ceux du patch en face — sinon l'image
 * montre « +14 −2 » au-dessus d'un diff qui ajoute onze lignes, et ça se voit.
 * Le contrôle tourne au chargement du module : impossible de capturer avec un
 * fichier dont le compte a dérivé.
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

/** Somme des fichiers — doit valoir +58 −7, comme le bloc de la capture agent. */
export const TOTALS = FILES.reduce(
  (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
  { additions: 0, deletions: 0 },
);

/** Le run d'agent semé annonce « 3 fichiers modifiés +58 −7 ». Les deux captures
    racontent le même travail : leurs totaux ne peuvent pas diverger. */
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
  user: NUMO,
  createdAt: OPENED_AT,
};

/** Le fil : une relecture humaine, la réponse de l'agent. */
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

/** L'item de la liste, tel que /api/pull-requests le renverrait. */
export const LIST_ITEM = {
  runId: RUN_ID,
  pr_number: PR_NUMBER,
  pr_url: PR_URL,
  pr_state: "open",
  provider: "github",
  model: "anthropic/claude-sonnet-4.5",
  created_at: OPENED_AT,
  updated_at: "2026-07-14T17:19:00.000Z",
  issue: {
    id: "b7f1c0de-2a54-4c81-9f2e-6d0a1c3b5e47",
    number: 2,
    title: "Add keyboard shortcuts to the command palette",
  },
  project: { id: AURORA_ID, key: "AUR", name: "Aurora" },
  activeRunId: null,
  busyRunId: null,
  runIds: [RUN_ID],
};
