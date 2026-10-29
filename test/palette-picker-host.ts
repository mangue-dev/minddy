/**
 * A stand-in for the ⌘K palette in surface tests (MIN-844): renders the
 * content picker a surface published (lib/palette-picker.ts) as plain DOM —
 * a search field carrying the placeholder, one button per row labelled
 * "<context><title>", the status line — and closes it the way the palette
 * does: a chosen row closes it unless its `execute` returns false, and the
 * "Close picker" button dismisses it. Typing filters rows by title and
 * context, which is enough to tell rows apart; ranking has its own tests.
 */

import * as React from "react";
import {
  dismissPalettePicker,
  usePalettePickerStore,
} from "@/lib/palette-picker";

export const PICKER_SEARCH_LABEL = "Palette picker search";

export function PalettePickerTestHost(): React.ReactElement | null {
  const request = usePalettePickerStore((state) => state.request);
  const [query, setQuery] = React.useState("");
  const key = request?.key;
  React.useEffect(() => setQuery(""), [key]);
  if (!request) return null;
  const needle = query.trim().toLowerCase();
  const rows = request.items.filter((item) =>
    !needle || `${item.title} ${item.contextLabel ?? ""}`.toLowerCase().includes(needle));
  const create = request.create;
  const choose = async (execute: () => unknown) => {
    const result = await execute();
    if (result !== false) dismissPalettePicker();
  };
  return React.createElement(
    "div",
    { "data-palette-picker": request.key },
    React.createElement("input", {
      "aria-label": PICKER_SEARCH_LABEL,
      placeholder: request.placeholder,
      value: query,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    }),
    ...rows.map((item) => React.createElement(
      "button",
      { key: item.id, type: "button", "data-picker-row": item.id, onClick: () => void choose(() => item.execute?.()) },
      `${item.contextLabel ?? ""}${item.title}`,
    )),
    create && React.createElement(
      "button",
      { key: create.id, type: "button", "data-picker-row": create.id, onClick: () => void choose(() => create.onCreate(query.trim())) },
      create.label(query.trim()),
    ),
    rows.length === 0 && request.status ? React.createElement("div", { "data-picker-status": true }, request.status) : null,
    React.createElement("button", { type: "button", onClick: () => dismissPalettePicker() }, "Close picker"),
  );
}
