import "server-only";

import { MAX_BACKGROUND_JOBS } from "./background";
import { usesApplyPatch } from "./patch";
import { SUBAGENT_TEMPLATE_IDS } from "./subagent-templates";
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
 *                  plan, commentaires, pièces jointes), read_attachment,
 *                  update_issue (titre / description / effort — JAMAIS le statut),
 *                  write_issue_plan (écrit le plan SUR DEMANDE, sans l'appliquer),
 *                  create_issue — exécutés par lib/server/agent/issue-tools.ts.
 *  - carnet      : read_scratchpad, add_scratchpad_tasks, update_scratchpad_task,
 *                  set_scratchpad — exécutés par lib/server/agent/scratchpad-tools.ts.
 *
 * Les dix tools minddy sont servis aux DEUX ancrages (MIN-125) : l'ancrage du run
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
            description:
              "Glob pattern, e.g. '**/*.ts', 'app/**/route.ts' or '**/*.{ts,tsx}'.",
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
            description:
              "Optional file glob to limit the search, e.g. '**/*.ts' or '**/*.{ts,tsx}'.",
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
      name: "apply_patch",
      // Description reprise de `packages/opencode/src/tool/apply_patch.txt` (MIT) :
      // c'est le texte sur lequel la famille GPT est rodée, on ne le réécrit pas.
      // Seule la queue est à nous — chemins relatifs au dépôt, résultat par fichier.
      description:
        "Use the `apply_patch` tool to edit files. Your patch language is a stripped-down, file-oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high-level envelope:\n\n*** Begin Patch\n[ one or more file sections ]\n*** End Patch\n\nWithin that envelope, you get a sequence of file operations.\nYou MUST include a header to specify the action you are taking.\nEach operation starts with one of three headers:\n\n*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).\n*** Delete File: <path> - remove an existing file. Nothing follows.\n*** Update File: <path> - patch an existing file in place (optionally with a rename).\n\nExample patch:\n\n```\n*** Begin Patch\n*** Add File: hello.txt\n+Hello world\n*** Update File: src/app.py\n*** Move to: src/main.py\n@@ def greet():\n-print(\"Hi\")\n+print(\"Hello, world!\")\n*** Delete File: obsolete.txt\n*** End Patch\n```\n\nIt is important to remember:\n\n- You must include a header with your intended action (Add/Delete/Update)\n- You must prefix new lines with `+` even when creating a new file\n\nPaths are repo-relative. Inside an Update section, each hunk starts with `@@` (optionally naming the enclosing context, e.g. `@@ def greet():`) and then lists its lines: ` ` for unchanged context, `-` for removed, `+` for added. Include a few unchanged context lines around each change so the hunk anchors unambiguously, and read the file first. One envelope can carry as many files as your change needs; the result reports success per file, so retry only the sections that failed.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "string",
            description:
              "The full patch text, from '*** Begin Patch' to '*** End Patch'.",
          },
        },
        required: ["patch"],
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
  // ── Délégation (MIN-112) : UN tool pour déléguer, deux pour regarder. ────────
  {
    type: "function",
    function: {
      name: "spawn_agent",
      description:
        `Delegate one well-defined piece of work to a SUB-AGENT: a child session with its own context, its own model if you want, that does the work and hands you back a REPORT. Use it when the work is broad but its conclusion is short (searching the whole repo for every caller of something), when several independent pieces can run at the same time, or when a task would flood your own context with output you do not need to keep. Do NOT use it for a targeted change you can make in two tool calls — briefing a sub-agent costs more than doing that yourself.\n\nIT DOES NOT BLOCK. The call returns immediately with an id, and you keep working. When the sub-agent finishes, its report is handed to you automatically — even if you have already replied: you get woken up. There is deliberately NO tool to wait for a sub-agent; asking for one is asking for nothing. If you have nothing useful to do meanwhile, END YOUR TURN and say what you are waiting for: the system holds the turn open at zero cost and re-opens it when the report lands. Never poll agent_status in a loop to pass the time — a sub-agent can take several minutes, and every check costs money to learn something you were going to be told anyway.\n\nTwo modes. 'explore' is READ-ONLY (it can read, search and list, nothing else) and several can run in parallel. 'implement' EDITS the repository, and only one writer is allowed at a time because the sandbox is SHARED — while an 'implement' sub-agent is running, YOUR OWN editing tools are refused too (reading and run_command stay open). So delegate an 'implement' when you have something else to do that is not editing.\n\nWhat the sub-agent does NOT have: your conversation, the ticket, the notebook, the pull request, the ability to ask the user anything, and the ability to delegate further. It gets your prompt and nothing else — so write it as a complete briefing, and describe 'expected_output' precisely: the report is ALL you get back, and you cannot ask a follow-up question.` +
        `\n\nPrompt templates (optional, recommended): pass 'prompt_template' to wrap your task in a pre-written briefing — ${SUBAGENT_TEMPLATE_IDS.join(", ")} — and fill its variables in 'template_vars'. Your 'task' and 'expected_output' are injected into it automatically.`,
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description:
              "The work to delegate, written for someone who has never seen this conversation: what to do, where (paths, symbols), and what NOT to touch. Be specific — it cannot ask you to clarify.",
          },
          mode: {
            type: "string",
            enum: ["explore", "implement"],
            description:
              "'explore' = read-only investigation (parallelisable). 'implement' = edits the repository (one at a time, and it freezes your own editing tools while it runs).",
          },
          expected_output: {
            type: "string",
            description:
              "What the report must contain, concretely: the file paths and line numbers you need, the answer to a specific question, the list of call sites, what it verified. The report is the only thing that comes back.",
          },
          model: {
            type: "string",
            description:
              "Optional: run the sub-agent on ANOTHER model — an id from the catalogue, or the name of one of the 'Favorites for sub-agents' listed in your instructions. Omit it to use your own model. A cheap fast model is usually right for 'explore'; keep a strong one for 'implement'.",
          },
          thinking_effort: {
            type: "string",
            enum: ["low", "medium", "high"],
            description:
              "Optional reasoning budget for the sub-agent: 'low' for mechanical work (grep, listing, reading), 'high' for hard analysis or subtle code. Defaults to your own level.",
          },
          prompt_template: {
            type: "string",
            enum: [...SUBAGENT_TEMPLATE_IDS],
            description:
              "Optional pre-written briefing to wrap your task in. Omit to send 'task' as-is.",
          },
          template_vars: {
            type: "object",
            description:
              "Values for the template's variables (e.g. {\"file_path\": \"lib/foo.ts\", \"constraints\": \"do not touch the tests\"}). 'task' and 'expected_output' are filled in for you.",
          },
        },
        required: ["task", "mode", "expected_output"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_status",
      description:
        "Look in on ONE of your sub-agents: whether it is still running, finished, failed or was cut off, how many steps it has taken, and its report if it already has one. Read-only. You do not need to poll it — a finished sub-agent's report is handed to you automatically; this is for when you want to know where it stands before deciding what to do next.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The sub-agent id returned by spawn_agent, e.g. 'sub-1'.",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_agents",
      description:
        "List every sub-agent of this session with its state, task, mode, model and thinking effort — plus how many are running and how many may run at once. Read-only. Use it to see what you have in flight before delegating more.",
      parameters: { type: "object", properties: {} },
    },
  },
];

