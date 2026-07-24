"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import type { StatsHeatmap, HeatmapDay } from "@/lib/types";

// Échelle d'intensité (5 niveaux) façon GitHub, teinte "done" (emerald — la
// couleur du statut Terminé partout dans l'app). Classes littérales complètes :
// Tailwind ne génère pas les noms construits dynamiquement.
//
// Le niveau 0 (jour sans rien) ne peut PAS être `bg-muted` : en thème sombre,
// --muted (L 0.200) est plus sombre que --card (L 0.214), donc les cases vides
// disparaissent dans la carte et la grille perd sa forme. Une teinte dérivée du
// texte, elle, contraste dans les deux thèmes.
const LEVEL_CLASSES = [
  "bg-foreground/[0.07] dark:bg-foreground/[0.13]",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-500",
  "bg-emerald-700 dark:bg-emerald-300",
] as const;

// Le jour d'inscription est un REPÈRE, pas une intensité : sa case garde
// l'orange même si des tickets ont été terminés ce jour-là (c'est le seul
// point fixe de la grille, on ne veut pas qu'il se noie dans l'échelle verte).
const JOINED_CLASS = "bg-orange-500 dark:bg-orange-400";

// Géométrie de la grille : une case de 12px + 4px de gouttière = un pas de
// 16px, partagé par les cases, les libellés de mois et la colonne de jours —
// c'est ce qui garantit que « mars » tombe bien au-dessus de sa semaine.
const CELL = "size-3 rounded-[3px]";

/** Lignes portant un libellé de jour (la grille démarre un dimanche). */
const LABELLED_ROWS = new Set([1, 3, 5]); // lundi, mercredi, vendredi

