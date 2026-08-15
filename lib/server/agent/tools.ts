import { MAX_BACKGROUND_JOBS } from "./background";
import {
  CREATE_ROUTINE_DESCRIPTION,
  CREATE_ROUTINE_PARAMETERS,
} from "@/lib/server/routine-tool-schema";
// Type SEUL (donc effacé à la compilation) : l'ancrage est déclaré dans le module
// des prompts, qui est celui qui le décline en texte.
import type { AgentAnchor } from "./prompt";

/**
 * Tools de l'agent de code (MIN-46), format function-calling OpenRouter (même
 * forme que lib/server/assistant/tools.ts). Ils opèrent sur le dépôt cloné dans
 * le Sandbox ; leur exécution est câblée dans execute.ts via la couche
 * lib/server/agent/sandbox.ts.
 *
 * Jeu d'un VRAI éditeur de code :
 *  - exploration : read_file (numéroté, fenêtré), list_dir, glob, grep (git grep)
 *  - édition     : edit_file (remplacement de chaîne robuste — cascade opencode,
 *                  cf. edit.ts), write_file (création de fichiers neufs uniquement)
 *                  — REMPLACÉS par apply_patch sur les modèles `gpt-*` (MIN-115,
 *                  cf. `usesApplyPatch` dans patch.ts)
 *  - vérif       : run_command (install/lint/build/tests, git, etc.), run_background
 *                  (serveur de dev / watcher : démarrer, sonder, arrêter — MIN-114)
 *  - livraison   : create_pr (ouvre LA pull request du ticket quand il n'y en a pas)
 *  - tickets     : search_issues, read_issue (état VIVANT d'un ticket : champs,
 *                  plan, commentaires, ressources), read_resource,
 *                  update_issue (titre / description / effort — JAMAIS le statut),
 *                  write_issue_plan (écrit le plan SUR DEMANDE, sans l'appliquer),
 *                  append_to_plan et edit_issue_text (MIN-186 : faire GROSSIR ou
 *                  CORRIGER un plan/une description déjà écrits, sans les
 *                  réémettre — write_issue_plan et update_issue remplacent tout),
 *                  create_issue, create_routine (MIN-185 : poser un run
 *                  programmé, retiré à un run de routine pour qu'elle ne
 *                  s'auto-réplique pas) — exécutés par
 *                  lib/server/agent/issue-tools.ts.
 *  - objectifs   : list_objectives, read_objective, create_objective,
 *                  update_objective, comment_objective (MIN-287) — le BUT que
 *                  le ticket sert. `create_issue` et `update_issue` prennent en
 *                  plus un `objective` : un ticket hors objectif est hors de
 *                  toute barre de progression et hors du remplissage de cycle.
 *                  Exécutés par lib/server/agent/objective-tools.ts.
 *  - carnet      : read_scratchpad, add_scratchpad_tasks, update_scratchpad_task,
 *                  set_scratchpad — exécutés par lib/server/agent/scratchpad-tools.ts.
 *  - pull requests du PROJET (MIN-267) : list_pull_requests, read_pull_request,
 *                  comment_pull_request, comment_pull_request_line,
 *                  reply_pull_request_thread, review_pull_request,
 *                  set_pull_request_state — exécutés par
 *                  lib/server/agent/project-pr-tools.ts. À ne pas confondre avec
 *                  `PR_TOOLS` plus bas, qui sont les trois écritures d'une
 *                  session de RELECTURE sur LA pull request qu'elle relit.
 *
 * Les tools minddy sont servis aux DEUX ancrages (MIN-125) : l'ancrage du run
 * ne décide plus que de la CIBLE PAR DÉFAUT des tools ticket (le ticket du run,
 * sinon `issue` est obligatoire) et de la formulation de `create_pr`. D'où deux
 * jeux qui ne diffèrent que par là : `AGENT_TOOLS` (run de ticket) et
 * `NOTEBOOK_AGENT_TOOLS` (run carnet).
 *
 * PAS de tool de fin de tour : le tour se termine quand l'agent répond en texte
 * (fin naturelle, comme une conversation). Les commits sont pilotés par le harnais
 * (commit+push au suspend et à chaque fin de tour) — pas de tool commit exposé,
 * pour garder des commits propres.
 */

export type AgentToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

/** Timeout dur (ms) d'un `run_command`, appliqué côté Sandbox. */
export const RUN_COMMAND_TIMEOUT_MS = 180_000;

/**
 * Commentaires de ligne posables par session de relecture (MIN-141, MIN-168).
 * Déclaré ICI plutôt que dans `pr-tools.ts` parce que la DESCRIPTION du tool doit
 * l'annoncer au modèle, et que ce module ne dépend d'aucune plomberie de forge —
 * `pr-tools.ts`, qui l'applique, le lit d'ici.
 */
export const AI_REVIEW_MAX_INLINE_COMMENTS = 5;

/** Cœur commun aux deux ancrages : exploration, édition, vérification, checklist. */
const CORE_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "run_background",
      description:
        `Run a long-lived command in the background — a dev server, a watcher, a build that keeps running — and keep working while it runs. This is how you SEE your work run: start the server, then use run_command to curl it ('curl -s --retry 5 --retry-connrefused http://localhost:3000/'), read what it answered, and stop the job. Three actions: 'start' (needs 'command'; returns a job_id, the pid and the path of its log file), 'check' (needs 'job_id'; returns whether it is still running and ONLY what it wrote since your previous check), 'stop' (needs 'job_id'; kills it). Give a server a moment to boot before the first check. NO stdin: a command that waits for input hangs forever — pass its non-interactive flags (--yes, --no-interactive, CI=1). Not for commands that finish on their own: use run_command for those, it gives you the exit code. Background jobs do NOT survive the end of a turn (all of them are killed then), so start what you need in the same turn you use it. At most ${MAX_BACKGROUND_JOBS} jobs run at a time.`,
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start", "check", "stop"],
            description: "'start' a job, 'check' its recent output, or 'stop' it.",
          },
          command: {
            type: "string",
            description:
              "For 'start': the shell command to run in the background, e.g. 'npm run dev'. Ignored otherwise.",
          },
          workdir: {
            type: "string",
            description:
              "For 'start': optional repo-relative directory to run it in. Defaults to the repository root.",
          },
          job_id: {
            type: "string",
            description: "For 'check' and 'stop': the job_id returned by 'start'.",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web and get back a short factual answer with its sources (url, title, excerpt). The sandbox has no browser and no general internet access — this is your only way to look something up outside the repository. Use it when the code you are writing depends on something you cannot read in the repo and do not know reliably: a library's current API or migration guide, a breaking change, an error message coming from a dependency, a version number, a spec. Read the repo FIRST (package.json, lockfile, the dependency's own files under node_modules, the docs in the repo) — the answer is often there and free. One focused query per call, and never search twice for the same thing: each search costs real money.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query, in natural language (max 400 characters). Include the library and version that narrow it, e.g. 'next.js 16 middleware matcher config breaking change'.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_plan",
      description:
        "Maintain a short ordered checklist of the steps for this task, so the work stays legible in the live view. Call it once early with a few concrete steps, then again whenever a step's status changes. Always send the FULL current plan. Keep exactly one step 'in_progress' at a time and mark steps 'completed' as you finish them. Skip planning for trivial one-step tasks — never make a single-step plan.",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "array",
            description: "The full ordered list of steps, in order.",
            items: {
              type: "object",
              properties: {
                step: { type: "string", description: "Short description of the step." },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "cancelled"],
                  description: "Status of this step.",
                },
              },
              required: ["step", "status"],
            },
          },
        },
        required: ["plan"],
      },
    },
  },
];

