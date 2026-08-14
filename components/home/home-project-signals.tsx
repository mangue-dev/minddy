"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useTriageCountsQuery } from "@/lib/use-triage-counts-query";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";

/** Même courbe que l'avis Smart Assign, juste à côté : les indications se posent
    sous le composer quand les chiffres arrivent, au lieu d'y apparaître d'un coup. */
const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Combien de lignes au plus. L'accueil tient en UN écran, et cette colonne est
 * la seule qui grandisse avec le compte : un porteur de huit projets aurait
 * poussé le composer hors du centre, puis la page hors de la fenêtre. Ce qui
 * dépasse se dit en une ligne de plus, pas en huit.
 */
const MAX_ROWS = 3;

type Signal = {
  projectId: string;
  projectName: string;
  iconUrl: string | null;
  /** Déjà résolue (`projectOrbSeed`) : la ligne n'a plus le projet sous la main. */
  orbSeed: string;
  /** Les deux moitiés de `ProjectTriageCount`, nommées comme les ONGLETS du
      projet : la file et sa destination portent le même mot, et la ligne se
      contente donc de le poser dans son href. */
  kind: "triage" | "feedback";
  count: number;
};

/**
 * Ce qui attend dans chacun de mes projets, en une phrase par projet et par
 * file : « minddy a 2 tickets en triage », « mangue-ui a 3 retours à trier ».
 *
 * Les chiffres viennent de la MÊME lecture que les pastilles de la sidebar
 * (GET /api/me/triage-counts, déjà montée par le shell sur toutes les pages
 * hors projet — donc aucune requête de plus ici) : la ligne d'un projet et sa
 * pastille dans la sidebar disent forcément le même nombre, et la somme des
 * deux lignes d'un projet retombe sur son unique pastille.
 *
 * Deux lignes plutôt qu'une somme : « en triage » et « à trier » ne mènent pas
 * au même onglet, et un seul chiffre pour les deux n'aurait dit où aller.
 *
 * Le tour se fait sur MES projets, pas sur les clés de la table : un projet à
 * la corbeille garde ses tickets en triage (DELETE /api/projects/[id] n'y
 * touche pas) et continue donc d'y peser, alors qu'il n'est plus dans la liste.
 * Le joindre par la liste, c'est l'écarter sans avoir à le filtrer.
 */
export function HomeProjectSignals() {
  const t = useTranslations("Home");
  const { projects } = useProjects();
  const { counts } = useTriageCountsQuery();

  const signals = useMemo(() => {
    const rows: Signal[] = [];
    for (const project of projects) {
      const count = counts[project.id];
      if (!count) continue;
      for (const kind of ["triage", "feedback"] as const) {
        if (count[kind] > 0) {
          rows.push({
            projectId: project.id,
            projectName: project.name,
            iconUrl: project.icon_url,
            orbSeed: projectOrbSeed(project),
            kind,
            count: count[kind],
          });
        }
      }
    }
    // La plus grosse file d'abord — c'est celle qui pourrit. Le nom départage,
    // pour que deux files égales ne changent pas de place d'un rendu à l'autre.
    rows.sort(
      (a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName)
    );
    return rows;
  }, [projects, counts]);

  if (signals.length === 0) return null;

  const shown = signals.slice(0, MAX_ROWS);
  // Ce qui reste se compte en ÉLÉMENTS, pas en lignes : « 2 autres lignes » ne
  // veut rien dire, « 7 autres éléments à trier » est ce qu'on veut savoir.
  const rest = signals
    .slice(MAX_ROWS)
    .reduce((sum, signal) => sum + signal.count, 0);

  return (
    <motion.ul
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION}
      className="flex flex-col gap-1.5"
    >
      {shown.map((signal) => (
        <li key={`${signal.projectId}-${signal.kind}`}>
          <Link
            href={`/projects/${signal.projectId}/${signal.kind}`}
            className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ProjectOrb
              seed={signal.orbSeed}
              iconUrl={signal.iconUrl}
              className="size-5 rounded-[6px]"
            />
            <span className="min-w-0 flex-1 truncate">
              {t.rich(
                signal.kind === "triage" ? "signalTriage" : "signalFeedback",
                {
                  name: signal.projectName,
                  count: signal.count,
                  b: (chunks) => (
                    <span className="font-medium text-foreground">{chunks}</span>
                  ),
                }
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}

      {/* Le reste : dit, mais pas cliquable — il n'y a pas de file « à trier »
          globale à ouvrir, et la sidebar mène déjà à chaque projet. */}
      {rest > 0 ? (
        <li className="px-3.5 text-xs text-muted-foreground">
          {t("signalMore", { count: rest })}
        </li>
      ) : null}
    </motion.ul>
  );
}
