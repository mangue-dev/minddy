import "server-only";

import { MAX_BACKGROUND_JOBS } from "./background";

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
 *  - vérif       : run_command (install/lint/build/tests, git, etc.), run_background
 *                  (serveur de dev / watcher : démarrer, sonder, arrêter — MIN-114)
 *  - livraison   : create_pr (ouvre LA pull request du ticket quand il n'y en a pas)
 *  - ticket      : read_issue (état VIVANT du ticket : champs, plan, commentaires,
 *                  pièces jointes), read_attachment, write_issue_plan (écrit le
 *                  plan du ticket SUR DEMANDE de l'utilisateur, sans l'appliquer)
 *                  — exécutés par lib/server/agent/issue-tools.ts.
 *
 * Deux JEUX selon l'ancrage du run (MIN-84) : `AGENT_TOOLS` (run de ticket) et
 * `NOTEBOOK_AGENT_TOOLS` (run carnet — les tools ticket sont remplacés par
 * read_scratchpad / update_scratchpad_task / create_issue, exécutés par
 * lib/server/agent/notebook-tools.ts, et create_pr est reformulé sans ticket).
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

/** Cœur commun aux deux ancrages : exploration, édition, vérification, checklist. */
const CORE_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a file from the repository. Returns its content with 1-based line numbers ('lineno\\tcontent'), so you can target edits precisely. By default returns up to 2000 lines from the top; use 'offset' and 'limit' to read a specific window of a large file. Very long lines are truncated. Always read a file before editing it — the edit tool needs the exact current text.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Repo-relative path, e.g. 'src/app/page.tsx'. Also accepts the absolute 'full_output_path' returned by run_command, to re-read a long command output in full.",
          },
          offset: {
            type: "number",
            description: "1-based line number to start reading from. Optional; defaults to 1.",
          },
          limit: {
            type: "number",
            description: "Max number of lines to return. Optional; defaults to 2000.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "List the entries of a directory in the repository (directories are suffixed with '/'). Use to explore the tree.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repo-relative directory path. Defaults to the repo root '.'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description:
        "Find files by glob pattern (gitignore-aware; tracked and new files, ignored files excluded). Returns up to 100 repo-relative paths. Use '**' to match across directories, e.g. '**/*.tsx' or 'src/**/use-*.ts'. Use this to locate files by name/shape before reading them.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern, e.g. '**/*.ts' or 'app/**/route.ts'.",
          },
          path: {
            type: "string",
            description: "Optional subtree to search within (repo-relative).",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Search file contents with git grep (POSIX extended regex; gitignore-aware, binary files skipped). By default returns matching 'file:line:content' rows. Use to locate symbols, usages, imports, or config. Narrow with 'glob'/'path' and cap noisy searches with 'head_limit'. To search a literal snippet of code — anything containing { } ( ) [ ] * + ? | . \\ — set 'fixed_strings' rather than escaping it by hand.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "POSIX extended regex to search for, e.g. 'function\\s+foo' or 'useState'.",
          },
          path: {
            type: "string",
            description:
              "Optional subtree (repo-relative) to limit the search to. Also accepts the absolute 'full_output_path' returned by run_command, to search a long command output.",
          },
          glob: {
            type: "string",
            description: "Optional file glob to limit the search, e.g. '**/*.ts'.",
          },
          output_mode: {
            type: "string",
            enum: ["content", "files_with_matches", "count"],
            description:
              "'content' (default) → file:line:text rows; 'files_with_matches' → just file paths; 'count' → matches per file.",
          },
          ignore_case: { type: "boolean", description: "Case-insensitive search." },
          fixed_strings: {
            type: "boolean",
            description:
              "Treat 'pattern' as a literal string instead of a regex. Use it whenever you are searching for a verbatim snippet of code, e.g. 'onUpdateIssue={' or 'useState('.",
          },
          context: {
            type: "number",
            description: "Lines of context around each match (content mode only, max 20).",
          },
          head_limit: {
            type: "number",
            description: "Cap the number of output lines returned.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Edit an existing file by replacing an exact snippet. Provide 'old_string' — the exact text to replace (copy it verbatim from read_file, including indentation) — and 'new_string'. 'old_string' must be UNIQUE in the file; include a few surrounding lines to make it unique, or set replace_all to change every occurrence. This is the primary way to change code: prefer it over rewriting whole files. Read the file first so old_string matches.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative file path to edit." },
          old_string: {
            type: "string",
            description: "The exact existing text to replace (must be unique unless replace_all).",
          },
          new_string: {
            type: "string",
            description: "The replacement text. Must differ from old_string.",
          },
          replace_all: {
            type: "boolean",
            description: "Replace every occurrence of old_string (default false).",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_edits",
      description:
        "Apply several changes across one or more files in a SINGLE call. Use it when your change spans multiple files or multiple spots — cheaper and more coherent than many edit_file calls. Each change is one op: 'update' (apply a list of old_string→new_string edits to a file), 'add' (create a file with content), 'delete' (remove a file), or 'move' (rename a file). Changes apply in order; the result reports per-change success/failure so you can retry only the ones that failed. For a single-spot change in one file, prefer edit_file.",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            description: "Ordered list of file changes.",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "Repo-relative file path." },
                op: {
                  type: "string",
                  enum: ["update", "add", "delete", "move"],
                  description: "Change type. Defaults to 'update'.",
                },
                edits: {
                  type: "array",
                  description: "For op 'update': the edits to apply to this file, in order.",
                  items: {
                    type: "object",
                    properties: {
                      old_string: { type: "string", description: "Exact text to replace (verbatim, unique)." },
                      new_string: { type: "string", description: "Replacement text." },
                      replace_all: { type: "boolean", description: "Replace every occurrence." },
                    },
                    required: ["old_string", "new_string"],
                  },
                },
                content: { type: "string", description: "For op 'add': the full content of the new file." },
                move_to: { type: "string", description: "For op 'move': the destination path." },
              },
              required: ["path"],
            },
          },
        },
        required: ["changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create a NEW file with the given full content (parent directories are created as needed). Use this only for files that do not exist yet — to change an existing file, use edit_file instead. Match the existing code style.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative file path." },
          content: { type: "string", description: "The complete file content." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description:
        "Rename or move a file within the repository (uses git so the pull request captures the rename). Refuses if the destination already exists.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Current repo-relative path." },
          to: { type: "string", description: "New repo-relative path." },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description:
        "Delete a file from the repository (uses git so the deletion appears in the pull request).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative path to delete." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command in the repository root (e.g. install dependencies, run the linter, build, or the test suite to verify your changes). Returns exitCode + stdout + stderr. Long output is truncated in the MIDDLE — you always get the beginning and the end — and the complete output is saved in the sandbox, at the returned 'full_output_path': search it with grep (pass that path as 'path') or read it with read_file (offset/limit). Never pipe to head/tail and never narrow a command just to shorten its output. AVOID using `cd <dir> && <cmd>` — pass 'workdir' instead. Non-interactive only; it is killed after a timeout.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command, e.g. 'npm test' or 'npm run build'.",
          },
          workdir: {
            type: "string",
            description:
              "Optional repo-relative directory to run the command in, e.g. 'packages/api'. Defaults to the repository root — which is where you already are, so only pass it when you need ANOTHER directory. Use this instead of `cd <dir> && <cmd>`.",
          },
          timeout_ms: {
            type: "number",
            description: `Optional timeout in milliseconds, capped at ${RUN_COMMAND_TIMEOUT_MS} (also the default). Only lower it — for a command you expect to be quick and that would otherwise hang (a watcher, a prompt), so you get the turn back fast.`,
          },
        },
        required: ["command"],
      },
    },
  },
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
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user one or more clarifying questions and END YOUR TURN — the session pauses until they answer, then resumes with their reply. Use it when a genuine product or implementation decision blocks you AND the likely answers are enumerable (which approach, which of two behaviors, scope in/out); for open-ended questions just ask in your reply text instead. Bundle RELATED blocking questions into a single call rather than asking across several turns — they are all answered in ONE reply. The user may also skip the questions without answering — proceed with your best judgment then.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            description:
              "Questions to show the user (1–4). Prefer the fewest that unblock the work.",
            items: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description:
                    "The complete question to ask. Clear, specific, ONE short sentence ending with a question mark.",
                },
                header: {
                  type: "string",
                  description:
                    "Very short label displayed as a chip/tab (max 12 chars). Examples: 'Scope', 'Approach', 'Naming'.",
                },
                multi_select: {
                  type: "boolean",
                  description:
                    "Set true when several answers can be combined (checkboxes). Omit/false for mutually exclusive choices (radio).",
                },
                options: {
                  type: "array",
                  description:
                    "2–4 distinct choices (mutually exclusive unless multi_select). Put the recommended option FIRST and suffix its label with ' (Recommended)'. Do NOT include an 'Other' option — the client adds a free-form one automatically.",
                  items: {
                    type: "object",
                    properties: {
                      label: {
                        type: "string",
                        description:
                          "Concise display text for this choice (1–5 words).",
                      },
                      description: {
                        type: "string",
                        description:
                          "One short sentence explaining what this choice means or its impact/tradeoff.",
                      },
                    },
                    required: ["label"],
                  },
                },
              },
              required: ["question", "header", "options"],
            },
          },
        },
        required: ["questions"],
      },
    },
  },
];

