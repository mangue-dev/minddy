"use client";

// L'HISTORIQUE d'une page (MIN-277) — la liste des états antérieurs, l'aperçu
// de l'un d'eux, et le retour en arrière.
//
// C'est le filet de l'agent, et c'est à ce titre qu'il existe : six outils
// d'écriture sont ouverts à Numo, au MCP et à l'agent de code, et sans cet écran
// la seule réponse possible à « l'agent a écrasé ma page » serait « on ne peut
// rien faire ». D'où deux partis pris qui se voient tout de suite :
//
// 1. **une écriture d'agent se reconnaît dans la liste** — au nom (« minddy »,
//    jamais celui du compte qui l'a permise) et à sa marque. C'est la ligne
//    qu'on cherche quand on ouvre ce panneau.
// 2. **restaurer est un geste, pas un parcours** : un bouton sur la version
//    qu'on lit. Il ne détruit rien — l'état d'avant la restauration entre
//    lui-même dans l'historique, donc se restaure à son tour.
//
// L'aperçu monte le VRAI éditeur en `editable: false`, et pas un rendu à part :
// l'éditeur EST la surface (cf. l'architecture des mentions). Un second rendu
// finirait par diverger sur exactement les blocs qu'on regarde le moins.
//
// ─── Et l'ACTIVITÉ à côté (MIN-278) ─────────────────────────────────────────
//
// Un second onglet, dans le même panneau, parce que la question est la même —
// « qu'est-il arrivé à cette page ? » — et qu'elle se pose au même endroit : en
// lisant « modifiée par quelqu'un d'autre » en tête de page. Deux onglets et
// non une liste, parce que les deux réponses ne sont pas de même nature : les
// versions sont des ÉTATS qu'on relit et qu'on remet en place, l'activité des
// GESTES — dont ceux qui ne laissent aucun état derrière eux (créée, mise à la
// corbeille, restaurée, renommée).

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Sparkles, RotateCcw } from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import {
  fetchPageVersionApi,
  fetchPageVersionsApi,
  restorePageVersionApi,
} from "@/lib/pages-api";
import { pageKey, pagesKey } from "@/lib/use-pages-query";
import { PageEditor } from "@/components/pages/page-editor";
import { PageActivity } from "@/components/pages/page-activity";
import { useAuth } from "@/lib/auth-context";
import type { PageVersion } from "@/lib/pages";

/** La durée de conservation annoncée, la même que la corbeille (30 jours). */
const RETENTION_DAYS = 30;

