import "server-only";

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
 *  - vérif       : run_command (install/lint/build/tests, git, etc.)
 *  - livraison   : create_pr (ouvre LA pull request du ticket quand il n'y en a pas)
 *  - ticket      : read_issue (état VIVANT du ticket : champs, plan, commentaires,
 *                  pièces jointes), read_attachment, write_issue_plan (écrit le
 *                  plan du ticket SUR DEMANDE de l'utilisateur, sans l'appliquer)
 *                  — exécutés par lib/server/agent/issue-tools.ts.
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

export const AGENT_TOOLS: AgentToolDef[] = [
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
            description: "Repo-relative path, e.g. 'src/app/page.tsx'.",
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
        "Search file contents with git grep (POSIX extended regex; gitignore-aware, binary files skipped). By default returns matching 'file:line:content' rows. Use to locate symbols, usages, imports, or config. Narrow with 'glob'/'path' and cap noisy searches with 'head_limit'.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "POSIX extended regex to search for, e.g. 'function\\s+foo' or 'useState'.",
          },
          path: {
            type: "string",
            description: "Optional subtree (repo-relative) to limit the search to.",
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
        "Run a shell command in the repository root (e.g. install dependencies, run the linter, build, or the test suite to verify your changes). Returns exitCode + stdout + stderr (truncated). Non-interactive only; it is killed after a timeout.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command, e.g. 'npm test' or 'npm run build'.",
          },
        },
        required: ["command"],
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

/** Noms des tools de contrôle gérés par la boucle (pas par le Sandbox). */
export const CONTROL_TOOLS = new Set(["update_plan"]);