/** Tools d'ANCRAGE TICKET : l'état vivant de l'issue + la PR du ticket. */
const ISSUE_ANCHOR_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_issue",
      description:
        "Re-read the minddy ticket this session is anchored to: every field (title, description, status, priority, effort, assignee, due date…), its implementation plan parsed into tasks with their states, its attachments (metadata + ids), the most recent comments, sub-issues and relations. The ticket context you were given at session start is a SNAPSHOT — call this whenever fresh state matters (the user may have edited the ticket, added comments or attachments mid-session, or refers to something not in your context). Returns the last 15 comments by default.",
      parameters: {
        type: "object",
        properties: {
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
      name: "read_attachment",
      description:
        "Open one attachment of the ticket (or of one of its comments) by id — get the id from read_issue. Text files come back inline (capped); binaries and large files return the metadata plus a short-lived signed download_url — if you need the bytes in the sandbox (a spec to read in full, an asset to add to the repo), download them with run_command (`curl -sL '<download_url>' -o …`), outside the repository unless the file belongs in the commit.",
      parameters: {
        type: "object",
        properties: {
          attachment_id: {
            type: "string",
            description: "Attachment id from read_issue (issue or comment attachments).",
          },
        },
        required: ["attachment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_issue_plan",
      description:
        "Write the ticket's implementation PLAN — the persistent markdown plan stored on the minddy ticket, visible to the whole team. Call it ONLY when the user asks for a plan (e.g. 'prépare un plan', 'plan this ticket', 'how would you do it? write it down') — never spontaneously. Full replacement: send the complete plan. Format: a short context (goal, approach), then ordered checkbox tasks — '- [ ]' pending, '- [~]' in progress, '- [x]' done, '- [-]' cancelled — each naming the exact files/components/functions/migrations to touch, and a final verification step. Explore the code FIRST so tasks reference real paths. Writing the plan does NOT start the work: after writing it, reply and stop unless the user also asked to implement. Distinct from update_plan, which is only your live session checklist.",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "string",
            description: "The complete plan in markdown (context + '- [ ]' tasks + verification).",
          },
        },
        required: ["plan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_pr",
      description:
        "Open the pull request for this ticket's working branch. Use it when the user asks for a pull request, or when you have completed a reviewable piece of work and want to submit it. The system commits and pushes your changes first, then opens the PR. If a pull request already exists for this branch it is NOT duplicated — pushes update it automatically (and a rejected/closed one is reopened), so you never need this tool more than once per branch. Fails if the branch has no changes.",
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
  },
];

/** États de tâche du carnet, tels que le tool les accepte. */
const NOTEBOOK_TASK_STATES = ["pending", "in_progress", "completed", "cancelled"];

/** Tools d'ANCRAGE CARNET (MIN-84) : le carnet du lanceur + la promotion en ticket. */
const NOTEBOOK_ANCHOR_TOOLS: AgentToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_scratchpad",
      description:
        "Re-read the launcher's notebook (their personal cross-project notes doc): the full markdown, plus every checkbox task parsed with a stable 0-based task_index, its text and its state (pending '- [ ]', in_progress '- [~]', completed '- [x]', cancelled '- [-]'), and `rev`, the doc's version. The note you were given at session start is a SNAPSHOT — call this whenever fresh state matters, and ALWAYS right before update_scratchpad_task so your indices and rev are current.",
      parameters: { type: "object", properties: {} },
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
                  enum: NOTEBOOK_TASK_STATES,
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
      name: "create_issue",
      description:
        "Create a REAL ticket in the project this session works on. Use it ONLY when the work genuinely deserves a formal, trackable ticket (a substantial feature or bug the team should see) or when the user asks for one — never automatically, and never as a substitute for just doing the work. The note itself stays in the notebook; creating a ticket does not remove it.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Ticket title. Concise, imperative.",
          },
          description: {
            type: "string",
            description: "Ticket description in markdown (context, scope, acceptance).",
          },
          priority: {
            type: "string",
            enum: ["none", "urgent", "high", "medium", "low"],
            description: "Optional priority.",
          },
          effort: {
            type: "string",
            enum: ["xs", "s", "m", "l", "xl"],
            description: "Optional t-shirt effort estimate.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_pr",
      description:
        "Open the pull request for this session's working branch. Use it when the user asks for a pull request, or when you have completed a reviewable piece of work and want to submit it. The system commits and pushes your changes first, then opens the PR. If a pull request already exists for this branch it is NOT duplicated — pushes update it automatically (and a rejected/closed one is reopened), so you never need this tool more than once per branch. Fails if the branch has no changes.",
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
  },
];

