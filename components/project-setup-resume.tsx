"use client";

import { useEffect, useRef } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";

/**
 * Reprise du wizard de création (MIN-62). L'installation GitHub / OAuth GitLab
 * quitte la page en plein écran ; quand elle a été initiée depuis le wizard, le
 * callback revient sur `/projects/{id}?setup=git[&git=connected&connection=…]`.
 * Ce composant (monté par le layout projet, rendu null) rouvre alors le wizard
 * à l'étape git — sélecteur de dépôt ouvert si la connexion a été créée — puis
 * nettoie l'URL.
 */
export function ProjectSetupResume() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Settings");
  const { projects, openProjectSetup } = useProjects();

  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get("setup") !== "git") return;
    // La liste des projets alimente le wizard : attendre qu'elle soit chargée.
    const project = projects.find((p) => p.id === params.id);
    if (!project) return;
    handled.current = true;

    const status = searchParams.get("git");
    if (status === "connected") {
      toast.success(t("gitConnectedToast"));
    } else if (status === "error") {
      toast.error(t("gitConnectError"));
    }
    openProjectSetup(
      project,
      status === "connected" ? searchParams.get("connection") : null
    );

    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    next.delete("git");
    next.delete("connection");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, projects, params.id, pathname, router, t, openProjectSetup]);

  return null;
}