/**
 * Description de `read_resource`, en deux versions : un run dont le modèle voit
 * les images ANNONCE qu'il peut regarder une maquette (MIN-111) ; les autres
 * gardent le texte d'avant, au mot près. Promettre une capacité qu'on n'a pas ferait
 * dire au modèle « je regarde la maquette » sur un résultat qui ne porte que des
 * métadonnées. `agentToolsFor` choisit.
 */
const READ_RESOURCE_DESCRIPTION =
  "Open one resource of the ticket (or of one of its comments) by id — get the id from read_issue. A LINK returns its url and title; there is nothing to download, fetch the page yourself if you need what's on it. A PAGE of the project's wiki returns its page_id and title — read the document itself with read_page. A FILE: text comes back inline (capped); binaries and large files return the metadata plus a short-lived signed download_url — if you need the bytes in the sandbox (a spec to read in full, an asset to add to the repo), download them with run_command (`curl -sL '<download_url>' -o …`), outside the repository unless the file belongs in the commit.";

const READ_RESOURCE_DESCRIPTION_WITH_IMAGES =
  "Open one resource of the ticket (or of one of its comments) by id — get the id from read_issue. A LINK returns its url and title; there is nothing to download, fetch the page yourself if you need what's on it. A PAGE of the project's wiki returns its page_id and title — read the document itself with read_page. A FILE that is an IMAGE (png, jpeg, webp, gif) comes back as the image itself, attached to the result: you actually see it. When the ticket carries a mockup, a screenshot or a diagram, open it BEFORE writing the code it describes, and say what you see — a layout you were shown beats a layout you were told about. Text files come back inline (capped); other binaries and oversized files return the metadata plus a short-lived signed download_url — if you need the bytes in the sandbox (a spec to read in full, an asset to add to the repo), download them with run_command (`curl -sL '<download_url>' -o …`), outside the repository unless the file belongs in the commit.";

/** États de tâche du carnet, tels que les tools les acceptent. */
const SCRATCHPAD_TASK_STATES = ["pending", "in_progress", "completed", "cancelled"];

/** Référence de ticket acceptée partout où un tool prend `issue`. */
const ISSUE_REF_DESCRIPTION =
  "The ticket to act on: a UUID, an identifier like 'MIN-42', or a bare issue number. Resolve it with search_issues when you only know its subject.";

/** Référence d'objectif acceptée partout où un tool prend `objective`. */
const OBJECTIVE_REF_DESCRIPTION =
  "The objective this work belongs to: its id, or its exact name (case-insensitive). Get both from list_objectives — never invent a name, an unknown one is refused. A ticket attached to no objective counts in no progress bar and fills no cycle.";

/**
 * Tools minddy, servis aux DEUX ancrages (MIN-125) : les tickets du projet du run
 * et le carnet de son lanceur. Ce qui reste ancrage-dépendant est ajouté par
 * `agentToolsFor` — la phrase de ciblage des tools qui prennent `issue`, et
 * `create_pr`, déclaré à part parce que sa formulation change.
 */
/** Ce qu'un corps de page accepte, dit là où le modèle le lit — la même prose que
    sur les deux autres surfaces : la syntaxe d'un lien de sous-page ne se devine
    pas, et un bloc inventé retombe en texte brut. */
/**
 * Les IMAGES et les FICHIERS d'une page (MIN-280), dits au modèle en trois
 * phrases parce qu'il ne peut pas les deviner et qu'il en détruirait sans le
 * savoir : `update_page` remplace le corps ENTIER, donc une ligne d'image qu'on
 * n'a pas recopiée est un fichier détaché de son document.
 *
 * La même prose sur les trois surfaces (MCP, Numo, agent de code), comme le
 * reste du mode d'emploi de la syntaxe.
 */
const PAGE_FILES_DESCRIPTION =
  "An image reads '![caption](url)' and a file '[name](url)' — those are REAL " +
  "files stored by minddy. Keep such lines exactly as you read them when you " +
  "rewrite a body: dropping one detaches the file from the page. You cannot " +
  "upload a file yourself, and you must never invent one of those urls.";

const PAGE_BODY_DESCRIPTION =
  "The page BODY in markdown. Supported: headings (## and ###, since a single " +
  "'# ' is the page title), bold/italic/inline code, links, bullet and numbered " +
  "lists, task lists ('- [ ]' / '- [x]'), quotes, fenced code blocks, horizontal " +
  "rules, <details><summary>…</summary>…</details> collapsibles, and " +
  "'[[page:<page_id>]]' on its own line to link another page. Anything else " +
  "degrades to plain text. " +
  PAGE_FILES_DESCRIPTION;

