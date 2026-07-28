"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { readProjectDraft } from "@/lib/project-draft";

/**
 * Reprise du wizard de création (MIN-62). L'installation GitHub / l'OAuth
 * GitLab quittent la page en plein écran ; le projet n'existe pas encore, alors
 * le callback revient sur `/home?setup=git[&git=connected&connection=…]` et
 * c'est le brouillon de session (lib/project-draft.ts) qui porte la saisie.
 *
 * Ce composant (monté une fois pour toute l'app, rendu null) relit ce brouillon,
 * rouvre le wizard à l'étape git — sélecteur de dépôt ouvert si la connexion a
 * été créée — puis nettoie l'URL. Sans brouillon (expiré, autre onglet, session
 * perdue), il ne reste que le toast : rien à rouvrir.
 */
export function ProjectDraftResume() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Settings");
  const { resumeProjectDraft } = useProjects();

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

    const draft = readProjectDraft();
    if (draft) {
      resumeProjectDraft(
        draft,
        status === "connected" ? searchParams.get("connection") : null
      );
    }

    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    next.delete("git");
    next.delete("connection");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, t, resumeProjectDraft]);

  return null;
}
