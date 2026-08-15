import { describe, expect, it } from "vitest";

import { AI_MODEL_CONFIG_FIELDS, AI_MODEL_CONFIG_GROUPS } from "@/lib/ai-model-config";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Le contrat entre le REGISTRE (`AI_MODEL_CONFIG_FIELDS`) et les catalogues :
 * tout réglage rendu dans `/admin` a un libellé dans les deux langues.
 *
 * Pourquoi un test. Le tableau de bord assemble ses clés à l'exécution
 * (`t(\`fields.${field.key}.label\`)`, cf. components/admin/admin-models-dashboard.tsx),
 * donc la clé est castée en `MessageKey<"Admin">` et le compilateur ne vérifie
 * plus son existence. Le test de contrat i18n, lui, vérifie les placeholders des
 * clés APPELÉES en dur — une clé assemblée lui échappe aussi. Entre les deux,
 * une ligne ajoutée au registre sans son entrée de catalogue ne casse rien à la
 * compilation et lève `MISSING_MESSAGE` à l'écran, en console, chez l'admin.
 * C'est arrivé avec `demo_dictation_enabled` (MIN-150).
 *
 * La description reste facultative : un champ dont le libellé se suffit n'en a
 * pas, et le dashboard le gère (`t.has`). Ce qui n'est pas facultatif, c'est
 * qu'elle existe des DEUX côtés dès qu'elle existe d'un.
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
