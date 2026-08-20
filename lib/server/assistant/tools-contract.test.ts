import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOLS, GLOBAL_ASSISTANT_TOOLS } from "./tools";

const tool = (name: string) =>
  ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);

describe("Numo tool contracts", () => {
  it("does not advertise creation-only smart_fill on issue updates", () => {
    const update = tool("update_issues");
    const create = tool("create_issue");

    expect(update?.function.parameters.properties.fields).not.toHaveProperty(
      "smart_fill"
    );
    expect(create?.function.parameters.properties).toHaveProperty("smart_fill");
  });

  it("advertises the internal feedback comment tool", () => {
    const comment = tool("add_feedback_comment");

    expect(comment).toBeDefined();
    expect(comment?.function.parameters.properties).toHaveProperty("body");
    expect(comment?.function.parameters.required).toEqual(["body"]);
    expect(comment?.function.parameters.properties).toHaveProperty("feedback_post_id");
  });

  it("makes product knowledge available without requiring a project", () => {
    expect(tool("get_help")?.function.parameters.required).toEqual(["topic"]);
    const global = GLOBAL_ASSISTANT_TOOLS.find((candidate) => candidate.function.name === "get_help");

    expect(global?.function.parameters.properties).not.toHaveProperty("project_id");
  });
});
