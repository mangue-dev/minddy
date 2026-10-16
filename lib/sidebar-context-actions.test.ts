import { describe, expect, it } from "vitest";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { composeSidebarContextActions } from "./sidebar-context-actions";

const action = (id: string, extra: Partial<ContextMenuAction> = {}): ContextMenuAction => ({ id, label: id, ...extra });

describe("composeSidebarContextActions", () => {
  it("puts object actions first, navigation next and destructive actions last behind a separator", () => {
    const composed = composeSidebarContextActions(
      [action("trash", { variant: "destructive" }), action("new"), action("settings")],
      [action("open-tab", { separatorBefore: true }), action("copy-link")],
    );
    expect(composed.map((entry) => entry.id)).toEqual(["new", "settings", "open-tab", "copy-link", "trash"]);
    expect(composed.at(-1)?.separatorBefore).toBe(true);
  });

  it("keeps navigation-only menus unchanged", () => {
    const navigation = [action("open-tab", { separatorBefore: true }), action("copy-link")];
    expect(composeSidebarContextActions([], navigation)).toEqual(navigation);
  });
});
