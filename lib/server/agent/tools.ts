import "server-only";

/**
 * Tools de l'agent de code (MIN-46), format function-calling OpenRouter (même
 * forme que lib/server/assistant/tools.ts). Ils opèrent sur le dépôt cloné dans
 * le Sandbox ; leur exécution est câblée dans execute.ts (Phase 3) via la couche
 * lib/server/agent/sandbox.ts.
 *
 * Jeu minimal et robuste :
 *  - exploration : read_file, list_dir, grep
 *  - édition     : write_file (contenu COMPLET — pas de patch flou ; l'agent peut
 *                  aussi appliquer un diff via run_command `git apply`)
 *  - vérif       : run_command (install/lint/build/tests, git, etc.)
 *  - contrôle    : finish (terminé → ouvre la PR), ask_user (pause)
 * Les commits sont pilotés par le harnais (commit+push au suspend et à la fin) —
 * pas de tool commit exposé, pour garder des commits propres.
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
        "Read a file from the repository. Returns its full text content (truncated if very large). Use before editing to see the exact current content.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Repo-relative path, e.g. 'src/app/page.tsx'.",
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
      name: "grep",
      description:
        "Search the repository for a text pattern (like grep -rn, .git excluded). Returns matching 'file:line:content' rows. Use to locate symbols, usages, or config.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Text or basic regex to search for.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file with the given FULL content (parent directories are created as needed). Always send the complete file, not a fragment. Keep changes focused and consistent with the existing code style.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative file path." },
          content: { type: "string", description: "The complete new file content." },
        },
        required: ["path", "content"],
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
      name: "finish",
      description:
        "Call this when the task is complete and the changes are ready to become a pull request. Provide a concise PR title and a markdown body describing what changed and why. The system commits, pushes the branch, and opens the PR.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Short summary of what you did (1-3 sentences).",
          },
          pr_title: {
            type: "string",
            description: "Pull request title. Imperative, concise.",
          },
          pr_body: {
            type: "string",
            description: "Pull request description in markdown: what changed, why, how it was verified.",
          },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a question and pause when you are blocked by a genuine decision only they can make (ambiguous requirement, missing choice). Do NOT use it for things you can determine from the code. The run pauses until they reply.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask the user." },
        },
        required: ["question"],
      },
    },
  },
];

/** Noms des tools de contrôle gérés par la boucle (pas par le Sandbox). */
export const CONTROL_TOOLS = new Set(["finish", "ask_user"]);