/** Jeu complet d'un run de TICKET (l'historique — inchangé). */
export const AGENT_TOOLS: AgentToolDef[] = [...CORE_TOOLS, ...ISSUE_ANCHOR_TOOLS];

/** Jeu complet d'un run CARNET (MIN-84). */
export const NOTEBOOK_AGENT_TOOLS: AgentToolDef[] = [...CORE_TOOLS, ...NOTEBOOK_ANCHOR_TOOLS];

/**
 * Jeu de tools d'un run, selon son ancrage et l'accès au web.
 *
 * `web_search` passe par le plugin d'OpenRouter : il n'est offert que sur un run
 * qui parle à OpenRouter (quota minddy ou BYOK OpenRouter). Un BYOK OpenAI /
 * Anthropic / Google / générique n'a pas d'équivalent utilisable — leurs couches
 * de compatibilité OpenAI n'exposent pas de recherche native (Anthropic ignore
 * les server tools, OpenAI la réserve à ses modèles `*-search*` qui cherchent
 * TOUJOURS, Gemini ne la documente que hors chat) — et faire tourner la
 * recherche sur la clé de minddy reviendrait à payer le web d'un usage par
 * ailleurs illimité. Le tool disparaît alors purement et simplement.
 */
export function agentToolsFor(opts: {
  anchor: "issue" | "notebook";
  webSearch: boolean;
}): AgentToolDef[] {
  const tools = opts.anchor === "issue" ? AGENT_TOOLS : NOTEBOOK_AGENT_TOOLS;
  return opts.webSearch ? tools : tools.filter((t) => t.function.name !== "web_search");
}

/** Noms des tools de contrôle gérés par la boucle (pas par le Sandbox). */
export const CONTROL_TOOLS = new Set(["update_plan", "ask_user"]);
