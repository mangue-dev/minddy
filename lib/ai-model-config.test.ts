import { describe, expect, it } from "vitest";

import { AI_MODEL_CONFIG_FIELDS, AI_MODEL_CONFIG_GROUPS } from "@/lib/ai-model-config";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * The contract between the REGISTER (`AI_MODEL_CONFIG_FIELDS`) and the catalogs:
 * any setting rendered in `/admin` has a label in both languages.
 *
 * Why a test. The dashboard assembles its keys at runtime
 * (`t(\`fields.${field.key}.label\`)`, cf. components/admin/admin-models-dashboard.tsx),
 * so the key is cast to `MessageKey<"Admin">` and the compiler no longer checks
 * for its existence. The i18n contract test checks the placeholders of the
 * keys CALLED in hard form — an assembled key also escapes it. Between the two,
 * a line added to the registry without its catalog entry does not break anything during the
 * compilation and raises `MISSING_MESSAGE` on the screen, in console, at the admin.
 * It happened with `demo_dictation_enabled` (MIN-150).
 *
 * The description remains optional: a field whose label is sufficient does not have
 *, and the dashboard manages it (`t.has`). What is not optional is that it exists on BOTH sides as long as it exists on one.
 */
const CATALOGS = { en, fr } as const;

type FieldEntry = { label?: string; desc?: string };
type GroupEntry = { title?: string; desc?: string };

describe("AI settings registry and i18n catalogs", () => {
  for (const [locale, messages] of Object.entries(CATALOGS)) {
    const fields = messages.Admin.fields as Record<string, FieldEntry>;
    const groups = messages.Admin.groups as Record<string, GroupEntry>;

    it(`donne un libellé à chaque réglage (${locale})`, () => {
      const missing = AI_MODEL_CONFIG_FIELDS.filter((f) => !f.adminLabel && !fields[f.key]?.label).map(
        (f) => f.key,
      );
      expect(missing).toEqual([]);
    });

    it(`donne un titre à chaque groupe (${locale})`, () => {
      const missing = AI_MODEL_CONFIG_GROUPS.filter((g) => !groups[g]?.title);
      expect(missing).toEqual([]);
    });

    it(`n'a pas de clé orpheline (${locale})`, () => {
      const known = new Set(AI_MODEL_CONFIG_FIELDS.map((f) => f.key));
      expect(Object.keys(fields).filter((k) => !known.has(k))).toEqual([]);
    });
  }

  it("describes a setting in both languages or neither", () => {
    const enFields = en.Admin.fields as Record<string, FieldEntry>;
    const frFields = fr.Admin.fields as Record<string, FieldEntry>;
    const diverging = AI_MODEL_CONFIG_FIELDS.filter(
      (f) => Boolean(enFields[f.key]?.desc) !== Boolean(frFields[f.key]?.desc),
    ).map((f) => f.key);
    expect(diverging).toEqual([]);
  });

  it("assigns non-text catalog capabilities to the matching runtime fields", () => {
    const byKey = new Map(AI_MODEL_CONFIG_FIELDS.map((field) => [field.key, field]));
    expect(byKey.get("transcription_model")?.catalogCapability).toBe("transcription");
    expect(byKey.get("feedback_embedding_model")?.catalogCapability).toBe("embedding");
    expect(byKey.get("assistant_model")?.catalogCapability).toBeUndefined();
    expect(byKey.get("byok_default_openai_transcription_model")?.catalogCapability).toBe(
      "transcription",
    );
    expect(byKey.get("byok_default_google_feedback_embedding_model")?.catalogCapability).toBe(
      "embedding",
    );
  });

  it("omits provider-specific fields for unsupported model families", () => {
    const keys = new Set(AI_MODEL_CONFIG_FIELDS.map((field) => field.key));
    expect(keys.has("byok_default_anthropic_assistant_model")).toBe(true);
    expect(keys.has("byok_default_anthropic_transcription_model")).toBe(false);
    expect(keys.has("byok_default_anthropic_feedback_embedding_model")).toBe(false);
    expect(keys.has("byok_default_google_feedback_embedding_model")).toBe(true);
  });

  it("defaults the OpenAI transcription fallback to a non-deprecated model", () => {
    // `gpt-4o-mini-transcribe` was deprecated on 2026-08-26 (shutdown
    // 2027-02-26); the OpenAI changelog names `gpt-transcribe` as its
    // replacement on the same /audio/transcriptions endpoint.
    const byKey = new Map(AI_MODEL_CONFIG_FIELDS.map((field) => [field.key, field]));
    expect(byKey.get("byok_default_openai_transcription_model")?.fallback).toBe("gpt-transcribe");
  });
});
