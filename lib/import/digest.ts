// Le résumé d'un fichier tel que le modèle le voit — et la SEULE chose qui
// quitte le navigateur pour la passe de correspondance.
//
// Deux raisons de ne pas envoyer le CSV entier : il pèse jusqu'à 5 Mo, et un
// modèle n'a de toute façon rien à faire des 900 lignes qui répètent la même
// forme. Ce qui l'intéresse tient en trois choses par colonne : son en-tête,
// combien de valeurs distinctes elle porte, et à quoi ces valeurs ressemblent.
// C'est cette dernière qui fait tout le travail : « Niveau » ne veut rien dire,
// « Niveau » qui contient Haute/Moyenne/Basse est une colonne de priorité.
//
// S'y ajoute ce que le PROJET D'ARRIVÉE contient : ses membres et ses
// catégories. Sans eux, le modèle peut dire « cette colonne est un assigné »
// mais pas « cet assigné-là, c'est Marie », ni « cette étiquette-là, c'est la
// catégorie Bug que vous avez déjà ». C'est la différence entre reconnaître la
// forme d'un backlog et le faire vraiment entrer dans le projet.
//
// Isomorphe : le navigateur le construit, la route le revalide.

import type { ImportContext, ImportField, ImportMapping } from "@/lib/import/types";
import { normalizeToken } from "@/lib/import/normalize";
import { topValues, type TableStats } from "@/lib/import/stats";
import { splitLabelValues } from "@/lib/import/mapping";

/** Au-delà, ce n'est plus un backlog exporté mais une feuille de calcul. */
export const MAX_DIGEST_COLUMNS = 60;
/** Assez pour reconnaître une énumération, assez peu pour rester bon marché. */
export const MAX_DIGEST_SAMPLES = 12;
/** Une valeur d'exemple sert à reconnaître une forme, pas à être lue en entier. */
export const MAX_DIGEST_SAMPLE_CHARS = 80;
/** Un projet à 200 membres ou 200 catégories : on borne, le prompt reste lisible. */
export const MAX_DIGEST_PROJECT_ITEMS = 100;

export interface CsvDigestColumn {
  index: number;
  header: string;
  distinctCount: number;
  /** Valeurs les plus fréquentes d'abord — l'ordre qui montre une énumération. */
  samples: string[];
  /** Ce que la détection a déjà su placer (`ignore` sinon). */
  field: ImportField;
}

export interface CsvDigestMember {
  /** Rang 1-based : un petit modèle recopie un entier, pas un UUID. */
  ref: number;
  name: string;
}

export interface CsvDigest {
  rowCount: number;
  columns: CsvDigestColumn[];
  /** Membres du projet, ceux à qui un ticket peut revenir. */
  members: CsvDigestMember[];
  /** Catégories déjà présentes dans le projet. */
  categories: string[];
  /** Étiquettes du fichier restées sans catégorie existante. */
  unmatchedLabels: string[];
}

export function buildCsvDigest(
  stats: TableStats,
  mapping: ImportMapping,
  context: ImportContext,
  rowCount: number
): CsvDigest {
  const columns: CsvDigestColumn[] = [];

  for (const col of stats.slice(0, MAX_DIGEST_COLUMNS)) {
    columns.push({
      index: col.index,
      header: col.header.slice(0, MAX_DIGEST_SAMPLE_CHARS),
      distinctCount: col.distinctCount,
      samples: topValues(col, MAX_DIGEST_SAMPLES).map((v) =>
        v.label.slice(0, MAX_DIGEST_SAMPLE_CHARS)
      ),
      field: mapping.columns[col.index] ?? "ignore",
    });
  }

  // Seules les étiquettes qu'on n'a pas su rapprocher sont soumises : les
  // autres sont déjà justes, les proposer au modèle ne ferait que l'occasion
  // d'une erreur.
  const unmatchedLabels = splitLabelValues(stats, mapping)
    .filter((label) => mapping.labelValues[normalizeToken(label)] === undefined)
    .slice(0, MAX_DIGEST_PROJECT_ITEMS);

  return {
    rowCount,
    columns,
    members: context.members.slice(0, MAX_DIGEST_PROJECT_ITEMS).map((m, i) => ({
      ref: i + 1,
      name: [m.name, m.email].filter(Boolean).join(" ") || `member ${i + 1}`,
    })),
    categories: context.categories.slice(0, MAX_DIGEST_PROJECT_ITEMS),
    unmatchedLabels,
  };
}

