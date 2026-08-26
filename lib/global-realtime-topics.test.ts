import { describe, expect, it } from "vitest";
import { MAX_PROJECT_CHANNELS, projectTopicIds } from "./realtime-topics";

const projects = Array.from({ length: MAX_PROJECT_CHANNELS + 3 }, (_, index) => ({
  id: `p${index}`,
  updated_at: new Date(index * 1_000).toISOString(),
  deleted_at: null,
}));

describe("global board realtime topics", () => {
  it("subscribes to every project displayed by the global board", () => {
    expect(projectTopicIds(projects, null, true)).toHaveLength(projects.length);
  });

  it("keeps background surfaces bounded", () => {
    expect(projectTopicIds(projects, null)).toHaveLength(MAX_PROJECT_CHANNELS);
  });
});
