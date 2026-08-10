"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, toast } from "mangue-ui";
import { FileText, Plus } from "lucide-react";

import { EmptyScene } from "@/components/empty-scene";
import { usePagesQuery } from "@/lib/use-pages-query";

/**
 * L'onglet Pages sans page ouverte (MIN-270).
 *
 * Sur desktop, l'arbre est déjà à gauche : ce panneau n'a donc rien à lister, il
 * n'a qu'à dire ce qu'on peut faire. Sous `md`, la barre secondaire occupe seule
 * l'écran et ce panneau n'est pas rendu — d'où l'absence de liste ici, qui
 * ferait doublon partout.
 */
export default function ProjectPagesPage() {
  const t = useTranslations("Pages");
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { pages, loading, createPage } = usePagesQuery(projectId);

  const create = async () => {
    try {
      const page = await createPage({});
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
