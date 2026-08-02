"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "mangue-ui";
import { ChevronDown, Sparkles } from "lucide-react";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  type IssueEffortValue,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "@/lib/issue-validation";
import { EFFORT_MAP } from "@/lib/issue-constants";
import { normalizeToken } from "@/lib/import/normalize";
import { collectValueOptions } from "@/lib/import/mapping";
import { topValues, type TableStats } from "@/lib/import/stats";
import {
  IMPORT_FIELDS,
  type ImportField,
  type ImportMapping,
  type ImportMember,
} from "@/lib/import/types";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Le tableau de correspondance de l'aperçu d'import : où va chaque colonne du
 * fichier, et ce que devient chaque valeur — statut, priorité, effort, mais
 * aussi CHAQUE PERSONNE et CHAQUE ÉTIQUETTE.
 *
 * C'est le seul endroit où l'import devient réparable. Avant, ce qu'aucune
 * table d'alias ne reconnaissait tombait sans recours : une colonne « Niveau »
 * ignorée, un statut « Bloqué » ramené à backlog, un assigné perdu, une
 * catégorie « Bugs » créée à côté du « Bug » qui existait déjà. La détection
 * remplit ce tableau, le modèle le complète, l'utilisateur tranche : les trois
 * écrivent le MÊME objet (`ImportMapping`), qui est aussi ce qui part au
 * serveur pour être rejoué.
 *
 * Tout lit `stats`, jamais les lignes : sur un fichier de 2 000 lignes et 30
 * colonnes, rebalayer à chaque changement de sélecteur se verrait à l'écran.
 */

/** Radix refuse un `SelectItem` de valeur vide : les deux réponses qui ne sont
 *  pas une cible passent par un jeton. `UNSET` = pas d'entrée au dictionnaire,
 *  `DROP` = une entrée vide, c'est-à-dire « ne pas reprendre ». */
const UNSET = "__unset__";
const DROP = "__drop__";