const MINDDY_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_issues",
      description:
        "Find tickets in the minddy project this session works on. Matches free text against titles and descriptions, and resolves an exact reference ('MIN-42' or a bare number) directly. Returns compact rows — id, identifier, title, status, priority, effort, assignee, objective — enough to pick the right one and then read_issue it. Use it whenever the user mentions another ticket by subject, number or name, or before targeting one with read_issue / update_issue / write_issue_plan.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "What to look for: words from the title or description, or an exact 'MIN-42' / bare number.",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default 20, max 100).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_issue",
      description:
        "Read a minddy ticket in full: every field (title, description, status, priority, effort, assignee, due date…), its implementation plan parsed into tasks with their states, its resources — files, links and pages of the project's wiki (metadata + ids) —, the most recent comments, sub-issues, relations, and `linked_feedback` — the user requests from the product's feedback board that this ticket implements. Any ticket context you were given at session start is a SNAPSHOT — call this whenever fresh state matters (the user may have edited the ticket, added comments or resources mid-session, or refers to something not in your context). Returns the last 15 comments by default.",
      parameters: {
        type: "object",
        properties: {
          issue: { type: "string", description: ISSUE_REF_DESCRIPTION },
          include_all_comments: {
            type: "boolean",
            description: "Return the FULL comment thread instead of the last 15 (default false).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_feedback",
      description:
        "Read a user request from the product's feedback board — the WHY behind a ticket, in the words of the people who asked for it. Ids come from read_issue's `linked_feedback`. Returns the request (the team's canonical wording AND the original submitted text), its vote count, and its whole discussion. Read it before implementing a ticket that carries one: the ticket says what to build, the feedback says what problem people actually hit, and the two diverge more often than they look. Each comment says where it comes from — `board visitor` is a user of the product describing their case, `team` is your colleagues; and `visibility` public means it is on the public board, internal means it is a team-only note (which may be the arbitration that overrides the request). Never confuse a team decision with a user's need.",
      parameters: {
        type: "object",
        properties: {
          feedback_post_id: {
            type: "string",
            description: "Feedback id, from read_issue's linked_feedback.",
          },
        },
        required: ["feedback_post_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_resource",
      description: READ_RESOURCE_DESCRIPTION,
      parameters: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            description:
              "Resource id from read_issue (on the issue or on one of its comments).",
          },
        },
        required: ["resource_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_issue",
      description:
        "Edit a ticket's TITLE, DESCRIPTION or EFFORT estimate, or attach it to an OBJECTIVE. Send only the fields you are changing — the others are left untouched. Rename when the title no longer describes the work; rewrite the description when the user asks, or when what it claims has become wrong. You CANNOT change a ticket's STATUS or its PRIORITY here: those are the user's decision (and the harness already moves the ticket along with the pull request), and passing either is refused. Say in your reply what you think the status should be instead.",
      parameters: {
        type: "object",
        properties: {
          issue: { type: "string", description: ISSUE_REF_DESCRIPTION },
          title: { type: "string", description: "New title. Concise, imperative." },
          description: {
            type: "string",
            description: "New description in markdown — REPLACES the current one entirely.",
          },
          effort: {
            type: "string",
            enum: ["xs", "s", "m", "l", "xl"],
            description: "New t-shirt effort estimate. Pass null to clear it.",
          },
          objective: {
            type: "string",
            description:
              OBJECTIVE_REF_DESCRIPTION +
              " Pass null to detach the ticket from its objective.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_issue_plan",
      description:
        "Write a ticket's implementation PLAN — the persistent markdown plan stored on the minddy ticket, visible to the whole team. Call it ONLY when the user asks for a plan (e.g. 'prépare un plan', 'plan this ticket', 'how would you do it? write it down') — never spontaneously. Full replacement: send the complete plan. Format: a short context (goal, approach), then ordered checkbox tasks — '- [ ]' pending, '- [~]' in progress, '- [x]' done, '- [-]' cancelled — each naming the exact files/components/functions/migrations to touch, and a final verification step. Explore the code FIRST so tasks reference real paths — and grep whatever you are removing or renaming so the plan names EVERY call site, not a sample of them: a plan that lists two of three callers reads exactly like one that lists three. Writing the plan does NOT start the work: after writing it, reply and stop unless the user also asked to implement. Distinct from update_plan, which is only your live session checklist.",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "string",
            description: "The complete plan in markdown (context + '- [ ]' tasks + verification).",
          },
          issue: { type: "string", description: ISSUE_REF_DESCRIPTION },
        },
        required: ["plan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_to_plan",
      description:
        "Add a block to a ticket's existing implementation plan WITHOUT touching a byte of what is already there — an extra task you discovered was needed, a note, a precision. The block lands at the end of the plan (just above its '## Questions' heading when it has one), or at the end of a named section with `section`. This is how a plan GROWS: write_issue_plan replaces the whole document and destroys anything you don't resend, task states included. Same rule as everything else about the ticket plan: only touch it when the user asked you to.",
      parameters: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description:
              "The block to ADD, markdown: checkbox task lines ('- [ ] …') and/or a short paragraph. ONLY what is new — never repeat what the plan already says.",
          },
          section: {
            type: "string",
            description:
              "Exact text of an existing heading to append under (e.g. 'Questions' to park an open question). Omit to append at the end. An unknown heading is an error, not a new section — read_issue first.",
          },
          issue: { type: "string", description: ISSUE_REF_DESCRIPTION },
        },
        required: ["markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_issue_text",
      description:
        "Rewrite ONE passage of a ticket's plan or description IN PLACE — exactly like edit_file, but on the minddy ticket instead of a file: old_string → new_string, copied VERBATIM from what read_issue returned, and the match must be unique (add the surrounding lines, or set replace_all). Everything else stays byte for byte. Use it to reword a decision that changed, fix a wrong sentence in a description, or rewrite one section of a plan — instead of write_issue_plan / update_issue, which re-emit the whole text and silently drop what someone else changed meanwhile. A stale old_string fails loudly, which is the point.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["plan", "description"],
            description: "Which text of the ticket to patch.",
          },
          old_string: {
            type: "string",
            description:
              "The exact passage to replace, copied verbatim from read_issue (whitespace and line breaks included).",
          },
          new_string: {
            type: "string",
            description: "What replaces it. An empty string deletes the passage.",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace EVERY occurrence instead of requiring a unique match (default false).",
          },
          issue: { type: "string", description: ISSUE_REF_DESCRIPTION },
        },
        required: ["field", "old_string", "new_string"],
      },
    },
  },
  // ── Les PAGES du projet : son wiki (MIN-273) ─────────────────────────────
  //
  // Un ticket dit quoi faire, une page dit pourquoi c'est comme ça. L'agent de
  // code lisait le code et les tickets, jamais la doc que l'équipe a écrite —
  // c'est ce trou-là que ces tools ferment. Ils parlent markdown des deux côtés,
  // et ils sont les MÊMES que ceux du MCP et du chat (lib/server/page-tools.ts).
  {
    type: "function",
    function: {
      name: "list_pages",
      description:
        "List the pages of the minddy project this session works on — its WIKI: ids, titles, icons, parents, no bodies. Pages hold what the code and the tickets assume: specs, architecture decisions and their why, conventions, runbooks. Read the wiki BEFORE deciding how to implement something non-obvious: a convention written by the team beats a convention you infer from two files. When you are after a SUBJECT rather than the map, use search_pages instead — it reads the bodies too. parent_page_id carries the nesting. Then open one with read_page.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_pages",
      description:
        "Full-text search across the project's wiki — page TITLES and page BODIES — ranked, each hit with the passage that matched and the path of its parent pages. This is the fast way to answer 'is there a convention for X', 'where is the decision about Y written', 'what does the spec say about Z' — questions the code cannot answer. Listing the tree and reading pages one by one costs the whole wiki in tokens and still misses what is buried three levels down. A title match outranks a body match. The excerpt is a fragment: open the page you picked with read_page.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The words to look for. Quotes force a phrase, a leading - excludes a word. Prefer the distinctive nouns of the subject: every word must appear in the page for it to match.",
          },
          limit: {
            type: "number",
            description: "How many pages to return, 1–50 (default 20).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description:
        "Read ONE page of the project's wiki in MARKDOWN: its title, its icon, its body, its version and its direct subpages. Ids come from list_pages. A '[[page:<id>]]' line is a LINK to a subpage, not its content — read that page too when it matters. Copy passages from here verbatim for edit_page_text.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
        },
        required: ["page_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_page",
      description:
        "Create a page in the project's wiki, optionally under an existing page. Only when the user asked for documentation — a spec, a decision record, a runbook you were told to write. Never document your own run here: what you did belongs in the pull request and in the ticket. Write it filled, and nested under the right parent.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Page title, plain text (no leading '#', no emoji).",
          },
          markdown: { type: "string", description: PAGE_BODY_DESCRIPTION },
          icon: {
            type: "string",
            description: "A single emoji shown next to the title. Omit for the default.",
          },
          parent_page_id: {
            type: "string",
            description: "Nest it under this page (from list_pages). Omit for a root page.",
          },
        },
        required: ["title", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_page",
      description:
        "Replace a wiki page's body, title or icon. markdown REPLACES the whole body and drops anything you don't resend — so keep it for a page you write from scratch, and pass the `version` read_page gave you: the write is then refused instead of overwriting a teammate who is editing that page right now. To change PART of a page, append_to_page or edit_page_text.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
          markdown: {
            type: "string",
            description:
              "The FULL new body in markdown — replaces the current one entirely. Omit to change only the title or the icon.",
          },
          version: {
            type: "number",
            description: "The version from read_page. Always pass it with markdown.",
          },
          title: { type: "string", description: "New title, plain text." },
          icon: { type: "string", description: "New emoji icon." },
        },
        required: ["page_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_to_page",
      description:
        "Add a block at the END of a wiki page without touching a byte of what is already there, and without re-sending the document. This is how a page GROWS — a new section, a decision that just landed. Refused if someone wrote the page between your read and this call, so nothing of theirs is lost.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
          markdown: {
            type: "string",
            description:
              "The block to ADD, in markdown. ONLY what is new — never repeat what the page already says.",
          },
        },
        required: ["page_id", "markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_page_text",
      description:
        "Rewrite ONE passage of a wiki page IN PLACE — exactly like edit_file, but on a minddy page instead of a file: old_string → new_string, copied VERBATIM from read_page, unique match (add the surrounding lines, or set replace_all). Everything else stays byte for byte. Use it to correct a sentence or rewrite one section instead of update_page, which re-emits the whole body and silently drops what someone else changed meanwhile. A stale old_string fails loudly, which is the point.",
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "Page id, from list_pages." },
          old_string: {
            type: "string",
            description:
              "The exact passage to replace, copied verbatim from read_page (whitespace and line breaks included).",
          },
          new_string: {
            type: "string",
            description: "What replaces it. An empty string deletes the passage.",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace EVERY occurrence instead of requiring a unique match (default false).",
          },
        },
        required: ["page_id", "old_string", "new_string"],
      },
    },
  },
  // ── Les OBJECTIFS du projet : le but que le ticket sert (MIN-287) ────────
  //
  // L'agent lisait un ticket sans jamais savoir à quoi ce ticket sert, et ce
  // qu'il créait tombait hors de tout objectif — donc hors des barres de
  // progression et hors du remplissage de cycle. Même doctrine que les
  // relations : ce qu'on n'a pas rangé, quelqu'un devra le ranger à la main.
  // Exécutés par lib/server/agent/objective-tools.ts, sur les noyaux du MCP.
  {
    type: "function",
    function: {
      name: "list_objectives",
      description:
        "List the OBJECTIVES of the minddy project this session works on — the named goals its tickets are grouped under (a quarter's theme, a redesign, a migration), each with its status, its lead, its target date, a truncated description and its progress (done / total tickets, and a percent weighted by effort, the same bar the team reads). This is what tells you WHY the ticket you are implementing exists and what else is being done towards the same goal. Read it before creating a ticket or attaching one: names and ids both come from here, and `objective` on create_issue / update_issue accepts either. Open one in full with read_objective.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_objective",
      description:
        "Open ONE objective in full — the counterpart of read_issue: its whole description (the goal, not the truncated line list_objectives shows), status, lead, target date, weighted progress, its resources, the TICKETS it groups (identifier, title, status, priority, effort, assignee) and its COMMENT THREAD. Read it when the ticket you work on belongs to an objective and the ticket alone does not say what the work is for: the description is where the goal is written, the ticket list is what the progress bar is actually made of, and the thread is where the team already said what it thinks. Read it before commenting on it.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: OBJECTIVE_REF_DESCRIPTION },
        },
        required: ["objective"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_objective",
      description:
        "Create an objective — a named goal that groups tickets of this project. ONLY when the user asks for one: an objective is a product decision, and inventing goals nobody set is not your call. Check list_objectives first, an objective that already covers the work is the one to use. Fill it like a ticket: the description is what the team reads to know what this goal is and when it is reached, so say the intent and what counts as done — a name alone leaves it for a human to finish. Then ATTACH ITS TICKETS: an objective with no ticket has a progress bar stuck at zero forever.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Objective name. Short, concrete." },
          description: {
            type: "string",
            description:
              "What this goal is, why it matters, and what counts as reaching it. Markdown.",
          },
          status: {
            type: "string",
            enum: ["planned", "in_progress", "done", "canceled"],
            description: "Optional — defaults to planned.",
          },
          target_date: {
            type: "string",
            description: "Optional target date, 'YYYY-MM-DD'. Only when one was named.",
          },
        },
        required: ["name", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_objective",
      description:
        "Edit an objective's name, description, status or target date. Send only the fields you are changing — the others are left untouched, and `description` REPLACES the whole document, so read_objective it first. Unlike a ticket's status, an objective's IS editable here: closing a goal the team reached, or reopening one, is a normal report of where the work stands. Still, it is the user's goal — change its status when the work you just did actually moves it there, or when you were asked to, never to tidy up.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: OBJECTIVE_REF_DESCRIPTION },
          name: { type: "string", description: "New name." },
          description: {
            type: "string",
            description: "New description in markdown — REPLACES the current one entirely.",
          },
          status: {
            type: "string",
            enum: ["planned", "in_progress", "done", "canceled"],
            description: "New status.",
          },
          target_date: {
            type: "string",
            description: "New target date, 'YYYY-MM-DD'. Pass null to clear it.",
          },
        },
        required: ["objective"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comment_objective",
      description:
        "Post a comment on an OBJECTIVE's thread — the goal itself, not one of its tickets. Use it to report something that concerns the whole goal: a finding that changes how it should be pursued, a blocker that affects several of its tickets, the summary of a piece of work that moves it forward. A note about ONE ticket does not belong here — say it in your reply or in the pull request. KEEP IT SHORT: a message to colleagues, a few sentences or a handful of one-line bullets, no headings. The team sees it in the objective's thread with your session's owner as the author.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: OBJECTIVE_REF_DESCRIPTION },
          body: {
            type: "string",
            description: "Markdown, short: a few sentences or short bullets, no headings.",
          },
        },
        required: ["objective", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_issue",
      description:
        "Create a REAL ticket in the project this session works on. Use it when the user asks for one, or when work you ran into genuinely deserves a formal, trackable ticket (a substantial feature, a real bug the team should see) — never automatically, and never as a substitute for just doing the work. The ticket lands in the status the user chose for tickets created through Numo: that is an account setting, not a parameter, so you cannot pick it — the result tells you where it landed, report that. Attach it to the OBJECTIVE that covers it (list_objectives): a ticket outside every objective is outside every progress bar and fills no cycle, and someone will have to file it by hand.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Ticket title. Concise, imperative." },
          description: {
            type: "string",
            description: "Ticket description in markdown (context, scope, acceptance).",
          },
          priority: {
            type: "string",
            enum: ["none", "low", "medium", "high", "urgent"],
            description: "Optional priority.",
          },
          effort: {
            type: "string",
            enum: ["xs", "s", "m", "l", "xl"],
            description: "Optional t-shirt effort estimate.",
          },
          objective: { type: "string", description: OBJECTIVE_REF_DESCRIPTION },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_routine",
      description: CREATE_ROUTINE_DESCRIPTION,
      parameters: CREATE_ROUTINE_PARAMETERS,
    },
  },
  {
    type: "function",
    function: {
      name: "report_verdict",
      description:
        "Report the RESULT of the verification step you were asked to run. Call it exactly once, at the very end of your turn, after you have actually looked at the code — never before, and never instead of doing the work. `ok` is the whole point: true means the work matches the plan and you found nothing that must be fixed; false means it does not, and the run will be retried with your summary as its instruction. Say WHY in `summary`, and list the concrete things that must change in `blockers` (empty array when ok is true). This tool is only available inside an automated chain — nobody reads a verdict outside one.",
      parameters: {
        type: "object",
        properties: {
          ok: {
            type: "boolean",
            description: "Does the work pass? false when anything must be fixed before it ships.",
          },
          summary: {
            type: "string",
            description: "Two or three sentences: what you checked, and what you concluded.",
          },
          blockers: {
            type: "array",
            items: { type: "string" },
            description: "One line per thing that must change. Empty array when ok is true.",
          },
        },
        // Les trois dans `required` À DESSEIN : un champ hors `required` d'un
        // tool call n'est tout simplement pas répondu par un petit modèle — et
        // c'est justement un petit modèle qui vérifie un diff.
        required: ["ok", "summary", "blockers"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_scratchpad",
      description:
        "Re-read the launcher's notebook (their personal cross-project notes doc): the full markdown, plus every checkbox task parsed with a stable 0-based task_index, its text, its state (pending '- [ ]', in_progress '- [~]', completed '- [x]', cancelled '- [-]') and its `depth` — 0 for a top-level task, 1 for a sub-task of the task above it, and so on with no limit. The task list is FLAT: `depth` is the only thing that tells you a task belongs to the one before it. Also `rev`, the doc's version. Anything you were shown of it at session start is a SNAPSHOT — call this whenever fresh state matters, and ALWAYS right before update_scratchpad_task or set_scratchpad so your indices and rev are current.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_scratchpad_tasks",
      description:
        "Append tasks to the launcher's notebook. Only on their explicit request ('note that', 'add it to my notes') — the notebook is their personal space, not your scratch space. Tasks land at the end of the doc, or at the end of a named '##' section when you pass one (an unknown section is refused and the existing ones are listed). Appending merges with whatever the user is typing right now; it never overwrites their text. Use `depth` to nest: a task at depth 1 becomes a sub-task of the task right before it.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "The tasks to add, in order (1 to 50).",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "The task label, one line." },
                state: {
                  type: "string",
                  enum: SCRATCHPAD_TASK_STATES,
                  description: "Initial state. Defaults to pending.",
                },
                depth: {
                  type: "number",
                  description:
                    "Nesting depth: 0 (default) for a top-level task, 1 to make it a sub-task of the task right before it, and so on.",
                },
              },
              required: ["text"],
            },
          },
          section: {
            type: "string",
            description:
              "Optional heading title to add them under, exactly as it reads in the notebook. Omit to add at the end of the doc.",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_scratchpad_task",
      description:
        "Flip the state of one or more existing notebook tasks WITHOUT rewriting the doc — the way to tick items off as you work. Mark the task you start 'in_progress' and the tasks you finish 'completed'. task_index comes from read_scratchpad (0-based, document order); pass expected_rev (the `rev` from that same read) so a concurrent edit by the user can never make you flip the wrong line. All-or-nothing: one out-of-range index rejects the whole call. Only the checkbox marker changes — never the task text.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            description: "The task-state changes to apply.",
            items: {
              type: "object",
              properties: {
                task_index: {
                  type: "number",
                  description: "0-based task index, in document order (from read_scratchpad).",
                },
                state: {
                  type: "string",
                  enum: SCRATCHPAD_TASK_STATES,
                  description: "New state for this task.",
                },
              },
              required: ["task_index", "state"],
            },
          },
          expected_rev: {
            type: "number",
            description:
              "The `rev` from the read_scratchpad whose indices you are using. Rejected if the notebook changed since — re-read and retry.",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_scratchpad",
      description:
        "Rewrite the launcher's notebook IN FULL — the only way to remove or reword a task. Destructive and without undo, so use it only when they explicitly ask to delete or restructure something, and never to tick a box (update_scratchpad_task) or to add tasks (add_scratchpad_tasks). Call read_scratchpad immediately before, send back its content with your change applied and everything else kept verbatim, and pass its `rev` as expected_rev — a stale rev is refused rather than overwriting what they wrote meanwhile.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The COMPLETE new notebook markdown. An empty string clears the notebook entirely.",
          },
          expected_rev: {
            type: "number",
            description:
              "REQUIRED: the `rev` returned by the read_scratchpad this content is based on.",
          },
        },
        required: ["content", "expected_rev"],
      },
    },
  },
];