/**
 * Description de `read_attachment`, en deux versions : un run dont le modèle voit
 * les images ANNONCE qu'il peut regarder une maquette (MIN-111) ; les autres
 * gardent le texte d'avant, au mot près. Promettre une capacité qu'on n'a pas ferait
 * dire au modèle « je regarde la maquette » sur un résultat qui ne porte que des
 * métadonnées. `agentToolsFor` choisit.
 */
const READ_ATTACHMENT_DESCRIPTION =
  "Open one attachment of the ticket (or of one of its comments) by id — get the id from read_issue. Text files come back inline (capped); binaries and large files return the metadata plus a short-lived signed download_url — if you need the bytes in the sandbox (a spec to read in full, an asset to add to the repo), download them with run_command (`curl -sL '<download_url>' -o …`), outside the repository unless the file belongs in the commit.";

const READ_ATTACHMENT_DESCRIPTION_WITH_IMAGES =
  "Open one attachment of the ticket (or of one of its comments) by id — get the id from read_issue. An IMAGE (png, jpeg, webp, gif) comes back as the image itself, attached to the result: you actually see it. When the ticket carries a mockup, a screenshot or a diagram, open it BEFORE writing the code it describes, and say what you see — a layout you were shown beats a layout you were told about. Text files come back inline (capped); other binaries and oversized files return the metadata plus a short-lived signed download_url — if you need the bytes in the sandbox (a spec to read in full, an asset to add to the repo), download them with run_command (`curl -sL '<download_url>' -o …`), outside the repository unless the file belongs in the commit.";

