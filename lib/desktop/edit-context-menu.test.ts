import { describe, expect, it } from "vitest";
import { editContextMenuItems, type EditContextMenuParams } from "./edit-context-menu";

const ALL_FLAGS: EditContextMenuParams["editFlags"] = {
  canUndo: true,
  canRedo: true,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canSelectAll: true,
};

const NO_FLAGS: EditContextMenuParams["editFlags"] = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canSelectAll: false,
};

const roles = (params: EditContextMenuParams) =>
  editContextMenuItems(params).map((item) => ("role" in item ? item.role : "-"));

describe("editContextMenuItems", () => {
  it("offers the full edit menu in an editable field", () => {
    expect(roles({ isEditable: true, selectionText: "", editFlags: ALL_FLAGS }))
      .toEqual(["undo", "redo", "-", "cut", "copy", "paste", "-", "selectAll"]);
  });

  it("keeps paste reachable in an empty field and disables what has nothing to act on", () => {
    const items = editContextMenuItems({
      isEditable: true,
      selectionText: "",
      editFlags: { ...NO_FLAGS, canPaste: true, canSelectAll: true },
    });
    expect(items).toContainEqual({ role: "paste", enabled: true });
    expect(items).toContainEqual({ role: "cut", enabled: false });
    expect(items).toContainEqual({ role: "copy", enabled: false });
  });

  it("follows Chromium in a password field, where cut and copy are refused", () => {
    const items = editContextMenuItems({
      isEditable: true,
      selectionText: "",
      editFlags: { ...ALL_FLAGS, canCut: false, canCopy: false },
    });
    expect(items).toContainEqual({ role: "cut", enabled: false });
    expect(items).toContainEqual({ role: "copy", enabled: false });
  });

  it("offers only copy over selected text outside a field", () => {
    expect(editContextMenuItems({ isEditable: false, selectionText: "MIN-797", editFlags: ALL_FLAGS }))
      .toEqual([{ role: "copy", enabled: true }]);
  });

  it("shows nothing elsewhere, including over a whitespace-only selection", () => {
    expect(editContextMenuItems({ isEditable: false, selectionText: "", editFlags: ALL_FLAGS })).toEqual([]);
    expect(editContextMenuItems({ isEditable: false, selectionText: " \n", editFlags: ALL_FLAGS })).toEqual([]);
  });
});