/**
 * Les TROIS écritures d'une session de relecture (MIN-168) — tout ce qu'un run
 * ancré à une pull request peut faire sortir de la sandbox. Exécutés par
 * `lib/server/agent/pr-tools.ts`.
 */
const PR_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "comment_pr_line",
      description:
        `Post a review comment ANCHORED to one line of this pull request's diff — the way a reviewer points at the exact code they mean. Use it for a concrete problem you can point at; anything you cannot anchor goes in your summary instead.\n\nThe line must be a line the DIFF shows, not just any line of the file: 'line' is numbered in the NEW file for side 'RIGHT' (an added line, or an unchanged context line of the diff) and in the OLD file for side 'LEFT' (a removed line). If the anchor does not resolve, the call comes back with the commentable line ranges of that file — pick one of them, or fold the point into your summary. Nothing is posted on a failed anchor.\n\nAt most ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments per review, hard: the result tells you how many you have left. Spend them on what matters most — fifteen anchored remarks is not a review, it is noise.`,
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Repo-relative path of the file, exactly as the diff names it (for a renamed file, either name works).",
          },
          line: {
            type: "number",
            description:
              "The line to anchor to, numbered in the NEW file for side 'RIGHT' and in the OLD file for side 'LEFT'.",
          },
          side: {
            type: "string",
            enum: ["LEFT", "RIGHT"],
            description:
              "'RIGHT' for a line the pull request adds or leaves unchanged, 'LEFT' for a line it removes. Defaults to 'RIGHT'.",
          },
          body: {
            type: "string",
            description:
              "One or two sentences in markdown: what is wrong and what to do instead. Address the code, not the author.",
          },
        },
        required: ["path", "line", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comment_pr",
      description:
        "Post a message in the pull request's conversation — this is where your review's summary goes, after you have placed your line comments. Say what the change does, what you think of it, and list the points you could not anchor to a line (with `path:line` in the text so they stay findable). State your verdict in the text; you have no way to approve or request changes on the forge, and that is deliberate — you give an opinion, a human holds the door. The signature naming you and your model is appended for you: do not write one.",
      parameters: {
        type: "object",
        properties: {
          body: {
            type: "string",
            description: "The message, in markdown.",
          },
        },
        required: ["body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reply_pr_thread",
      description:
        "Reply inside an existing review thread — the one anchored to a line of the diff. Use it to answer a question someone asked you there, or to say that a point has been addressed. 'comment_id' is the numeric id of a review comment of that thread, as your context lists it. To open a NEW point, use comment_pr_line instead; to talk to the pull request as a whole, comment_pr.",
      parameters: {
        type: "object",
        properties: {
          comment_id: {
            type: "number",
            description: "Numeric id of a review comment of the thread you are replying to.",
          },
          body: { type: "string", description: "The reply, in markdown." },
        },
        required: ["comment_id", "body"],
      },
    },
  },
];

