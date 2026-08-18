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

describe("registre des réglages IA × catalogues i18n", () => {
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

  it("décrit un réglage dans les deux langues ou dans aucune", () => {
    const enFields = en.Admin.fields as Record<string, FieldEntry>;
    const frFields = fr.Admin.fields as Record<string, FieldEntry>;
    const diverging = AI_MODEL_CONFIG_FIELDS.filter(
      (f) => Boolean(enFields[f.key]?.desc) !== Boolean(frFields[f.key]?.desc),
    ).map((f) => f.key);
    expect(diverging).toEqual([]);
  });
});
