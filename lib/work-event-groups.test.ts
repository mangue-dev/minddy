import { describe, expect, it } from "vitest";
import { groupWorkEvents, type WorkEvent } from "./work-event-groups";

const action = (key: string, count = 1): WorkEvent<string> => ({ key, kind: "action", count, content: key });
const text = (key: string): WorkEvent<string> => ({ key, kind: "text", content: key });

describe("work event groups", () => {
  it("combines reasoning, commands, and other events only between narration messages", () => {
    const groups = groupWorkEvents([
      action("reasoning"), action("commands", 3), action("subagent"),
      text("Starting exploration"),
      action("search"), action("more reasoning"), action("read", 2),
      text("Found the cause"), action("edit"),
    ]);
    expect(groups.map((group) => group.events.map((event) => event.key))).toEqual([
      ["reasoning", "commands", "subagent"], ["Starting exploration"],
      ["search", "more reasoning", "read"], ["Found the cause"], ["edit"],
    ]);
    expect(groups.map((group) => group.count)).toEqual([5, 0, 4, 0, 1]);
  });

  it("keeps a group key stable as streaming actions arrive and finish", () => {
    const first = action("read");
    const running = { ...action("command"), active: true };
    expect(groupWorkEvents([first])[0]).toMatchObject({ key: "read", count: 1 });
    expect(groupWorkEvents([first, running])[0]).toMatchObject({ key: "read", count: 2, active: true });
    expect(groupWorkEvents([first, { ...running, active: false }])[0]).toMatchObject({ key: "read", count: 2, active: false });
  });

  it("leaves consecutive text messages and isolated actions ungrouped", () => {
    expect(groupWorkEvents([text("one"), text("two"), action("only action")]).map((group) => group.count)).toEqual([0, 0, 1]);
    expect(groupWorkEvents([])).toEqual([]);
  });
});
