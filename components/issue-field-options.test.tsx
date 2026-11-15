import { describe, expect, it, vi } from "vitest";
import {
  EFFORT_OPTION_ICON,
  categoryFieldOptions,
  effortFieldOptions,
  fieldMenuChildren,
  memberFieldOptions,
  objectiveFieldOptions,
  priorityFieldOptions,
  statusFieldOptions,
} from "@/components/issue-field-options";
import { ALL_STATUSES, EFFORTS, PRIORITIES } from "@/lib/issue-constants";
import type { Member } from "@/lib/types";

describe("issue field options", () => {
  it("lists every status, priority and effort in the scale's order", () => {
    expect(statusFieldOptions((s) => s).map((o) => o.value)).toEqual(ALL_STATUSES.map((s) => s.value));
    expect(priorityFieldOptions((p) => p).map((o) => o.value)).toEqual(PRIORITIES.map((p) => p.value));
    expect(effortFieldOptions().map((o) => o.value)).toEqual(EFFORTS.map((e) => e.value));
  });

  it("gives every effort rung the same glyph", () => {
    expect(effortFieldOptions().every((o) => o.icon === EFFORT_OPTION_ICON)).toBe(true);
  });

  it("finds a member by email as well as by name", () => {
    const [withEmail, withoutEmail] = memberFieldOptions([
      { user_id: "u1", display_name: "Camille", email: "camille@example.com", avatar_seed: "a" },
      { user_id: "u2", display_name: "Sam", email: null, avatar_seed: "b" },
    ] as unknown as Member[]);
    expect(withEmail.keywords).toEqual(["camille@example.com"]);
    expect(withoutEmail.keywords).toBeUndefined();
  });

  it("names an objective by its pill in pickers and by its name in menus", () => {
    const objective = { id: "o1", name: "Launch", color: null, status: "planned" as const };
    const [pill] = objectiveFieldOptions([objective]);
    const [menu] = objectiveFieldOptions([objective], { presentation: "menu" });
    expect(pill.icon).toBeUndefined();
    expect(menu.icon).toBeDefined();
    expect(pill.labelNode).not.toEqual(menu.labelNode);
    expect([pill.label, menu.label]).toEqual(["Launch", "Launch"]);
  });

  it("turns options into checked submenu entries that write their own value", () => {
    const onSelect = vi.fn();
    const entries = fieldMenuChildren(
      "property-category",
      categoryFieldOptions([
        { id: "c1", name: "Bug", color: "#f00" },
        { id: "c2", name: "UX", color: "#00f" },
      ]),
      { isChecked: (id) => id === "c2", onSelect, keepOpen: true },
    );
    expect(entries.map((e) => [e.id, e.checked, e.keepOpen])).toEqual([
      ["property-category-c1", false, true],
      ["property-category-c2", true, true],
    ]);
    entries[0].onSelect?.();
    expect(onSelect).toHaveBeenCalledWith("c1");
    const single = fieldMenuChildren("p", effortFieldOptions(), { isChecked: () => false, onSelect });
    expect(single.some((e) => "keepOpen" in e)).toBe(false);
  });
});
