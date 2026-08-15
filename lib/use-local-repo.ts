"use client";

import { useCallback, useEffect, useState } from "react";

import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { LocalRepoState } from "@/lib/desktop/local-repo";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";

/**
 * LE DOSSIER LOCAL D'UN PROJET, VU DE LA PAGE (MIN-359).
 *
 * Un seul hook pour les deux surfaces qui en parlent : la carte des réglages du
 * projet, qui l'attache, et le sélecteur d'environnement de la conversation, qui
 * décide si le choix « ma machine » existe.
 *
 * **`null` partout ailleurs que dans l'app de bureau**, et c'est le cas normal :
 * dans un navigateur il n'y a pas de pont, donc pas d'attachement possible, donc
 * pas de sélecteur — pas un sélecteur grisé qui promettrait quelque chose.
 *
 * Le dépôt contre lequel on valide vient de la liaison du projet
 * (`useProjectGitLinkQuery`) : sans dépôt lié, l'agent n'a de toute façon rien à
 * faire, en local comme dans le cloud.
 */
export function useLocalRepo(projectId: string | null) {
  const { link } = useProjectGitLinkQuery(projectId);
  const fullName = link?.repo_full_name ?? null;
  const [state, setState] = useState<LocalRepoState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || !projectId || !fullName) {
      setState(null);
      return;
    }
    // La réponse d'un projet qu'on vient de quitter ne doit pas s'afficher sur
    // le suivant : le montage suivant repart de `null`, celui-ci se tait.
    let alive = true;
    void bridge
      .localRepo({ projectId, fullName })
      .then((next) => {
        if (alive) setState(next);
      })
      .catch(() => {
        if (alive) setState({ status: "none" });
      });
    return () => {
      alive = false;
    };
  }, [projectId, fullName]);

  /** Ouvre le panneau système. Rend le verdict, pour que l'appelant le dise. */
  const attach = useCallback(async (): Promise<LocalRepoState | null> => {
    const bridge = getDesktopBridge();
    if (!bridge || !projectId || !fullName || busy) return null;
    setBusy(true);
    try {
      const next = await bridge.chooseLocalRepo({ projectId, fullName });
      // Un dossier REFUSÉ n'est pas rangé côté app : on ne l'affiche donc pas
      // comme l'état courant, on le rend à l'appelant qui en fera un message.
      if (next.status === "ready") setState(next);
      return next;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [projectId, fullName, busy]);

  const detach = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge || !projectId || busy) return;
    setBusy(true);
    try {
      setState(await bridge.forgetLocalRepo({ projectId }));
    } catch {
      // Rien à réparer : l'état affiché reste celui d'avant, et le prochain
      // montage relira le disque.
    } finally {
      setBusy(false);
    }
  }, [projectId, busy]);

  return {
    /** `null` hors app de bureau, ou tant que la première lecture n'a pas répondu. */
    state,
    /** Le dossier est attaché ET encore valide : le run local est possible. */
    ready: state?.status === "ready",
    /** Le projet a un dépôt lié : sans ça, il n'y a rien à attacher. */
    linked: !!fullName,
    busy,
    attach,
    detach,
  };
}
