"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { clearPendingDraftId, readPendingDraftId } from "@/lib/project-draft";

/**
 * Reprise du wizard de création (MIN-62). L'installation GitHub / l'OAuth
 * GitLab quittent la page en plein écran ; le projet n'existe pas encore, alors
 * le callback revient sur `/home?setup=git[&git=connected&connection=…]`.
 *
 * Le brouillon, lui, est déjà en base : `sessionStorage` n'en garde que l'id, le
 * temps de l'aller-retour. Ce composant (monté une fois pour toute l'app, rendu
 * null) lit ce pointeur, retrouve le brouillon dans la liste et rouvre le
 * wizard à l'étape git — sélecteur de dépôt ouvert si la connexion a été créée.
 *
 * Sans pointeur (autre onglet, session perdue) ou sans brouillon correspondant,
 * il ne reste que le toast : rien à rouvrir.
 */
export function ProjectDraftResume() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Settings");
  const { projectDrafts, resumeProjectDraft } = useProjects();

  // L'id lu à l'arrivée. La reprise, elle, attend la liste des brouillons — la
  // requête peut très bien n'avoir pas encore répondu quand l'URL est nettoyée.
  const [pending, setPending] = useState<{
    draftId: string;
    connectionId: string | null;
  } | null>(null);

  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get("setup") !== "git") return;
    handled.current = true;

    const status = searchParams.get("git");
    if (status === "connected") {
      toast.success(t("gitConnectedToast"));
    } else if (status === "error") {
      toast.error(t("gitConnectError"));
    }

    const draftId = readPendingDraftId();
    if (draftId) {
      setPending({
        draftId,
        connectionId: status === "connected" ? searchParams.get("connection") : null,
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    next.delete("git");
    next.delete("connection");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, t]);

  useEffect(() => {
    if (!pending) return;
    const draft = projectDrafts.find((d) => d.id === pending.draftId);
    // Pas encore là : la liste peut être en vol. On repassera à sa réponse — et
    // si le brouillon a disparu (supprimé ailleurs), rien ne se rouvrira, ce
    // qui est exactement ce qu'il faut.
    if (!draft) return;
    setPending(null);
    clearPendingDraftId();
    resumeProjectDraft(draft, pending.connectionId);
  }, [pending, projectDrafts, resumeProjectDraft]);

  return null;
}
