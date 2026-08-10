"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslations } from "next-intl";
// `cx` et pas `cn` de mangue-ui : le baril tire le sélecteur d'emoji, et le
// registre de blocs cesserait d'être importable hors navigateur (cf. cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import { FileText } from "lucide-react";
import { usePagesLookup } from "@/components/pages/pages-lookup";

/** La vue d'un bloc sous-page : l'icône et le titre de la page CIBLE, relus à
    chaque rendu depuis le cache du projet — jamais recopiés dans le nœud. */
export function SubpageView({ node, selected }: NodeViewProps) {
  const t = useTranslations("Pages");
  const lookup = usePagesLookup();
  const pageId = (node.attrs.pageId as string | null) ?? null;
  const page = pageId ? lookup?.get(pageId) : undefined;

  return (
    <NodeViewWrapper
      as="div"
      data-page-id={pageId}
      className={cx(
        "my-1 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted",
        selected && "bg-muted ring-1 ring-ring"
      )}
      contentEditable={false}
    >
      {page?.icon ? (
        <span className="text-base leading-none">{page.icon}</span>
      ) : (
        <FileText className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span
        className={cx(
          "truncate font-medium underline decoration-border underline-offset-4",
          !page && "text-muted-foreground no-underline"
        )}
      >
        {page ? page.title : t("subpageUntitled")}
      </span>
    </NodeViewWrapper>
  );
}
