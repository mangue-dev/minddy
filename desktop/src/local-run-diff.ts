import { readFile, stat } from "node:fs/promises";
import { app } from "electron";

import {
  DESKTOP_LOCAL_DIFF_PATCH_CAP,
  desktopLocalRunDiffId,
  parseDesktopLocalRunDiff,
  type DesktopLocalRunDiff,
} from "@/lib/desktop/local-run-diff";
import { localLayout, localRunRoot } from "@/lib/desktop/local-turn";
import { vmLocalDiffPath } from "@/lib/server/agent/harness-layout";

// Tracked and untracked Git streams are capped independently before they are
// merged. The renderer applies one 2 MB aggregate cap after parsing.
const SNAPSHOT_ENVELOPE_BYTES = DESKTOP_LOCAL_DIFF_PATCH_CAP * 2 + 64_000;

/**
 * Read a run-owned artifact without accepting a repository or file path from
 * the remote renderer. Missing snapshots are expected for older desktop runs.
 */
export async function readLocalRunDiff(input: unknown): Promise<DesktopLocalRunDiff | null> {
  const runId = desktopLocalRunDiffId(input);
  if (!runId) return null;

  const userDataPath = app.getPath("userData");
  const root = localRunRoot(userDataPath, runId);
  const snapshotPath = vmLocalDiffPath(localLayout({
    userDataPath,
    runId,
    // Only the harness directory is used to derive the artifact path.
    repoPath: root,
  }));
  try {
    const facts = await stat(snapshotPath);
    if (!facts.isFile() || facts.size > SNAPSHOT_ENVELOPE_BYTES) return null;
    const raw: unknown = JSON.parse(await readFile(snapshotPath, "utf8"));
    return parseDesktopLocalRunDiff(raw);
  } catch {
    return null;
  }
}