/** États de tâche du carnet, tels que les tools les acceptent. */
const SCRATCHPAD_TASK_STATES = ["pending", "in_progress", "completed", "cancelled"];

/** Référence de ticket acceptée partout où un tool prend `issue`. */
const ISSUE_REF_DESCRIPTION =
  "The ticket to act on: a UUID, an identifier like 'MIN-42', or a bare issue number. Resolve it with search_issues when you only know its subject.";

/**
 * Tools minddy, servis aux DEUX ancrages (MIN-125) : les tickets du projet du run
 * et le carnet de son lanceur. Ce qui reste ancrage-dépendant est ajouté par
 * `agentToolsFor` — la phrase de ciblage des tools qui prennent `issue`, et
 * `create_pr`, déclaré à part parce que sa formulation change.
 */
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
        "Read a minddy ticket in full: every field (title, description, status, priority, effort, assignee, due date…), its implementation plan parsed into tasks with their states, its attachments (metadata + ids), the most recent comments, sub-issues and relations. Any ticket context you were given at session start is a SNAPSHOT — call this whenever fresh state matters (the user may have edited the ticket, added comments or attachments mid-session, or refers to something not in your context). Returns the last 15 comments by default.",
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
      name: "read_attachment",
      description: READ_ATTACHMENT_DESCRIPTION,
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
      name: "update_issue",
      description:
        "Edit a ticket's TITLE, DESCRIPTION or EFFORT estimate. Send only the fields you are changing — the others are left untouched. Rename when the title no longer describes the work; rewrite the description when the user asks, or when what it claims has become wrong. You CANNOT change a ticket's STATUS or its PRIORITY here: those are the user's decision (and the harness already moves the ticket along with the pull request), and passing either is refused. Say in your reply what you think the status should be instead.",
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
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_issue_plan",
      description:
        "Write a ticket's implementation PLAN — the persistent markdown plan stored on the minddy ticket, visible to the whole team. Call it ONLY when the user asks for a plan (e.g. 'prépare un plan', 'plan this ticket', 'how would you do it? write it down') — never spontaneously. Full replacement: send the complete plan. Format: a short context (goal, approach), then ordered checkbox tasks — '- [ ]' pending, '- [~]' in progress, '- [x]' done, '- [-]' cancelled — each naming the exact files/components/functions/migrations to touch, and a final verification step. Explore the code FIRST so tasks reference real paths. Writing the plan does NOT start the work: after writing it, reply and stop unless the user also asked to implement. Distinct from update_plan, which is only your live session checklist.",
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
      name: "create_issue",
      description:
        "Create a REAL ticket in the project this session works on. Use it when the user asks for one, or when work you ran into genuinely deserves a formal, trackable ticket (a substantial feature, a real bug the team should see) — never automatically, and never as a substitute for just doing the work. The ticket lands in the status the user chose for tickets created through Numo: that is an account setting, not a parameter, so you cannot pick it — the result tells you where it landed, report that.",
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
        "Re-read the launcher's notebook (their personal cross-project notes doc): the full markdown, plus every checkbox task parsed with a stable 0-based task_index, its text and its state (pending '- [ ]', in_progress '- [~]', completed '- [x]', cancelled '- [-]'), and `rev`, the doc's version. Anything you were shown of it at session start is a SNAPSHOT — call this whenever fresh state matters, and ALWAYS right before update_scratchpad_task or set_scratchpad so your indices and rev are current.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_scratchpad_tasks",
      description:
        "Append tasks to the launcher's notebook. Only on their explicit request ('note that', 'add it to my notes') — the notebook is their personal space, not your scratch space. Tasks land at the end of the doc, or at the end of a named '##' section when you pass one (an unknown section is refused and the existing ones are listed). Appending merges with whatever the user is typing right now; it never overwrites their text.",
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

