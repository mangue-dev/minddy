"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import { ChevronRight, Folder } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";

/**
 * Un PROJET et ses lignes, replié ou non — la grammaire commune des colonnes de
 * navigation qui listent des choses appartenant à des projets (conversations de
 * l'agent, pull requests).
 *
 * C'est l'échelle à laquelle on cherche : on sait sur quel projet on travaillait
 * bien avant de se souvenir du titre exact de la ligne. Et c'est ce qui permet
 * aux lignes elles-mêmes de ne PLUS porter leur projet — il est écrit une fois,
 * au-dessus d'elles.
 *
 * Ce composant tient la COQUE (en-tête, repli, « afficher plus », alignements) ;
 * les LIGNES restent à l'appelant, qui seul sait ce qu'elles disent. La découpe
 * aussi : combien montrer avant « afficher plus » dépend de ce qui est
 * sélectionné, que l'appelant est seul à connaître.
 */

/** Clé du groupe des lignes ORPHELINES (projet non joint — RLS aberrante). */
export const NO_PROJECT_KEY = "__no_project__";

/** Lignes montrées par projet avant « Afficher plus ». */
export const PROJECT_GROUP_LIMIT = 5;

/**
 * Le retrait des lignes sous un en-tête : elles s'alignent sur le NOM du projet
 * (px-2 + orbe + sa gouttière), pas sur son orbe. À poser sur la ligne
 * elle-même, pas sur un conteneur : son fond de survol doit courir sur toute la
 * largeur de la colonne.
 */
export const PROJECT_GROUP_INDENT = "pl-8";

/** Le projet d'un groupe, réduit à ce que l'en-tête peint. */
export interface GroupProject {
  id: string;
  name: string;
  icon_url: string | null;
}

export interface ProjectGroup<T> {
  key: string;
  project: GroupProject | null;
  items: T[];
}

/**
 * Un groupe par projet, dans l'ordre d'APPARITION des lignes — qui arrivent
 * déjà triées de la plus récente à la plus ancienne. Le projet dont on a parlé
 * en dernier est donc en tête, et ses lignes gardent leur ordre.
 */
export function groupByProject<T>(
  items: readonly T[],
  projectOf: (item: T) => GroupProject | null,
): ProjectGroup<T>[] {
  const groups = new Map<string, ProjectGroup<T>>();
  for (const item of items) {
    const project = projectOf(item);
    const key = project?.id ?? NO_PROJECT_KEY;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, project, items: [item] });
  }
  return [...groups.values()];
}

/** Ajoute ou retire une clé d'un ensemble, sans le muter. */
export function toggledSet(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

export function SidebarProjectGroup({
  project,
  fallbackLabel,
  open,
  collapsible,
  onToggle,
  collapsedBadge,
  actions,
  hiddenCount,
  onShowAll,
  showMoreLabel,
  children,
}: {
  project: GroupProject | null;
  /** Nom de repli quand le projet n'est pas joint (`NO_PROJECT_KEY`). */
  fallbackLabel: string;
  open: boolean;
  /**
   * Faux pendant un filtre : la liste est alors dépliée de force, et un en-tête
   * qui ne peut plus rien replier n'est plus un bouton — il redevient l'étiquette
   * du projet, sans chevron ni clic mort. Le chevron étant en BOUT de ligne, son
   * absence ne décale rien.
   */
  collapsible: boolean;
  onToggle: () => void;
  /**
   * Ce qui se passe dessous, quand on ne le voit plus (spinner, point non lu) :
   * replier un projet ne doit pas faire disparaître ce qui réclamait l'attention.
   * Rendu seulement quand le groupe est REPLIÉ.
   */
  collapsedBadge?: ReactNode;
  /** Action révélée au survol de l'en-tête (le « + » de la page Agents). */
  actions?: ReactNode;
  /** Lignes cachées par la coupe → « Afficher plus ». */
  hiddenCount: number;
  onShowAll: () => void;
  showMoreLabel: string;
  children: ReactNode;
}) {
  const header = (
    <>
      {project ? (
        <ProjectOrb
          seed={project.id}
          iconUrl={project.icon_url}
          className="size-4 shrink-0"
        />
      ) : (
        <Folder className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {project?.name ?? fallbackLabel}
      </span>
      {!open ? collapsedBadge : null}
    </>
  );
  const headerClass =
    "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left";

  return (
    <div className="flex flex-col">
      {/* Le repli et l'action de l'en-tête sont deux gestes distincts : deux
          boutons côte à côte, dans une ligne qui s'allume d'un seul tenant au
          survol (un bouton dans un bouton n'existe pas, en HTML comme à la
          souris). */}
      <div className="group/project flex items-center rounded-md pr-1 transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={cn(headerClass, "outline-none")}
          >
            {header}
          </button>
        ) : (
          <div className={headerClass}>{header}</div>
        )}
        {actions}
        {/* Le chevron ferme la ligne, à droite de tout : l'action réserve sa place
            même invisible, donc rien ne bouge au survol. Il rejoue le geste du
            grand bouton d'en-tête — d'où `aria-hidden` et le retrait du parcours
            clavier : un seul contrôle annoncé, pas deux. */}
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            tabIndex={-1}
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center outline-none"
          >
            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-col">
          {children}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={onShowAll}
              className={cn(
                "rounded-md py-1.5 pr-2 text-left text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground",
                PROJECT_GROUP_INDENT,
              )}
            >
              {showMoreLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
