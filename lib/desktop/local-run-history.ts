import {
  layoutForCurrentRepo,
  runScopedRoot,
  type HarnessLayout,
} from "@/lib/server/agent/harness-layout";

const LOCAL_RUNS_DIR_NAME = "agent-runs";
const LOCAL_OPENCODE_DIR_NAME = "opencode";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Locate a retained desktop run without changing or recreating its files. */
export function retainedLocalRunRoot(userDataPath: string, runId: string): string {
  return runScopedRoot(
    `${trimTrailingSlashes(userDataPath)}/${LOCAL_RUNS_DIR_NAME}`,
    runId,
  );
}

/** Reconstruct the historical layout used to store a desktop run's diff. */
export function retainedLocalRunLayout(
  userDataPath: string,
  runId: string,
): HarnessLayout {
  const root = retainedLocalRunRoot(userDataPath, runId);
  return layoutForCurrentRepo(
    root,
    root,
    `${trimTrailingSlashes(userDataPath)}/${LOCAL_OPENCODE_DIR_NAME}`,
  );
}
