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
import { collectValueOptions, fieldsAvailableForColumn } from "@/lib/import/mapping";
import { topValues, type TableStats } from "@/lib/import/stats";
import {
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
 * Les sections sont DÉPLIÉES et posées en grille : à deux colonnes dès que le
 * conteneur a la largeur (le wizard), à une seule sinon (le panneau des
 * réglages). Elles étaient empilées dans un accordéon replié par défaut —
 * l'écran le plus important de l'import demandait donc un clic pour exister, et
 * une fois ouvert, six sections en file indienne dans une colonne étroite : on
 * ne voyait jamais plus d'une question à la fois. La grille est une requête de
 * CONTENEUR, pas de fenêtre : c'est la place réellement disponible qui décide,
 * et le même composant sert les deux surfaces sans savoir laquelle l'affiche.
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
  /**
   * Le panneau des réglages garde l'accordéon : le tableau y est une pièce
   * parmi d'autres dans une page qui défile. Le wizard, lui, a une étape
   * entière pour lui — l'y replier n'aurait caché que ce qu'on vient d'ouvrir.
   */
  collapsible = true,
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
  collapsible?: boolean;
}) {
  const t = useTranslations("Settings");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");

  const values = useMemo(() => collectValueOptions(stats, mapping), [stats, mapping]);

  const usedColumns = mapping.columns.filter((f) => f !== "ignore").length;
  // Une valeur sans réponse est ce que ce tableau existe pour montrer : elle se
  // compte par section (la pastille de la section) et en tout (le résumé).
  const unresolvedStatus = values.status.filter(
    (v) => !mapping.statusValues[normalizeToken(v)]
  ).length;
  const unresolvedPriority = values.priority.filter(
    (v) => !mapping.priorityValues[normalizeToken(v)]
  ).length;
  const unresolvedAssignee = values.assignee.filter(
    (v) => !mapping.assigneeValues[normalizeToken(v)]
  ).length;
  const unresolved = unresolvedStatus + unresolvedPriority + unresolvedAssignee;

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

  /** Ce que le tableau dit de lui-même — en tête de l'accordéon replié comme en
   *  tête de l'étape du wizard : le même état, au même endroit. */
  const summary = (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
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
  );

  /* Les sections, sans leur contenant : la grille est une requête de CONTENEUR,
     donc c'est la largeur du bloc — pas celle de la fenêtre — qui décide s'il y
     a une ou deux colonnes. Les colonnes du fichier tiennent toute la largeur :
     c'est la question qui commande toutes les autres (une colonne rangée
     ailleurs fait disparaître ses valeurs des sections d'à côté). */
  const sections = (
    <div className={cn("@container", collapsible && "border-t border-border")}>
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 p-3 @xl:grid-cols-2">
        <Section
          title={t("importMappingColumnsTitle")}
          className="@xl:col-span-2"
          /* Et deux colonnes DANS la section, puisqu'elle en occupe deux : un
             fichier Jira a trente en-têtes, une file indienne de trente lignes
             écraserait tout ce qui la suit hors de l'écran. */
          bodyClassName="@xl:grid @xl:grid-cols-2 @xl:gap-x-6"
        >
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
                <SelectTrigger size="sm" className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                {/* Un champ simple déjà pris par une AUTRE colonne ne se
                    propose plus : `applyMapping` ne lirait jamais la seconde,
                    et rien à l'écran ne le dirait. Voir
                    `fieldsAvailableForColumn`. */}
                <SelectContent>
                  {fieldsAvailableForColumn(mapping.columns, col.index).map((field) => (
                    <SelectItem key={field} value={field}>
                      {fieldLabel(field)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          ))}
        </Section>

        <ValueSection
          title={t("importValuesStatus")}
          flagUnset
          values={values.status}
          dict={mapping.statusValues}
          options={ISSUE_STATUSES}
          label={(v: IssueStatusValue) => tStatus(v)}
          unsetLabel={t("importValueBacklog")}
          onSet={(raw, target) => setValue("statusValues", raw, target)}
        />
        <ValueSection
          title={t("importValuesPriority")}
          flagUnset
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
          flagUnset
          values={values.assignee}
          dict={mapping.assigneeValues}
          options={members.map((m) => m.userId)}
          label={(id: string) =>
            memberName(
              members.find((m) => m.userId === id) ?? {
                userId: id,
                email: null,
                name: null,
              }
            )
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
    </div>
  );

  if (!collapsible) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-center justify-end px-3">{summary}</div>
        <div className="rounded-lg border border-border">{sections}</div>
      </div>
    );
  }

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
        <span className="ml-auto">{summary}</span>
      </CollapsibleTrigger>

      <CollapsibleContent>{sections}</CollapsibleContent>
    </Collapsible>
  );
}

/** Un bloc de questions, avec son titre. */
function Section({
  title,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <div className={cn("flex flex-col gap-1.5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Une ligne « ce que dit le fichier → ce que minddy en fait ».
 *
 * Une ligne sans réponse se signale SUR ELLE-MÊME : fond ambré discret,
 * astérisque contre son libellé. Le compte en tête de section disait combien il
 * en restait sans jamais dire lesquelles — sur une section de vingt étiquettes,
 * « 3 valeurs à placer » oblige à comparer chaque sélecteur au voisin pour
 * retrouver les trois. Le total reste en tête du tableau, où il répond à une
 * autre question : reste-t-il quelque chose à faire ici.
 */
function Row({
  label,
  hint,
  unresolved = false,
  children,
}: {
  label: string;
  hint?: string;
  unresolved?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("Settings");
  return (
    <div
      className={cn(
        "-mx-1.5 flex items-center gap-3 rounded-md px-1.5 py-0.5",
        unresolved && "bg-amber-500/10 dark:bg-amber-500/15"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {label}
          {unresolved && (
            // `aria-hidden` sur le signe, le mot en `sr-only` juste après :
            // « astérisque » lu à voix haute n'apprend rien à personne.
            <>
              <span
                className="ml-0.5 font-medium text-amber-600 dark:text-amber-500"
                aria-hidden
                title={t("importValueToPlace")}
              >
                *
              </span>
              <span className="sr-only"> — {t("importValueToPlace")}</span>
            </>
          )}
        </p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Les valeurs distinctes d'une colonne à dictionnaire, et leur cible. */
function ValueSection<T extends string>({
  title,
  flagUnset = false,
  values,
  dict,
  options,
  label,
  unsetLabel,
  droppable,
  onSet,
}: {
  title: string;
  /**
   * Une valeur sans réponse est un TROU dans ce plan-là. Vrai pour les statuts,
   * les priorités et les personnes, où « rien » veut dire qu'on a renoncé à
   * placer quelque chose que le fichier disait. Faux pour les efforts et les
   * étiquettes, dont l'absence de réponse est une réponse : pas d'effort, ou
   * une catégorie créée telle quelle.
   */
  flagUnset?: boolean;
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
    <Section title={title}>
      {values.map((raw) => {
        const current = dict[normalizeToken(raw)];
        return (
          <Row key={raw} label={raw} unresolved={flagUnset && current === undefined}>
            <Select
              value={current === undefined ? UNSET : current === "" ? DROP : current}
              onValueChange={(v) => onSet(raw, v)}
            >
              <SelectTrigger size="sm" className="w-40 shrink-0">
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
    </Section>
  );
}