/** Jeu complet d'un run de TICKET. */
export const AGENT_TOOLS: AgentToolDef[] = [
  ...CORE_TOOLS,
  ...MINDDY_TOOLS,
  CREATE_PR_TOOL("issue"),
];

/** Jeu complet d'un run CARNET (MIN-84) — mêmes tools minddy, `create_pr` sans ticket. */
export const NOTEBOOK_AGENT_TOOLS: AgentToolDef[] = [
  ...CORE_TOOLS,
  ...MINDDY_TOOLS,
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

/** Les lecteurs minddy d'une relecture : le ticket que la PR met en œuvre. */
const PR_REVIEW_MINDDY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search_issues",
  "read_issue",
  "read_attachment",
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
const STRING_EDIT_TOOLS = new Set(["edit_file", "apply_edits", "write_file"]);

/** Tools qui prennent un `issue` : leur CIBLE PAR DÉFAUT dépend de l'ancrage. */
const TARGETABLE_ISSUE_TOOLS = new Set(["read_issue", "update_issue", "write_issue_plan"]);

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
  /** Modèle du run — décide de l'interface d'édition servie. */
  model?: string | null;
  /** Le modèle du run voit-il les images (MIN-111) ? Change ce que `read_attachment`
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
}): AgentToolDef[] {
  const patch = usesApplyPatch(opts.model);
  const tools =
    opts.anchor === "issue"
      ? AGENT_TOOLS
      : opts.anchor === "pr"
        ? PR_REVIEW_TOOLS
        : NOTEBOOK_AGENT_TOOLS;
  return tools
    .filter((t) => {
      const name = t.function.name;
      if (name === "web_search") return opts.webSearch;
      if (name === "apply_patch") return patch;
      if (name === "report_verdict") return opts.chain === true;
      if (STRING_EDIT_TOOLS.has(name)) return !patch;
      return true;
    })
    .map((t) => {
      const name = t.function.name;
      if (opts.images === true && name === "read_attachment") {
        return {
          ...t,
          function: { ...t.function, description: READ_ATTACHMENT_DESCRIPTION_WITH_IMAGES },
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
]);

/** Les quatre lecteurs : tout ce qu'un sous-agent `explore` a le droit de faire. */
const SUBAGENT_READ_TOOLS: ReadonlySet<string> = new Set([
  "read_file",
  "list_dir",
  "glob",
  "grep",
]);

/**
 * Jeu de tools d'un SOUS-AGENT (MIN-112).
 *
 * `explore` → les quatre lecteurs, rien d'autre : la lecture seule est une propriété
 * du JEU DE TOOLS, pas une phrase de prompt. `implement` → les lecteurs, l'interface
 * d'édition du modèle de la fille (`apply_patch` ou les tools par chaîne, jamais les
 * deux), `run_command` et `web_search` s'il est offert au run.
 *
 * `run_background` est volontairement absent des deux : le registre de jobs de fond
 * vit dans le chunk du parent, et un serveur laissé vivant par une fille tiendrait
 * la microVM éveillée sans que personne ne sache qu'il tourne.
 */
export function subagentToolsFor(
  mode: "explore" | "implement",
  opts: { webSearch: boolean; model?: string | null } = { webSearch: false },
): AgentToolDef[] {
  const patch = usesApplyPatch(opts.model);
  return AGENT_TOOLS.filter((t) => {
    const name = t.function.name;
    if (SUBAGENT_FORBIDDEN_TOOLS.has(name)) return false;
    if (SUBAGENT_READ_TOOLS.has(name)) return true;
    if (mode === "explore") return false;
    if (name === "web_search") return opts.webSearch;
    if (name === "apply_patch") return patch;
    if (STRING_EDIT_TOOLS.has(name)) return !patch;
    return true;
  });
}