/**
 * Revalidation côté route : le digest vient du navigateur, donc on le retaille
 * aux mêmes bornes avant de le mettre dans un prompt. `null` si ce n'est pas un
 * digest du tout.
 */
export function sanitizeDigest(raw: unknown): CsvDigest | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.columns) || input.columns.length === 0) return null;

  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((s): s is string => typeof s === "string")
          .slice(0, MAX_DIGEST_PROJECT_ITEMS)
          .map((s) => s.slice(0, MAX_DIGEST_SAMPLE_CHARS))
      : [];

  const columns: CsvDigestColumn[] = [];
  for (const item of input.columns.slice(0, MAX_DIGEST_COLUMNS)) {
    if (!item || typeof item !== "object") continue;
    const col = item as Record<string, unknown>;
    if (typeof col.index !== "number" || !Number.isInteger(col.index)) continue;
    columns.push({
      index: col.index,
      header:
        typeof col.header === "string"
          ? col.header.slice(0, MAX_DIGEST_SAMPLE_CHARS)
          : "",
      distinctCount: typeof col.distinctCount === "number" ? col.distinctCount : 0,
      samples: strings(col.samples).slice(0, MAX_DIGEST_SAMPLES),
      // Le champ déjà déduit est une indication pour le modèle, pas une entrée
      // de confiance : il ne sert qu'à écrire le prompt.
      field: typeof col.field === "string" ? (col.field as ImportField) : "ignore",
    });
  }
  if (columns.length === 0) return null;

  const members: CsvDigestMember[] = Array.isArray(input.members)
    ? input.members
        .slice(0, MAX_DIGEST_PROJECT_ITEMS)
        .flatMap((m, i) =>
          m && typeof m === "object" && typeof (m as { name?: unknown }).name === "string"
            ? [
                {
                  ref: i + 1,
                  name: ((m as { name: string }).name).slice(
                    0,
                    MAX_DIGEST_SAMPLE_CHARS
                  ),
                },
              ]
            : []
        )
    : [];

  return {
    rowCount: typeof input.rowCount === "number" ? input.rowCount : 0,
    columns,
    members,
    categories: strings(input.categories),
    unmatchedLabels: strings(input.unmatchedLabels),
  };
}

/** Le digest en texte, tel qu'il part dans le message utilisateur. */
export function renderDigest(digest: CsvDigest): string {
  const lines = [`## The file (${digest.rowCount} data rows)`, ""];
  for (const col of digest.columns) {
    const samples = col.samples.map((s) => JSON.stringify(s)).join(", ");
    const already = col.field !== "ignore" ? ` [already mapped to: ${col.field}]` : "";
    lines.push(
      `column ${col.index} — header ${JSON.stringify(col.header)} — ` +
        `${col.distinctCount} distinct values${already}` +
        (samples ? `\n    values: ${samples}` : "\n    values: (always empty)")
    );
  }

  lines.push("", "## The project the issues go into", "");
  lines.push(
    digest.members.length > 0
      ? `members:\n${digest.members.map((m) => `    ${m.ref}. ${m.name}`).join("\n")}`
      : "members: (none — nobody to assign to)"
  );
  lines.push(
    digest.categories.length > 0
      ? `existing categories: ${digest.categories.map((c) => JSON.stringify(c)).join(", ")}`
      : "existing categories: (none)"
  );
  if (digest.unmatchedLabels.length > 0) {
    lines.push(
      `labels in the file with no exact category match: ` +
        digest.unmatchedLabels.map((l) => JSON.stringify(l)).join(", ")
    );
  }

  return lines.join("\n");
}
