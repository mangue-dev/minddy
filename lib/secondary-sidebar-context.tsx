"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * La sidebar SECONDAIRE — la colonne de navigation propre à une page : la liste
 * des pull requests, des sessions d'agent, du triage, des retours.
 *
 * Elle s'écrit DANS la page, avec l'état de sélection qui pilote le détail juste
 * à côté ; elle s'AFFICHE dans le châssis de l'application, à gauche du header,
 * pleine hauteur, collée à la sidebar primaire. C'est un second niveau de
 * navigation, pas un morceau du contenu — et le header au fil d'Ariane commence
 * donc APRÈS elle, comme il commence après la primaire.
 *
 * Ce contexte est le fil entre les deux moitiés : un point de téléportation
 * (`slot`, posé par le châssis) et un compte des barres montées (`present`, qui
 * fait passer la primaire en rail). Le portail est ce qui permet à la barre de
 * changer de place dans le DOM sans quitter son composant : la sélection, les
 * filtres et les requêtes restent là où on les lit.
 *
 * Sous `desktop` (1200 px) rien de tout cela ne s'applique : la barre reste où
 * elle est écrite, dans la page, et le comportement mobile ne bouge pas.
 */
interface SecondarySidebar {
  /** L'élément du châssis où les pages téléportent leur barre (desktop seulement). */
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  /** Une page monte-t-elle une barre secondaire ? La primaire passe alors en rail. */
  present: boolean;
  /** À appeler au montage d'une barre ; la fonction rendue la retire du compte. */
  register: () => () => void;
}

const SecondarySidebarContext = createContext<SecondarySidebar | null>(null);

export function useSecondarySidebar(): SecondarySidebar {
  const ctx = useContext(SecondarySidebarContext);
  if (!ctx) {
    throw new Error(
      "useSecondarySidebar must be used within a SecondarySidebarProvider",
    );
  }
  return ctx;
}

export function SecondarySidebarProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Un COMPTE, pas un booléen : entre deux pages à barre secondaire, l'ancienne
  // se démonte après le montage de la nouvelle. Un booléen retomberait à faux
  // au passage, le temps d'une image — assez pour voir la primaire se déplier
  // puis se replier aussitôt.
  const [count, setCount] = useState(0);

  const register = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);

  const value = useMemo<SecondarySidebar>(
    () => ({ slot, setSlot, present: count > 0, register }),
    [slot, count, register],
  );

  return (
    <SecondarySidebarContext.Provider value={value}>
      {children}
    </SecondarySidebarContext.Provider>
  );
}

/**
 * Les routes dont la page monte une barre secondaire.
 *
 * Le compte ci-dessus est la vérité, et il se suffit — SAUF avant l'hydratation :
 * au rendu serveur aucune barre n'est encore montée, la primaire partirait donc
 * dépliée et le contenu pleine largeur, pour se réorganiser d'un coup à
 * l'hydratation. Cette table donne la réponse dès le HTML du serveur, et le
 * compte reprend la main juste après.
 *
 * Elle n'a donc pas besoin d'être exacte pour que l'application soit juste : une
 * route oubliée ici coûte un réagencement au premier affichage, pas un bug. Une
 * page dont la barre disparaît (liste vide) se corrige toute seule.
 */
export function routeHasSecondaryNav(pathname: string): boolean {
  if (pathname.startsWith("/pull-requests")) return true;
  if (pathname.startsWith("/agents")) return true;
  if (pathname.startsWith("/settings")) return true;
  return /^\/projects\/[^/]+\/(triage|feedback|settings)/.test(pathname);
}