export function PageHistorySheet({
  projectId,
  pageId,
  open,
  onOpenChange,
  onRestored,
}: {
  projectId: string;
  pageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * La page vient d'être réécrite : l'éditeur ouvert derrière tient un document
   * et une `version` désormais périmés, et tiptap ne relit pas son `content`.
   * L'appelant remonte donc la surface (cf. page-view.tsx).
   */
  onRestored: () => void;
}) {
  const t = useTranslations("Pages");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"versions" | "activity">("versions");

  // Rouvrir le panneau repart de la liste, et de l'onglet des versions : ni la
  // version qu'on regardait la fois d'avant ni l'onglet où on l'avait laissé
  // n'ont de raison d'être ce qu'on vient chercher.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setTab("versions");
    }
  }, [open]);

  const versions = useQuery({
    queryKey: ["page-versions", pageId],
    queryFn: () => fetchPageVersionsApi(projectId, pageId),
    enabled: open,
    // L'historique bouge à chaque écriture, la sienne comme celle d'un autre :
    // on le redemande à chaque ouverture plutôt que de peindre un cache.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const preview = useQuery({
    queryKey: ["page-version", pageId, selected],
    queryFn: () => fetchPageVersionApi(projectId, pageId, selected as string),
    enabled: open && !!selected,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      restorePageVersionApi(projectId, pageId, versionId),
    onSuccess: () => {
      toast.success(t("historyRestored"));
      void queryClient.invalidateQueries({ queryKey: pageKey(pageId) });
      // La LISTE aussi : une restauration ramène le titre et l'icône de la
      // version, et c'est ce cache-là que lisent la sidebar, le fil d'Ariane,
      // le bloc sous-page — et le titre affiché en tête. Sans cette ligne, ils
      // gardent l'ancien nom cinq minutes (le `staleTime` du dépôt), sur une
      // page dont le corps, lui, a bien changé sous les yeux.
      void queryClient.invalidateQueries({ queryKey: pagesKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["page-versions", pageId] });
      onOpenChange(false);
      onRestored();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("historyRestoreFailed"));
    },
  });

  const rows = versions.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex !w-full flex-col gap-0 sm:!w-[92%] sm:!max-w-[900px]"
      >
        <SheetHeader className="shrink-0 border-b border-border pr-12">
          <SheetTitle>{t("historyTitle")}</SheetTitle>
          <SheetDescription>
            {t("historyDescription", { days: RETENTION_DAYS })}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "versions" | "activity")}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList className="mx-4 mt-3 w-fit shrink-0">
            <TabsTrigger value="versions">{t("historyTabVersions")}</TabsTrigger>
            <TabsTrigger value="activity">{t("historyTabActivity")}</TabsTrigger>
          </TabsList>

          <TabsContent value="versions" className="flex min-h-0 flex-1">
            {/* La LISTE tient la colonne étroite, et c'est elle qui répond à la
                question qu'on se pose en arrivant : qui a touché à ça, et quand. */}
            <div className="w-64 shrink-0 overflow-y-auto border-r border-border py-2">
              {versions.isPending ? (
                <div className="flex justify-center py-8">
                  <Spinner className="size-4 text-muted-foreground" />
                </div>
              ) : versions.error ? (
                <p className="px-3 py-6 text-xs text-muted-foreground">
                  {t("historyLoadFailed")}
                </p>
              ) : rows.length === 0 ? (
                // Une page qu'on vient de créer n'a rien derrière elle. Le dire
                // vaut mieux qu'une colonne vide qu'on prendrait pour une panne.
                <p className="px-3 py-6 text-xs text-muted-foreground">
                  {t("historyEmpty")}
                </p>
              ) : (
                rows.map((version) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    active={version.id === selected}
                    onSelect={() => setSelected(version.id)}
                    label={versionLabel(version, t, format)}
                  />
                ))
              )}
            </div>

            {/* L'APERÇU, en lecture seule. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!selected ? (
                <p className="px-6 py-10 text-sm text-muted-foreground">
                  {t("historyPickOne")}
                </p>
              ) : preview.isPending ? (
                <div className="flex justify-center py-10">
                  <Spinner className="size-5 text-muted-foreground" />
                </div>
              ) : preview.error || !preview.data ? (
                <p className="px-6 py-10 text-sm text-muted-foreground">
                  {t("historyLoadFailed")}
                </p>
              ) : (
                <div className="px-6 py-6">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-2xl font-semibold tracking-tight">
                        {preview.data.icon ? `${preview.data.icon} ` : ""}
                        {preview.data.title || t("untitled")}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {versionLabel(preview.data, t, format)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(preview.data.id)}
                    >
                      {restore.isPending ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      {t("historyRestore")}
                    </Button>
                  </div>
                  {/* `key` sur l'id : tiptap ne relit pas son `content`, donc
                      passer d'une version à l'autre demande un montage neuf. */}
                  <PageEditor
                    key={preview.data.id}
                    editable={false}
                    initialContent={(preview.data.content as JSONContent | null) ?? null}
                    onChange={() => {}}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* L'ACTIVITÉ (MIN-278) : les GESTES, là où l'onglet d'à côté rend les
              ÉTATS. `enabled` suit l'onglet — le journal ne part chercher ses
              lignes que quand on le regarde. */}
          <TabsContent
            value="activity"
            className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
          >
            <PageActivity
              projectId={projectId}
              pageId={pageId}
              currentUserId={user?.id ?? null}
              enabled={open && tab === "activity"}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/** « minddy · il y a 2 heures » — l'auteur, puis le quand. */
function versionLabel(
  version: PageVersion,
  t: ReturnType<typeof useTranslations<"Pages">>,
  format: ReturnType<typeof useFormatter>
): string {
  return t("historyBy", {
    name: version.author_name || t("someone"),
    time: format.relativeTime(new Date(version.created_at), new Date()),
  });
}

function VersionRow({
  version,
  active,
  label,
  onSelect,
}: {
  version: PageVersion;
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  const t = useTranslations("Pages");
  const agent = version.author_kind === "agent";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60"
      )}
    >
      <span className="flex w-full items-center gap-1.5">
        {/* La MARQUE de l'agent, à côté du nom : une écriture qu'on n'a pas vue
            passer doit se repérer d'un coup d'œil dans la colonne, sans lire. */}
        {agent ? (
          <Sparkles
            className="size-3 shrink-0 text-primary"
            aria-label={t("writtenByAgent")}
          />
        ) : null}
        <span className="truncate text-xs font-medium">{label}</span>
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {version.title || t("untitled")}
      </span>
    </button>
  );
}