export function ImportMappingEditor({
  stats,
  mapping,
  members,
  categories,
  onChange,
  aiApplied,
  aiPending,
  className,
}: {
  stats: TableStats;
  mapping: ImportMapping;
  members: ImportMember[];
  categories: string[];
  onChange: (next: ImportMapping) => void;
  /** Le modèle a proposé quelque chose et c'est fusionné dans le plan affiché. */
  aiApplied: boolean;
  /** L'appel est en vol — le tableau reste utilisable pendant. */
  aiPending: boolean;
  className?: string;
}) {
  const t = useTranslations("Settings");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");

  const values = useMemo(() => collectValueOptions(stats, mapping), [stats, mapping]);

  const usedColumns = mapping.columns.filter((f) => f !== "ignore").length;
  // Une valeur sans réponse est ce que ce tableau existe pour montrer : elle
  // remonte dans le résumé replié, sinon personne ne l'ouvrirait.
  const unresolved =
    values.status.filter((v) => !mapping.statusValues[normalizeToken(v)]).length +
    values.priority.filter((v) => !mapping.priorityValues[normalizeToken(v)]).length +
    values.assignee.filter((v) => !mapping.assigneeValues[normalizeToken(v)]).length;

  const setColumn = (index: number, field: ImportField) => {
    const columns = [...mapping.columns];
    columns[index] = field;
    onChange({ ...mapping, columns });
  };

  const setValue = (
    dict: keyof ImportMapping & `${string}Values`,
    raw: string,
    target: string
  ) => {
    const next = { ...(mapping[dict] as Record<string, string>) };
    const token = normalizeToken(raw);
    if (target === UNSET) delete next[token];
    else next[token] = target === DROP ? "" : target;
    onChange({ ...mapping, [dict]: next });
  };

  const fieldLabel = (field: ImportField) =>
    t(`importField_${field}` as MessageKey<"Settings">);

  const memberName = (m: ImportMember) => m.name || m.email || m.userId.slice(0, 8);

  return (
    <Collapsible
      defaultOpen={unresolved > 0 || !mapping.columns.includes("title")}
      className={cn("rounded-lg border border-border", className)}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left outline-hidden">
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
        <span className="text-sm font-medium">{t("importMappingTitle")}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {aiPending && (
            <span className="flex items-center gap-1">
              <Sparkles className="size-3 animate-pulse" aria-hidden />
              {t("importMappingPending")}
            </span>
          )}
          {!aiPending && aiApplied && (
            <span className="flex items-center gap-1">
              <Sparkles className="size-3" aria-hidden />
              {t("importMappingByNumo")}
            </span>
          )}
          <span>
            {t("importMappingSummary", {
              used: usedColumns,
              total: mapping.columns.length,
            })}
          </span>
          {unresolved > 0 && (
            <span className="text-amber-600 dark:text-amber-500">
              {t("importMappingUnresolved", { count: unresolved })}
            </span>
          )}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-4 border-t border-border p-3">
          {/* ── Colonnes ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            {stats.map((col) => (
              <Row
                key={col.index}
                label={col.header || t("importColumnUnnamed", { index: col.index + 1 })}
                hint={topValues(col, 3)
                  .map((v) => v.label)
                  .join(" · ")}
              >
                <Select
                  value={mapping.columns[col.index] ?? "ignore"}
                  onValueChange={(v) => setColumn(col.index, v as ImportField)}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_FIELDS.map((field) => (
                      <SelectItem key={field} value={field}>
                        {fieldLabel(field)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            ))}
          </div>

          {/* ── Valeurs ──────────────────────────────────────────────── */}
          <ValueSection
            title={t("importValuesStatus")}
            values={values.status}
            dict={mapping.statusValues}
            options={ISSUE_STATUSES}
            label={(v: IssueStatusValue) => tStatus(v)}
            unsetLabel={t("importValueBacklog")}
            onSet={(raw, target) => setValue("statusValues", raw, target)}
          />
          <ValueSection
            title={t("importValuesPriority")}
            values={values.priority}
            dict={mapping.priorityValues}
            options={ISSUE_PRIORITIES}
            label={(v: IssuePriorityValue) => tPriority(v)}
            unsetLabel={t("importValueNone")}
            onSet={(raw, target) => setValue("priorityValues", raw, target)}
          />
          <ValueSection
            title={t("importValuesEffort")}
            values={values.effort}
            dict={mapping.effortValues}
            options={ISSUE_EFFORTS}
            // Les tailles ne se traduisent pas : « XS » se lit pareil partout.
            label={(v: IssueEffortValue) => EFFORT_MAP[v].label}
            unsetLabel={t("importValueNone")}
            onSet={(raw, target) => setValue("effortValues", raw, target)}
          />
          {/* Personnes : le fichier nomme, le projet a des membres. Sans
              correspondance, le nom descend en bas de la description. */}
          <ValueSection
            title={t("importValuesAssignee")}
            values={values.assignee}
            dict={mapping.assigneeValues}
            options={members.map((m) => m.userId)}
            label={(id: string) =>
              memberName(members.find((m) => m.userId === id) ?? { userId: id, email: null, name: null })
            }
            unsetLabel={t("importValueNoMember")}
            onSet={(raw, target) => setValue("assigneeValues", raw, target)}
          />
          {/* Étiquettes : ramenées sur une catégorie existante, ou créées. */}
          <ValueSection
            title={t("importValuesLabels")}
            values={values.labels}
            dict={mapping.labelValues}
            options={categories}
            label={(name: string) => name}
            unsetLabel={t("importValueNewCategory")}
            droppable={t("importValueDropLabel")}
            onSet={(raw, target) => setValue("labelValues", raw, target)}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Une ligne « ce que dit le fichier → ce que minddy en fait ». */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{label}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Les valeurs distinctes d'une colonne à dictionnaire, et leur cible. */
function ValueSection<T extends string>({
  title,
  values,
  dict,
  options,
  label,
  unsetLabel,
  droppable,
  onSet,
}: {
  title: string;
  values: string[];
  dict: Record<string, T>;
  options: readonly T[];
  label: (value: T) => string;
  /** Ce que devient une valeur laissée sans réponse — dit, jamais deviné. */
  unsetLabel: string;
  /** Libellé du choix « ne pas reprendre », quand il a un sens (étiquettes). */
  droppable?: string;
  onSet: (raw: string, target: string) => void;
}) {
  if (values.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {values.map((raw) => {
        const current = dict[normalizeToken(raw)];
        return (
          <Row key={raw} label={raw}>
            <Select
              value={current === undefined ? UNSET : current === "" ? DROP : current}
              onValueChange={(v) => onSet(raw, v)}
            >
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
                {droppable && <SelectItem value={DROP}>{droppable}</SelectItem>}
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {label(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        );
      })}
    </div>
  );
}
