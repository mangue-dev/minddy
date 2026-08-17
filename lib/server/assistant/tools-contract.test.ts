import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOLS } from "./tools";

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
});
