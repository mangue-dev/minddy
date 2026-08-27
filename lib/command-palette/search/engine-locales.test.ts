import { describe, expect, it } from "vitest";
import { extractInitialsWithoutStopWords } from "./engine";

describe("command palette stop words", () => {
  it.each([
    ["Mit der Tastatur navigieren", "tn"],
    ["Pesquisar nos projetos", "pp"],
    ["Cerca nei progetti", "cp"],
    ["Buscar en los proyectos", "bp"],
  ])("extracts useful initials from %s", (value, expected) => {
    expect(extractInitialsWithoutStopWords(value)).toBe(expected);
  });
});
