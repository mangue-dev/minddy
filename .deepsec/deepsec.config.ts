import { defineConfig } from "deepsec/config";
import { generatedMatchersPlugin } from "./generated-matchers.js";

// CI and local audits may set this to an immutable clean worktree. The default
// remains the repository root next to this isolated DeepSec workspace.
const projectRoot = process.env.DEEPSEC_CANDIDATE_ROOT ?? "..";

export default defineConfig({
  defaultThinkingLevel: "medium", // <deepsec:default-thinking-level>
  defaultModel: "gpt-5.6-terra", // <deepsec:default-model>
  defaultAgent: "codex", // <deepsec:default-agent>
  ai: { mode: "local", provider: "local" }, // <deepsec:model-route>
  projects: [
    {
      id: "minddy",
      root: projectRoot,
      priorityPaths: [
        "app/api/",
        "app/auth/",
        "app/f/",
        "app/p/",
        "lib/server/",
        "supabase/migrations/",
        "desktop/src/",
        "scripts/",
      ],
    },
    // <deepsec:projects-insert-above>
  ],
  plugins: [generatedMatchersPlugin],
});