function levelOf(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

const parseYmd = (d: string) => new Date(`${d}T00:00:00Z`);

/** Découpe la série dense (start = dimanche) en semaines de 7 jours (colonnes). */
function toWeeks(days: HeatmapDay[]): HeatmapDay[][] {
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** Une ligne du détail : pastille de la même famille que les cases, valeur en
 *  avant, unité en retrait — on lit le nombre avant de lire ce qu'il compte. */
function DetailRow({ swatch, value, unit }: { swatch: string; value: number; unit: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 shrink-0 rounded-[2px] ${swatch}`} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-background/65">{unit}</span>
    </div>
  );
}

/** Contenu de l'infobulle d'un jour : la date en tête, puis le détail de ce qui
 *  a été terminé — les tâches n'apparaissent que s'il y en a. Le jour
 *  d'inscription porte en plus sa ligne dédiée, qui explique sa case orange. */
function DayDetail({ day, joined }: { day: HeatmapDay; joined: boolean }) {
  const t = useTranslations("Stats");
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-1.5 text-left">
      {/* `first-letter` et non `capitalize` : en français, jours et mois sont en
          minuscules — « jeudi 28 août », pas « Jeudi 28 Août ». Seule l'initiale
          de la ligne se met en majuscule (sans effet en anglais, déjà capitalisé). */}
      <div className="font-medium first-letter:uppercase">
        {format.dateTime(parseYmd(day.date), {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        })}
      </div>
      <div className="flex flex-col gap-1">
        {joined ? (
          <div className="flex items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-[2px] ${JOINED_CLASS}`} />
            <span>{t("dayJoined")}</span>
          </div>
        ) : null}
        {day.issues > 0 ? (
          <DetailRow
            swatch="bg-emerald-400"
            value={day.issues}
            unit={t("dayIssuesUnit", { count: day.issues })}
          />
        ) : null}
        {day.tasks > 0 ? (
          <DetailRow
            swatch="bg-background/45"
            value={day.tasks}
            unit={t("dayTasksUnit", { count: day.tasks })}
          />
        ) : null}
        {/* « Rien de terminé » n'a de sens que si la case n'a rien d'autre à
            dire — le jour d'inscription, lui, porte déjà son repère. */}
        {day.count === 0 && !joined ? (
          <div className="text-background/65">{t("dayNone")}</div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Grille de contributions sur 53 semaines (MIN-85).
 *
 * Colonnes = semaines, lignes = jours (dimanche → samedi). Par rapport à la
 * version précédente : une gouttière de labels de jours à gauche, et une vraie
 * infobulle structurée au lieu de l'attribut `title` natif (lent à s'ouvrir,
 * non stylable, et qui aplatissait tout en une phrase).
 *
 * UNE seule infobulle pour les 371 cases, et non une par case : un ancrage
 * invisible se déplace sur la case survolée (via délégation d'événement), ce
 * qui évite de monter 371 racines Radix. Chaque case garde son `aria-label` —
 * l'infobulle est un confort visuel, pas le seul porteur de l'information.
 */
export function ActivityHeatmap({
  heatmap,
  joinedDate,
}: {
  heatmap: StatsHeatmap;
  /** Jour d'inscription (YYYY-MM-DD, dans `heatmap.tz`), ou null s'il est
   *  inconnu ou antérieur à la fenêtre — la case correspondante est marquée. */
  joinedDate?: string | null;
}) {
  const t = useTranslations("Stats");
  const format = useFormatter();

  const [hovered, setHovered] = useState<{
    day: HeatmapDay;
    left: number;
    top: number;
  } | null>(null);

  const weeks = useMemo(() => toWeeks(heatmap.days), [heatmap.days]);

  // Un label de mois au-dessus de la colonne où un nouveau mois commence.
  const monthLabels = useMemo(
    () =>
      weeks.map((week, i) => {
        const first = week[0];
        if (!first) return "";
        const d = parseYmd(first.date);
        const prev = i > 0 ? parseYmd(weeks[i - 1][0].date) : null;
        if (i === 0 || (prev && d.getUTCMonth() !== prev.getUTCMonth())) {
          return format.dateTime(d, { month: "short", timeZone: "UTC" });
        }
        return "";
      }),
    [weeks, format],
  );

  // Noms de jours localisés, lus sur la première semaine réelle : `start` est
  // garanti dimanche, donc l'index de ligne = le jour de la semaine.
  const weekdayLabels = useMemo(() => {
    const first = weeks[0];
    if (!first) return [] as string[];
    return Array.from({ length: 7 }, (_, row) => {
      if (!LABELLED_ROWS.has(row) || !first[row]) return "";
      return format.dateTime(parseYmd(first[row].date), {
        weekday: "short",
        timeZone: "UTC",
      });
    });
  }, [weeks, format]);

  // `offsetLeft/offsetTop` sont relatifs à la grille (positionnée), donc
  // l'ancrage se place sans mesure coûteuse et suit le défilement horizontal.
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-day-index]",
      );
      if (!cell) return;
      const day = heatmap.days[Number(cell.dataset.dayIndex)];
      if (!day) return;
      setHovered((prev) =>
        prev?.day.date === day.date
          ? prev
          : { day, left: cell.offsetLeft, top: cell.offsetTop },
      );
    },
    [heatmap.days],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-2">
          {/* Gouttière des jours. Le décalage haut (mt-4 = 16px) reproduit la
              ligne des mois (10px de texte) + la gouttière de 6px qui la sépare
              de la grille, pour que les lignes se répondent exactement. */}
          <div
            aria-hidden
            className="mt-4 grid grid-rows-7 gap-1 text-[10px] leading-none text-muted-foreground"
          >
            {weekdayLabels.map((label, row) => (
              <div
                key={row}
                className="flex h-3 items-center justify-end whitespace-nowrap"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {/* Labels de mois — une piste de 12px par semaine, débordement à droite */}
            <div className="grid grid-flow-col auto-cols-[12px] gap-1 text-[10px] leading-none text-muted-foreground">
              {monthLabels.map((label, i) => (
                <div key={i} className="overflow-visible whitespace-nowrap">
                  {label}
                </div>
              ))}
            </div>

            {/* Grille : colonnes = semaines, lignes = jours (dim → sam) */}
            <div
              className="relative grid grid-flow-col grid-rows-7 gap-1"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHovered(null)}
            >
              {heatmap.days.map((day, i) => {
                const joined = day.date === joinedDate;
                // « 3 tickets · 2 tâches · 12 mars » — l'équivalent textuel du
                // détail de l'infobulle, pour les lecteurs d'écran.
                const parts: string[] = [];
                if (joined) parts.push(t("dayJoined"));
                if (day.issues > 0) parts.push(t("dayIssues", { count: day.issues }));
                if (day.tasks > 0) parts.push(t("dayTasks", { count: day.tasks }));
                if (parts.length === 0) parts.push(t("dayNone"));
                const label = `${parts.join(" · ")} · ${format.dateTime(
                  parseYmd(day.date),
                  { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
                )}`;
                return (
                  <div
                    key={day.date}
                    data-day-index={i}
                    aria-label={label}
                    className={`${CELL} ${
                      joined
                        ? JOINED_CLASS
                        : LEVEL_CLASSES[levelOf(day.count, heatmap.max)]
                    }`}
                  />
                );
              })}

              {/* Ancrage invisible de l'infobulle, déplacé sur la case survolée.
                  `key` sur le contenu : le remontage force Radix à recalculer sa
                  position quand on glisse d'une case à l'autre. */}
              <Tooltip open={hovered !== null}>
                <TooltipTrigger asChild>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute size-3"
                    style={{ left: hovered?.left ?? 0, top: hovered?.top ?? 0 }}
                  />
                </TooltipTrigger>
                {hovered ? (
                  <TooltipContent
                    key={hovered.day.date}
                    className="max-w-none text-left"
                  >
                    <DayDetail
                      day={hovered.day}
                      joined={hovered.day.date === joinedDate}
                    />
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>{t("less")}</span>
        {LEVEL_CLASSES.map((cls, i) => (
          <span key={i} className={`${CELL} ${cls}`} />
        ))}
        <span>{t("more")}</span>
      </div>
    </div>
  );
}
