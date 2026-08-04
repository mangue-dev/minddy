"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";

/**
 * La grammaire commune des listes de l'accueil.
 *
 * L'accueil disait quatre choses de quatre façons : deux cartes serrées côte à
 * côte (le cycle, ce qui attend), deux listes pleine largeur (les échéances, le
 * triage). À largeur de demi-colonne, un titre de ticket se coupait au tiers,
 * les jauges du cycle mangeaient l'entête, et les deux cartes — qui ne parlaient
 * pas du tout de la même chose — se ressemblaient trait pour trait. Résultat :
 * beaucoup de matière, rien à lire, et aucune idée d'où cliquer.
 *
 * Ici toute section a le même squelette — un entête (titre, compte, action) puis
 * une carte de lignes — et toute ligne les mêmes colonnes, dans le même ordre :
 *
 *     [nature] [identifiant] [titre ………] [mesure] [projet] [temps]
 *
 * Les colonnes du milieu et de droite sont facultatives, jamais déplacées : l'œil
 * descend la page entière sans se réaligner, et deux sections empilées se
 * distinguent par ce qu'elles disent, plus par la forme qu'elles prennent.
 */

/** Le projet, tel que ces lignes ont besoin de le connaître. Volontairement plus
    étroit que `Project` : les sessions d'agent et les PR portent leur propre
    référence de projet, réduite aux mêmes quatre champs. */
export interface HomeRowProject {
  id: string;
  name: string;
  icon_url: string | null;
}

export function HomeSection({
  title,
  count,
  meta,
  right,
  children,
}: {
  title: string;
  /** Total de la file, à côté du titre. Zéro ou absent → rien. */
  count?: number;
  /** Précision discrète sur la ligne de titre (les dates d'un cycle). */
  meta?: ReactNode;
  /** Fin de ligne : jauge, lien « ouvrir en entier »… */
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="shrink-0 text-sm font-semibold tracking-tight">{title}</h2>
        {count ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
        {meta ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{meta}</span>
        ) : null}
        {right ? (
          <div className="ml-auto flex shrink-0 items-center gap-3">{right}</div>
        ) : null}
      </div>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

/** Le lien de fin d'entête : là où la section continue en entier. */
export function HomeSectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

/** La colonne d'identité : un identifiant de ticket, un numéro de PR. */
export function HomeLead({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 font-mono text-xs text-muted-foreground">{children}</span>
  );
}

/** Le projet nommé en bout de ligne — l'accueil est cross-projet, et l'orbe
    donne à chaque projet la même identité colorée que dans la sidebar. Sous `sm`
    il ne reste que l'orbe. */
export function HomeProjectTag({ project }: { project: HomeRowProject }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <ProjectOrb
        seed={project.id}
        iconUrl={project.icon_url}
        className="size-4 rounded-[5px]"
      />
      <span className="hidden max-w-[9rem] truncate sm:inline">{project.name}</span>
    </span>
  );
}

export function HomeRow({
  href,
  icon,
  kind,
  lead,
  title,
  meta,
  project,
  right,
}: {
  href: string;
  icon: ReactNode;
  /** Nature de la ligne, pour les lecteurs d'écran : l'icône seule la dit à l'œil. */
  kind: string;
  /** Identifiant du ticket, numéro de PR, compte de voix — la même colonne. */
  lead?: ReactNode;
  title: string;
  /** Ce que le ticket porte de mesurable : effort, priorité. */
  meta?: ReactNode;
  /** Absent le temps que la liste des projets arrive : la ligne reste lisible. */
  project?: HomeRowProject;
  /** La mesure propre à la section, toujours contre le bord droit : une
      échéance, un âge. */
  right?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
    >
      <span className="flex shrink-0 items-center" title={kind}>
        {icon}
        <span className="sr-only">{kind}</span>
      </span>
      {lead}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90 group-hover:text-foreground">
        {title}
      </span>
      {meta ? <span className="flex shrink-0 items-center gap-2.5">{meta}</span> : null}
      {project ? <HomeProjectTag project={project} /> : null}
      {right}
    </Link>
  );
}

/** Le « +N autres » de fin de liste : une ligne de la carte, pas une note en
    dessous — ce qui n'est pas montré appartient encore à la file. */
export function HomeMore({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2 text-xs text-muted-foreground">{children}</p>;
}

/** Une phrase à la place des lignes, quand la section a quelque chose à dire
    plutôt qu'à lister (un cycle vide, un cycle à venir). */
export function HomeNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}
