import { describe, expect, it } from "vitest";
import { hasSerializedToolCall, looksLikePendingAction } from "./ai-completion";

describe("completion announcements", () => {
  // French fixtures exercise localized conditional offers, not pending work.
  it.each([
    "All checks passed. I'll run the full suite if needed.",
    "All checks passed. I'll run the full suite if desired.",
    "All checks passed. I'll run the full suite if requested.",
    "All checks passed. I'll run the full suite if necessary.",
    "Les tests passent. Je vais lancer la suite complète si besoin.",
    "Les tests passent. Je vais lancer la suite complète si nécessaire.",
    "Les tests passent. Je vais lancer la suite complète si souhaité.",
    "Les tests passent. Je vais lancer la suite complète au besoin.",
    "Les tests passent. Je vais lancer la suite complète sur demande.",
    "Les tests passent. Je vais lancer la suite complète en cas de besoin.",
  ])("keeps conditional follow-up offers final: %s", (text) => {
    expect(looksLikePendingAction(text)).toBe(false);
  });

  // French fixtures reproduce the recorded Minddy incidents verbatim.
  it.each([
    "La ligne 37 : « Objectives » non traduit en allemand. Je génère les diffs de avec contexte de namespace.",
    "La section des relations du panel possède déjà un flux d'ajout. Laissez-moi vérifier les deux dernières briques.",
    "Le passage s'est arrêté en cours d'analyse. Je relance le travail sur la même conversation pour qu'il termine.",
    "I'll inspect the folder and check package.json.",
    "Hello ! Je vais regarder le dépôt puis lancer les tests.",
    "The key is untranslated. I am checking the other catalogs now.",
  ])("detects unfinished work after an observation: %s", (text) => {
    expect(looksLikePendingAction(text)).toBe(true);
  });

  it.each([
    "Je vais bien, merci.",
    "Le dossier contient trois fichiers et la version est 1.4.2.",
    "I will recommend the stable release because it passed all tests.",
    "I will inspect the folder if you want another review.",
    "Je relance le travail si vous le souhaitez.",
    "The previous response was:\n> Let me read the files first.",
    "The model returned this example:\n```text\nI'll inspect the folder.\n```",
    "I checked the files. All tests passed.",
  ])("keeps findings, examples and optional offers final: %s", (text) => {
    expect(looksLikePendingAction(text)).toBe(false);
  });
});

describe("serialized tool protocol", () => {
  it.each([
    "Resuming.<tool_call>launch_code_agent<arg_key>objective</arg_key></tool_call>",
    "Resuming.<tool_call>launch_code_agent",
    "Resuming.<TOOL_CALL",
  ])("rejects complete and incomplete tool text: %s", (text) => {
    expect(hasSerializedToolCall(text)).toBe(true);
  });

  it.each([
    "Use the native tool_calls field.",
    "The literal `<tool_call>` is an example.",
    "Example:\n```xml\n<tool_call>launch_code_agent</tool_call>\n```",
    "> <tool_call>launch_code_agent</tool_call>",
  ])("ignores documentation examples: %s", (text) => {
    expect(hasSerializedToolCall(text)).toBe(false);
  });
});
