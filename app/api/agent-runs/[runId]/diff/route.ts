import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";
import { getAgentSandboxByName, sandboxHost } from "@/lib/server/agent/sandbox";
import { cloudLayout } from "@/lib/server/agent/harness-layout";
import { readWorkingDiff, resolveBaseRef } from "@/lib/server/agent/working-diff";

/**
 * Diff LIVE from an agent run — the diff view IN the conversation, without waiting
 * PR. GET → `{ files, provider, url, live }`.
 *
 * TWO SOURCES, and which one responds depends on what the run is doing:
 *
 * • **the trick turns** → the SANDBOX. `git diff origin/<base>` in the microVM of
 * run covers commits from past rounds AND the working tree: it's the only one
 * place that knows what the agent just wrote. Without it, click one
 * file that the thread just announced opened BEFORE state — or nothing at all
 * in the first round, the branch does not yet exist on the forge side (MIN-266).
 * • **at rest** (or unreachable sandbox, or REVIEW session, which does not write
 * not in the repository) → the FORGE: the files/patches of the PR when it
 * exists, otherwise compares `base...branche`. It’s hard work, and
 * rest there is nothing else to show.
 *
 * Fallback is never a mistake: a sleeping, expired, or developing sandbox
 * committer simply returns an empty list, and the forge takes over.
 * `live: true` says which one responded — the interface announces it, a diff that includes
 * non-push work does not read as a PR diff.
 *
 * `?stat=1` serves the HEADER of the conversation: the same files WITHOUT their
 * patches. It asks itself again every few seconds during the round, and two
 * Short `git diff` passes are not the same object as several megabytes of
 * texte.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const patches = request.nextUrl.searchParams.get("stat") !== "1";

  // The trick turns and the microVM writes: it is she who knows. A session of
  // rereading is excluded — it does not affect the deposit, and its difference IS that of
  // the pull request she reads.
  const working = run.status === "queued" || run.status === "running";
  if (working && run.sandbox_id && run.pull_request_id == null) {
    const live = await readLiveDiff(run.sandbox_id, run.base_branch, patches);
    if (live && live.files.length > 0) {
      return NextResponse.json({ ...live, url: run.pr_url ?? null, live: true });
    }
  }

  // Neither PR nor stamped branch (run barely launched): empty diff, not an error.
  const head = run.branch_name;
  if (run.pr_number == null && !head) {
    return NextResponse.json({ files: [], url: null });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);

    // A PR exists → its diff is authentic (same source as the Pull requests page).
    if (run.pr_number != null) {
      const { files, truncated } = await forge.listPullRequestFiles({
        token: target.token,
        repoFullName: target.repoFullName,
        number: run.pr_number,
      });
      return NextResponse.json({
        files,
        truncated,
        provider: target.provider,
        url: run.pr_url,
      });
    }

    // `head` is necessarily there (keeps higher) — TS does not deduce it from the handset.
    if (!head) return NextResponse.json({ files: [], url: null });
    const { files, url } = await forge.compareBranches({
      token: target.token,
      repoFullName: target.repoFullName,
      base: run.base_branch ?? target.defaultBranch,
      head,
    });
    return NextResponse.json({ files, provider: target.provider, url });
  } catch (err) {
    // Branch not yet pushed (or since deleted): empty diff, not an error.
    if (isForgeApiError(err) && err.status === 404) {
      return NextResponse.json({ files: [], url: null });
    }
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

/**
 * The diff read in the microVM, or `null` if it has nothing to say. No errors
 * does not go back: this path is a BONUS on that of the forge, and a microVM
 * unreachable should do a silent fallback, not a broken diff view.
 *
 * The base of the diff resolves IN the clone (`resolveBaseRef`) rather than via the
 * forge: `?stat=1` returns every few seconds during the turn, and
 * minter an installation token on each pass to learn only one name of
 * default branch would pay dearly for a fact that git has on hand.
 */
async function readLiveDiff(
  sandboxId: string,
  baseBranch: string | null,
  patches: boolean,
): Promise<{ files: unknown[]; truncated: boolean } | null> {
  try {
    const sandbox = await getAgentSandboxByName(sandboxId);
    if (!sandbox) return null;
    const host = sandboxHost(sandbox, cloudLayout());
    const baseRef = await resolveBaseRef(host, baseBranch);
    if (!baseRef) return null;
    return await readWorkingDiff(host, baseRef, { patches });
  } catch {
    return null;
  }
}
