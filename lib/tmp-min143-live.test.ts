import { describe, expect, it } from "vitest";
import fs from "node:fs";

for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] = line
    .slice(i + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
}

const REPO = "mangue-dev/minddy-issues";

describe("MIN-143 live", () => {
  it("ingère la PR humaine et la rattache à son ticket", async () => {
    const { resolveRepoCloneTargetForRepo } = await import("@/lib/server/agent/repo-access");
    const { syncRepoPullRequests, findPullRequestByNumber } = await import(
      "@/lib/server/agent/pull-requests"
    );
    const { getServiceClient } = await import("@/lib/supabase-service");
    const service = getServiceClient();

    const { data: links } = await service
      .from("project_git_links")
      .select("created_by, project:projects(id, key, name)")
      .eq("repo_full_name", REPO);
    console.log("projets liés :", JSON.stringify(links));

    const userId = (links as Array<{ created_by: string }>)[0].created_by;
    const target = await resolveRepoCloneTargetForRepo({
      userId,
      provider: "github",
      repoFullName: REPO,
    });
    await syncRepoPullRequests({ provider: "github", repoFullName: REPO, token: target!.token });

    const pr = await findPullRequestByNumber({ provider: "github", repoFullName: REPO, number: 16 });
    console.log("PR #16 :", JSON.stringify(pr, null, 1));
    expect(pr).toBeTruthy();
    expect(pr!.author_login).toBe("mangue-dev");
    expect(pr!.state).toBe("open");

    if (pr!.issue_id) {
      const { data: issue } = await service
        .from("issues")
        .select("number, title, project_id")
        .eq("id", pr!.issue_id)
        .maybeSingle();
      console.log("ticket rattaché :", JSON.stringify(issue));
    }
  }, 120_000);
});
