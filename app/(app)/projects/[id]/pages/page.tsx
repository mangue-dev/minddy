"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, toast } from "mangue-ui";
import { FileText, Plus } from "lucide-react";

import { EmptyScene } from "@/components/empty-scene";
import { usePagesQuery } from "@/lib/use-pages-query";
import { markDraftPage } from "@/lib/pages-draft";
import { readLastPage } from "@/lib/pages-last-open";

/**
 * L'onglet Pages sans page ouverte (MIN-270).
 *
 * Sur desktop, l'arbre est déjà à gauche : ce panneau n'a donc rien à lister, il
 * n'a qu'à dire ce qu'on peut faire. Sous `md`, la barre secondaire occupe seule
 * l'écran et ce panneau n'est pas rendu — d'où l'absence de liste ici, qui
 * ferait doublon partout.
 *
 * Et avant de le montrer : on ROUVRE la dernière page lue. Revenir dans l'onglet
 * pour continuer ce qu'on écrivait est le cas courant ; l'écran « choisissez une
 * page à gauche » était alors un clic de plus, à chaque fois, sur une page qu'on
 * savait déjà vouloir.
 */
export default function ProjectPagesPage() {
  const t = useTranslations("Pages");
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { pages, byId, loading, createPage } = usePagesQuery(projectId);

  // Une seule fois par montage : sans ce verrou, revenir DÉLIBÉRÉMENT à la
  // liste (mobile, bouton précédent) se ferait renvoyer en boucle sur la page.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || loading) return;
    restored.current = true;
    // Sous `md`, cet écran-ci n'est pas affiché : c'est l'ARBRE qui occupe la
    // largeur, et c'est bien lui qu'on veut voir en arrivant. Rouvrir la
    // dernière page y sauterait par-dessus la seule navigation du téléphone.
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const last = readLastPage(projectId);
    // La page a pu partir à la corbeille depuis : on ne va pas sur un lien
    // mort, et on ne nettoie rien — la prochaine page ouverte réécrira l'entrée.
    if (last && byId.has(last)) router.replace(`/projects/${projectId}/pages/${last}`);
  }, [loading, byId, projectId, router]);

  const create = async () => {
    try {
      const page = await createPage({});
      // Créée vide : elle ne survit pas à un départ sans une lettre dedans.
      markDraftPage(page.id);
      router.push(`/projects/${projectId}/pages/${page.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createFailed"));
    }
  };

  if (loading) return null;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyScene
        icon={FileText}
        title={pages.length === 0 ? t("emptyTitle") : t("pickTitle")}
      >
        <Button onClick={() => void create()}>
          <Plus className="size-4" />
          {t("newPage")}
        </Button>
      </EmptyScene>
    </div>
  );
}
