import { describe, expect, it } from "vitest";

import { toolRunningLabel } from "@/components/assistant/tool-call-display";
import { ADMIN_ASSISTANT_TOOLS } from "./admin-tools";
import { CONVERSATION_ASSISTANT_TOOLS } from "./tools";

/**
 * Each tool call shows in the conversation as a line, an icon and a phrase.
 * A tool without its line falls back to "Processing…" then "Done", which
 * raises nothing and is only seen on screen: twelve tools once shipped that
 * way. The Numo tools' lines are typed by the tool policy; the instance
 * administration tools are a separate registry, so this checks them all.
 */
const EVERY_TOOL = [...CONVERSATION_ASSISTANT_TOOLS, ...ADMIN_ASSISTANT_TOOLS].map((tool) => tool.function.name);

const keyOnly = ((key: string) => key) as Parameters<typeof toolRunningLabel>[1];

describe("each Numo tool has its line in the thread", () => {
  it.each(EVERY_TOOL)("%s has its own label", (name) => {
    expect(toolRunningLabel(name, keyOnly)).not.toBe(toolRunningLabel("no_such_tool", keyOnly));
  });
});
