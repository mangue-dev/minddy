import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyFeedbackWritesToPost, feedbackWrites, writeFeedbackPost } from "./feedback-writes";
import type { TeamFeedbackDetail, TeamFeedbackListItem } from "../server/feedback/team-queries";

const post = { id: "p1", status: "open", objective_id: null, category_ids: [] } as unknown as TeamFeedbackListItem;

afterEach(() => feedbackWrites.reset());

describe("writeFeedbackPost", () => {
  it("shows the write at once and keeps it over a response that left before it", async () => {
    const client = new QueryClient();
    client.setQueryData(["feedback", "proj"], { posts: [post] });
    let confirm!: () => void;
    const sent = new Promise<void>((resolve) => { confirm = resolve; });
    const leftBefore = Date.now() - 1;
    const write = writeFeedbackPost(client, "proj", "p1", { status: "planned" }, () => sent);

    const cached = client.getQueryData<{ posts: TeamFeedbackListItem[] }>(["feedback", "proj"]);
    expect(cached?.posts[0].status).toBe("planned");
    // A list response that left before the write still reads the old status.
    expect(feedbackWrites.apply([post], leftBefore)[0].status).toBe("planned");
    expect(applyFeedbackWritesToPost(post as unknown as TeamFeedbackDetail, leftBefore).status).toBe("planned");

    confirm();
    await write;
    // Confirmed: a response that leaves afterwards is the authority again.
    expect(feedbackWrites.apply([post], Date.now() + 1)[0].status).toBe("open");
  });

  it("forgets a refused write", async () => {
    const client = new QueryClient();
    await expect(writeFeedbackPost(client, "proj", "p1", { status: "planned" }, () => Promise.reject(new Error("no"))))
      .rejects.toThrow("no");
    expect(feedbackWrites.apply([post], 0)[0].status).toBe("open");
  });
});