/**
 * LES PULL REQUESTS DU PROJET (MIN-267) — servies aux ancrages TICKET et CARNET,
 * jamais à la relecture (qui a `PR_TOOLS` ci-dessus, sur SA pull request).
 * Exécutées par `lib/server/agent/project-pr-tools.ts`.
 *
 * Ce jeu-ci VA JUSQU'AU BOUT : verdict de review et fusion comprises. C'est une
 * décision explicite du propriétaire du produit, contraire à la doctrine de
 * MIN-141 qui vaut encore pour la relecture — le pourquoi et ce que ça coûte
 * sont dans l'en-tête de `project-pr-tools.ts`.
 */
const PROJECT_PR_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "list_pull_requests",
      description:
        "List the pull requests of this project's repository, most recently updated first — the inventory you need before saying anything about 'the pull requests of this week'. Returns one compact row per pull request: number, title, state (draft/open/merged/closed), author, head and base branches, url, when it was opened/merged/last updated, and the minddy ticket it implements when it has one. Filter with 'state', 'author' and 'updated_since'; the result says whether it was cut at your 'limit'. This reads minddy's own copy of the list (refreshed from the forge when it has gone stale), so listing thirty pull requests costs one call, not thirty. Then read_pull_request opens the ones that matter.",
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "array",
            items: { type: "string", enum: ["draft", "open", "merged", "closed"] },
            description:
              "Keep only these states. Omit for all of them. 'draft' and 'open' are both alive; a merged pull request is never 'closed' here.",
          },
          author: {
            type: "string",
            description: "Keep only the pull requests opened by this forge login (exact, case-insensitive).",
          },
          updated_since: {
            type: "string",
            description:
              "Keep only what moved since this date — '2026-08-03' or a full ISO timestamp. This is the filter for a weekly report.",
          },
          limit: {
            type: "number",
            description: "Max rows (default 30, max 100).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_pull_request",
      description:
        "Open ONE pull request of this project by its number: title, description, state, draft, author, branches, dates, its CI checks (aggregate state, how many pass, the failing ones by name), its approval counts, the files it touches with their +/− counts, its review threads (each with file, line, side, whether it is resolved or outdated, and every message) and its conversation. 'checks: null' means they could not be read, not that they pass; 'mergeable: null' means the forge has not computed it yet, not 'no'.\n\nThe DIFF is not included by default — pass include_diff: true to get each file's patch. Reading fifteen pull requests to report on the week does not need fifteen diffs; reviewing one does.",
      parameters: {
        type: "object",
        properties: {
          pull_request: {
            type: "number",
            description: "Number of the pull request, as list_pull_requests returns it.",
          },
          include_diff: {
            type: "boolean",
            description: "Include each file's patch (truncated past ~4000 characters). Default false.",
          },
        },
        required: ["pull_request"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comment_pull_request",
      description:
        "Post a message in a pull request's conversation — a summary of what you found, an answer to a question asked there, a note about what changed. The signature naming you and your model is appended for you: do not write one. To point at a precise line, comment_pull_request_line; to give a formal verdict the forge records, review_pull_request.",
      parameters: {
        type: "object",
        properties: {
          pull_request: { type: "number", description: "Number of the pull request." },
          body: { type: "string", description: "The message, in markdown." },
        },
        required: ["pull_request", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comment_pull_request_line",
      description:
        `Post a remark ANCHORED to one line of a pull request's diff. The line must be a line the DIFF shows: 'line' is numbered in the NEW file for side 'RIGHT' (an added or unchanged line of the diff) and in the OLD file for side 'LEFT' (a removed line). If the anchor does not resolve, the call comes back with that file's commentable ranges and nothing is posted — pick one of them, or make the point in comment_pull_request.\n\nAt most ${AI_REVIEW_MAX_INLINE_COMMENTS} anchored remarks per run, ACROSS EVERY pull request: the result tells you how many are left. Spend them on what matters most.`,
      parameters: {
        type: "object",
        properties: {
          pull_request: { type: "number", description: "Number of the pull request." },
          path: {
            type: "string",
            description: "Repo-relative path, exactly as the diff names it (for a renamed file, either name works).",
          },
          line: {
            type: "number",
            description: "The line to anchor to, numbered in the NEW file for 'RIGHT' and the OLD file for 'LEFT'.",
          },
          side: {
            type: "string",
            enum: ["LEFT", "RIGHT"],
            description: "'RIGHT' for a line the pull request adds or leaves unchanged, 'LEFT' for one it removes. Defaults to 'RIGHT'.",
          },
          body: {
            type: "string",
            description: "One or two sentences in markdown: what is wrong and what to do instead. Address the code, not the author.",
          },
        },
        required: ["pull_request", "path", "line", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reply_pull_request_thread",
      description:
        "Reply inside an existing review thread of a pull request — to answer a question someone asked there, or to say a point has been addressed. 'comment_id' is the id read_pull_request gives for that thread. To open a NEW point use comment_pull_request_line; to talk to the pull request as a whole, comment_pull_request.",
      parameters: {
        type: "object",
        properties: {
          pull_request: { type: "number", description: "Number of the pull request." },
          comment_id: {
            type: "number",
            description: "Numeric id of a review comment of the thread you are replying to.",
          },
          body: { type: "string", description: "The reply, in markdown." },
        },
        required: ["pull_request", "comment_id", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "review_pull_request",
      description:
        "Submit a FORMAL review verdict on a pull request, recorded by the forge: 'approve', 'request_changes' or 'comment', with the reasons in 'body'. This is not a comment — an approval can satisfy a branch protection rule and a change request can block the pull request until someone lifts it, so use it when you have actually read the change, and prefer comment_pull_request when you only have an opinion to share.\n\nIt is posted under minddy's account, never under a person's. A forge refuses to let an account review its own pull request: on a pull request YOU opened, the verdict is published as a comment instead — the result says so ('published: comment'), and you must report it as such rather than claiming an approval that did not happen.",
      parameters: {
        type: "object",
        properties: {
          pull_request: { type: "number", description: "Number of the pull request." },
          verdict: {
            type: "string",
            enum: ["approve", "request_changes", "comment"],
            description: "The verdict to record.",
          },
          body: {
            type: "string",
            description: "Why, in markdown. Required — a verdict without its reasons is not a review.",
          },
        },
        required: ["pull_request", "verdict", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_pull_request_state",
      description:
        "Change a pull request's state: 'merged' (merge it), 'closed' (close it without merging), 'open' (reopen a closed one), or 'ready_for_review' (take a draft out of draft). MERGING IS IRREVERSIBLE and ships code to the base branch — do it when you were asked to, or when the rule you are executing plainly says to, never as a tidy-up. Read the pull request first: 'mergeable_state' says whether the forge will even accept it (protected branch, red checks, missing approvals, conflicts all refuse the merge, and the error tells you which).",
      parameters: {
        type: "object",
        properties: {
          pull_request: { type: "number", description: "Number of the pull request." },
          state: {
            type: "string",
            enum: ["merged", "closed", "open", "ready_for_review"],
            description: "The state to move it to.",
          },
          merge_method: {
            type: "string",
            enum: ["merge", "squash", "rebase"],
            description:
              "For 'merged' only: how to merge. Omit for the repository's default. A method the forge does not offer is refused, and the error lists the ones it does.",
          },
        },
        required: ["pull_request", "state"],
      },
    },
  },
];

/** `create_pr` — même tool, formulé selon l'ancrage (le carnet n'a pas de ticket). */
const CREATE_PR_TOOL = (anchor: "issue" | "notebook"): AgentToolDef => ({
  type: "function",
  function: {
    name: "create_pr",
    description: `Open the pull request for ${anchor === "issue" ? "this ticket's" : "this session's"} working branch. Use it when the user asks for a pull request, or when you have completed a reviewable piece of work and want to submit it. The system commits and pushes your changes first, then opens the PR. If a pull request already exists for this branch it is NOT duplicated — pushes update it automatically (and a rejected/closed one is reopened), so you never need this tool more than once per branch. Fails if the branch has no changes.`,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Pull request title. Imperative, concise, in English.",
        },
        body: {
          type: "string",
          description:
            "Pull request description in markdown: what changed, why, how it was verified.",
        },
      },
      required: ["title"],
    },
  },
});

/**
 * Le catalogue appartient à la machine : le serveur ne voit ni ne stocke les
 * chemins. Il n'est donc servi qu'au run local, où le lanceur a pu joindre les
 * projets accessibles avec les dossiers qu'il a validés sur ce Mac.
 */
const LIST_LOCAL_PROJECTS_TOOL: AgentToolDef = {
  type: "function",
  function: {
    name: "list_projects",
    description:
      "List the projects you can access on this Mac. Each row has id, name and key, plus local_path when that project's linked repository has a valid local folder attached on this computer; local_path is null when it does not. Use this first when the user mentions another project: if it has a local_path, you can inspect that folder directly without asking the user for its location.",
    parameters: { type: "object", properties: {} },
  },
};

/** Jeu complet d'un run de TICKET. */
export const AGENT_TOOLS: AgentToolDef[] = [
  ...CORE_TOOLS,
  ...MINDDY_TOOLS,
  ...PROJECT_PR_TOOLS,
  CREATE_PR_TOOL("issue"),
];

/** Jeu complet d'un run CARNET (MIN-84) — mêmes tools minddy, `create_pr` sans ticket. */
export const NOTEBOOK_AGENT_TOOLS: AgentToolDef[] = [
  ...CORE_TOOLS,
  ...MINDDY_TOOLS,
  ...PROJECT_PR_TOOLS,
  CREATE_PR_TOOL("notebook"),
];

/** Ce qu'une session de relecture garde du cœur : LIRE, chercher, exécuter. */
const PR_REVIEW_CORE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read_file",
  "list_dir",
  "glob",
  "grep",
  "run_command",
]);

/**
 * Les lecteurs minddy d'une relecture : le ticket que la PR met en œuvre.
 *
 * `read_feedback` en fait partie (MIN-245) parce que `read_issue` PROMET
 * `linked_feedback` — « the user requests from the product's feedback board that
 * this ticket implements ». Sans lui, une relecture lit des identifiants qu'elle
 * n'a aucun moyen d'ouvrir, alors que c'est justement là que se trouve ce que la
 * PR devait résoudre. Il ne lit rien du dépôt et n'écrit nulle part : il ne
 * touche pas à la lecture seule de la session.
 */
const PR_REVIEW_MINDDY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search_issues",
  "read_issue",
  "read_feedback",
  "read_resource",
  // Le WIKI en lecture (MIN-273) : une relecture qui juge « ça ne respecte pas la
  // convention » a besoin de pouvoir lire la convention. Les écritures de page
  // restent dehors, comme celles de ticket — relire n'autorise pas à réécrire.
  "list_pages",
  "read_page",
  // Les OBJECTIFS en lecture (MIN-287) : « cette PR sert-elle le but du
  // ticket ? » ne se juge pas sans le but. Les écritures d'objectif restent
  // dehors, comme celles de ticket et de page.
  "list_objectives",
  "read_objective",
]);

/**
 * Jeu complet d'une session de RELECTURE (MIN-168). Ce qui n'y est pas dit ce
 * qu'elle est :
 *  - **aucune édition** (`edit_file`, `apply_edits`, `write_file`, `apply_patch`,
 *    `move_file`, `delete_file`) ni `create_pr` : une review ne touche pas au
 *    dépôt, et la lecture seule est une propriété du JEU DE TOOLS — pas une
 *    phrase de prompt qu'un modèle peut ignorer (même doctrine que le sous-agent
 *    `explore`). Le harnais ne commite ni ne pousse pour elle non plus
 *    (`writesToRepo`, execute.ts) : les deux moitiés de la même garantie ;
 *  - **aucune écriture minddy** (`update_issue`, `write_issue_plan`,
 *    `create_issue`) ni carnet : relire une PR n'autorise pas à réécrire les
 *    tickets de l'équipe ni les notes de quelqu'un ;
 *  - **aucune délégation** ni `run_background` : une review tient dans une
 *    session, et un serveur laissé vivant n'a rien à y faire ;
 *  - **pas d'`update_plan`, pas d'`ask_user`, pas de `report_verdict`** : la
 *    checklist n'a pas de lecteur ici, la question se pose dans le fil de la PR,
 *    et le verdict s'écrit dans le corps de la synthèse (MIN-141).
 * Restent les lecteurs, le shell (type-check, test ciblé), les lecteurs minddy et
 * les trois écritures de PR.
 */
export const PR_REVIEW_TOOLS: AgentToolDef[] = [
  ...CORE_TOOLS.filter((t) => PR_REVIEW_CORE_TOOL_NAMES.has(t.function.name)),
  ...MINDDY_TOOLS.filter((t) => PR_REVIEW_MINDDY_TOOL_NAMES.has(t.function.name)),
  ...PR_TOOLS,
];

/** Les deux interfaces d'édition, mutuellement EXCLUSIVES (MIN-115). */

/**
 * Ce qu'un run SANS INTERLOCUTEUR n'a pas (MIN-185) — cf. `agentToolsFor`, qui
 * documente les deux pourquoi. La liste est ici, à côté des autres exclusions
 * structurelles, pour qu'on la trouve en cherchant « qui retire un tool ? ».
 */
const NON_INTERACTIVE_FORBIDDEN_TOOLS: ReadonlySet<string> = new Set([
  "ask_user",
  "create_routine",
]);

/** Tools qui prennent un `issue` : leur CIBLE PAR DÉFAUT dépend de l'ancrage. */
const TARGETABLE_ISSUE_TOOLS = new Set([
  "read_issue",
  "update_issue",
  "write_issue_plan",
  "append_to_plan",
  "edit_issue_text",
]);

/**
 * Phrase de ciblage ajoutée à ces tools selon l'ancrage. Sans elle, un run de
 * carnet lirait « the ticket this session is anchored to » sur une session qui
 * n'en a pas, et un run de ticket croirait devoir passer `issue` à chaque appel.
 *
 * Une session de RELECTURE a un défaut CONDITIONNEL : le ticket que la pull
 * request met en œuvre — quand elle en porte un. **Beaucoup n'en portent pas**
 * (une PR humaine, une PR rattachée à rien : c'est l'état normal depuis MIN-143),
 * et la phrase doit donc décrire les deux cas plutôt que d'en promettre un. Elle
 * reste CONSTANTE pour l'ancrage, sans quoi le préfixe système cesserait d'être
 * partagé par le prompt caching.
 */
const TARGET_SUFFIX: Record<AgentAnchor, string> = {
  issue:
    " `issue` is OPTIONAL: omit it to act on the ticket this session is anchored to, pass it to target ANOTHER ticket of the project.",
  notebook:
    " `issue` is REQUIRED: this session is not anchored to a ticket, so name the one you mean — resolve it with search_issues first.",
  pr:
    " `issue` defaults to the ticket this pull request implements, when it has one — your context says so at the top. MANY PULL REQUESTS HAVE NO TICKET: there, omitting `issue` is refused, and you must name the ticket you mean (find it with search_issues) or do without one — reviewing a pull request never requires a ticket.",
};

/** `issue` poussé dans `required`, sans perdre ceux que le tool porte déjà. */
function withRequiredIssue(
  parameters: AgentToolDef["function"]["parameters"],
): AgentToolDef["function"]["parameters"] {
  const required = parameters.required ?? [];
  if (required.includes("issue")) return parameters;
  return { ...parameters, required: [...required, "issue"] };
}

/**
 * Jeu de tools d'un run, selon son ancrage, son modèle et l'accès au web.
 *
 * `web_search` passe par le plugin d'OpenRouter : il n'est offert que sur un run
 * qui parle à OpenRouter (quota minddy ou BYOK OpenRouter). Un BYOK OpenAI /
 * Anthropic / Google / générique n'a pas d'équivalent utilisable — leurs couches
 * de compatibilité OpenAI n'exposent pas de recherche native (Anthropic ignore
 * les server tools, OpenAI la réserve à ses modèles `*-search*` qui cherchent
 * TOUJOURS, Gemini ne la documente que hors chat) — et faire tourner la
 * recherche sur la clé de minddy reviendrait à payer le web d'un usage par
 * ailleurs illimité. Le tool disparaît alors purement et simplement.
 *
 * `apply_patch` (MIN-115) obéit à la même logique du tout ou rien : les modèles
 * `gpt-*` le reçoivent À LA PLACE d'`edit_file`/`apply_edits`/`write_file`, les
 * autres ne le voient pas. Servir les deux jeux ensemble ferait hésiter le modèle
 * entre deux façons de faire exactement la même chose.
 */
export function agentToolsFor(opts: {
  anchor: AgentAnchor;
  webSearch: boolean;
  /**
   * Plafond de recherches du TOUR, quand le run en sert (MIN-245). Il voyage en
   * option plutôt que d'être importé : la constante vit dans le module qui
   * facture la recherche (`lib/server/web-search.ts`), et celui-là n'entre pas
   * dans le bundle de la microVM — c'est le même chemin que `VmJob.webSearchMax`.
   * Sans lui la description dit « each search costs real money » sans jamais
   * dire combien, et le modèle apprend le plafond en heurtant le mur.
   */
  webSearchMax?: number;
  /** Modèle du run — décide de l'interface d'édition servie. */
  model?: string | null;
  /** Le modèle du run voit-il les images (MIN-111) ? Change ce que `read_resource`
   *  ANNONCE — le tool est là dans les deux cas, mais il ne promet une maquette
   *  regardable que quand elle le sera vraiment. */
  images?: boolean;
  /**
   * Le run peut-il faire tourner un sous-agent sur un AUTRE modèle (MIN-112) ? À
   * false, le champ `model` est RETIRÉ du schéma de `spawn_agent` : un run BYOK
   * Anthropic ne peut pas faire tourner `deepseek/…`, et un champ qui revient
   * toujours en erreur ne mérite pas d'être décrit (même règle du tout ou rien
   * que `web_search` et `apply_patch`). La délégation reste offerte — c'est
   * seulement le choix du modèle qui disparaît.
   */
  subagentModels?: boolean;
  /**
   * Le run est-il une étape d'une CHAÎNE d'automatisation (MIN-147) ? Seul ce
   * cas sert `report_verdict` : hors chaîne, personne ne lit un verdict, et un
   * tool sans lecteur est une invitation à s'en servir pour rien.
   */
  chain?: boolean;
  /**
   * Quelqu'un peut-il RÉPONDRE à ce run ? Faux pour un passage de ROUTINE
   * (MIN-185), et deux tools disparaissent alors — par le JEU DE TOOLS, jamais
   * par une phrase de prompt, même doctrine que la lecture seule d'une session
   * de relecture :
   *
   *  - **`ask_user`** : personne n'est devant l'écran à 9 h du matin. Une
   *    question laisserait le run planté en attente jusqu'à ce qu'on passe —
   *    une microVM gelée et un travail jamais rendu. La routine décide, et
   *    documente son choix dans sa réponse.
   *  - **`create_routine`** : une routine ne s'auto-réplique pas. Sans cette
   *    exclusion, une routine mal formulée pose une routine chaque nuit, et
   *    rien dans le produit ne la rattrape.
   *
   * `undefined` vaut « interactif » : tous les appelants historiques le sont.
   */
  interactive?: boolean;
  /**
   * LE TOUR JOUE-T-IL SUR LA MACHINE DE L'UTILISATEUR (MIN-293, puis MIN-364) ?
   *
   * ⚠ **CE DRAPEAU NE RETIRE PLUS RIEN, et la trace de ce qu'il retirait est ce
   * qui explique pourquoi.** `run_background` en était sorti pour une raison
   * d'exploitation nommée : les jobs partent en `setsid`, **explicitement pour
   * survivre au shell** ([background.ts](background.ts)), et ce qui les tue est le
   * `stopAll` de fin de tour — lequel ne tourne jamais quand le harness est tué
   * net (⌘Q, plantage du main process). Sur un Mac, le `npm run dev` du modèle
   * restait alors vivant, port 3000 tenu, et rien nulle part ne savait où le
   * retrouver.
   *
   * **Le motif est tombé** (décision D8) : le registre d'enfants
   * ([vm/child-registry.ts](vm/child-registry.ts)) existe depuis MIN-293 et sert
   * déjà le serveur opencode ; le superviseur y inscrit désormais les jobs de
   * fond, et le lanceur les relit au ⌘Q comme au démarrage. Ce que le retrait
   * coûtait était le plus gros écart de parité du dossier : un agent local ne
   * pouvait ni lancer un serveur, ni aller voir sa page rendre — la boucle de
   * feedback la plus courte qui existe, et précisément celle que l'app de bureau
   * rend possible pour la première fois.
   *
   * Le drapeau reste, parce qu'il reste la seule chose qui sache ce qu'est un
   * tour local, et parce que le prochain écart se déclarera ici.
   */
  local?: boolean;
}): AgentToolDef[] {
  const baseTools =
    opts.anchor === "issue"
      ? AGENT_TOOLS
      : opts.anchor === "pr"
        ? PR_REVIEW_TOOLS
        : NOTEBOOK_AGENT_TOOLS;
  const tools = opts.local ? [...baseTools, LIST_LOCAL_PROJECTS_TOOL] : baseTools;
  return tools
    .filter((t) => {
      const name = t.function.name;
      if (name === "web_search") return opts.webSearch;
      if (name === "report_verdict") return opts.chain === true;
      if (NON_INTERACTIVE_FORBIDDEN_TOOLS.has(name)) return opts.interactive !== false;
      return true;
    })
    .map((t) => {
      const name = t.function.name;
      if (opts.images === true && name === "read_resource") {
        return {
          ...t,
          function: { ...t.function, description: READ_RESOURCE_DESCRIPTION_WITH_IMAGES },
        };
      }
      if (name === "spawn_agent" && opts.subagentModels !== true) {
        return withoutModelField(t);
      }
      if (TARGETABLE_ISSUE_TOOLS.has(name)) {
        return {
          ...t,
          function: {
            ...t.function,
            description: t.function.description + TARGET_SUFFIX[opts.anchor],
            // Là où la prose dit « REQUIRED », le schéma doit le dire aussi
            // (MIN-245). Sans ça, un appel sans `issue` est VALIDE au schéma et
            // n'est refusé qu'à l'exécution (issue-tools.ts) : un round brûlé
            // par occurrence, exactement ce qu'un schéma sert à éviter. Le
            // remède se pose par tool et non globalement : `strict: true`
            // forcerait TOUS les champs dans `required` et obligerait à des
            // `null` explicites partout.
            //
            // Le CARNET seulement. L'ancrage PR a un défaut CONDITIONNEL — le
            // ticket de la pull request, quand elle en porte un — qu'un schéma
            // ne sait pas dire : l'y rendre obligatoire casserait le cas normal
            // au lieu d'épargner un round.
            ...(opts.anchor === "notebook"
              ? { parameters: withRequiredIssue(t.function.parameters) }
              : {}),
          },
        };
      }
      if (name === "web_search" && opts.webSearchMax != null) {
        return {
          ...t,
          function: {
            ...t.function,
            description: t.function.description.replace(
              "each search costs real money.",
              `each search costs real money. You get ${opts.webSearchMax} searches for this turn, no more — past that every call comes back as an error, so spend them on what you cannot read in the repository.`,
            ),
          },
        };
      }
      return t;
    });
}

/** `spawn_agent` sans son champ `model` — la phrase du modèle part avec lui. */
function withoutModelField(tool: AgentToolDef): AgentToolDef {
  const properties = Object.fromEntries(
    Object.entries(tool.function.parameters.properties).filter(([key]) => key !== "model"),
  );
  return {
    ...tool,
    function: {
      ...tool.function,
      description: tool.function.description.replace(
        /\n\nPrompt templates/,
        "\n\nThe sub-agent always runs on your own model (this session's provider serves a single model family).\n\nPrompt templates",
      ),
      parameters: { ...tool.function.parameters, properties },
    },
  };
}

/** Noms des tools de contrôle gérés par la boucle (pas par le Sandbox). */
export const CONTROL_TOOLS = new Set(["update_plan", "ask_user"]);

/**
 * Tools de DÉLÉGATION, exposés au parent seulement (MIN-112). Un sous-agent ne les
 * a pas : la hiérarchie à un niveau est STRUCTURELLE (`subagentToolsFor` les
 * retire), pas une consigne de prompt qu'un modèle peut ignorer.
 */
export const SUBAGENT_CONTROL_TOOLS: ReadonlySet<string> = new Set([
  "spawn_agent",
  "agent_status",
  "list_agents",
]);

/**
 * Tools qu'un sous-agent n'a JAMAIS, quel que soit son mode. Au-delà de la
 * délégation : le ticket, le carnet, la PR, la checklist de session et les jobs de
 * fond appartiennent au PARENT. Une fille qui coche le plan de l'utilisateur ou qui
 * ouvre une pull request agirait au nom d'une conversation qu'elle n'a pas lue.
 */
const SUBAGENT_FORBIDDEN_TOOLS: ReadonlySet<string> = new Set([
  ...SUBAGENT_CONTROL_TOOLS,
  "create_pr",
  "ask_user",
  "update_plan",
  "run_background",
  ...MINDDY_TOOLS.map((t) => t.function.name),
  // Les pull requests du projet appartiennent au parent, pour la même raison que
  // `create_pr` : une fille qui fusionne ou qui commente agirait au nom d'une
  // conversation qu'elle n'a pas lue. Elle rapporte, le parent décide.
  ...PROJECT_PR_TOOLS.map((t) => t.function.name),
]);

/** Les quatre lecteurs : tout ce qu'un sous-agent `explore` a le droit de faire. */
const SUBAGENT_READ_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "list_dir",
  "glob",
  "grep",
]);
