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
// ─── LE MEUBLE est celui d'un ticket (MIN-282) ──────────────────────────────
//
// `SidePanel`, exactement comme le panneau d'un ticket : mêmes marges, même
// rayon, même ombre, même bascule en tiroir sous 480 px, et la même grammaire
// dedans — titre à gauche, croix ronde à droite, onglets soulignés pleine
// largeur, corps en `px-6` qui défile d'un bloc.
//
// Ce que ça a coûté, et c'est la seule chose que ce panneau perd : l'aperçu ne
// s'ouvre plus dans une SECONDE colonne à côté de la liste. Un panneau à deux
// volets de 900 px n'existait nulle part ailleurs dans l'application — c'était
// précisément le reproche. La version choisie se déplie donc SOUS sa ligne, avec
// son bouton de restauration, dans la même carte : le vocabulaire des fils de
// commentaires (carte bordée, séparateurs internes), qu'on lit partout ailleurs.
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

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  SidePanelTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
} from "mangue-ui";
import { ChevronDown, RotateCcw, X } from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";

import {
  fetchPageVersionApi,
  fetchPageVersionsApi,
  restorePageVersionApi,
} from "@/lib/pages-api";
import { pageKey, pagesKey } from "@/lib/use-pages-query";
import { PageEditor } from "@/components/pages/page-editor";
import { PageActivity, PageCommentBar } from "@/components/pages/page-activity";
import { McpAvatar, NumoAvatar } from "@/components/actor-avatars";
import { UserAvatar } from "@/components/user-avatar";
import { useMembersQuery } from "@/lib/use-members-query";
import type { Member } from "@/lib/types";
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
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Les MEMBRES, pour le visage des auteurs humains de l'historique : la graine
  // d'un avatar vit sur le membre, jamais sur la ligne de version (elle ne
  // porte qu'un id et un nom déjà résolu). Le même cache que partout ailleurs.
  const { members } = useMembersQuery(projectId, open);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"versions" | "activity">("activity");

  // Rouvrir le panneau repart de l'ACTIVITÉ, et sans version dépliée : ni celle
  // qu'on regardait la fois d'avant ni l'onglet où on l'avait laissé n'ont de
  // raison d'être ce qu'on vient chercher.
  //
  // L'activité d'abord parce que c'est la question courante — « qu'est-ce qui
  // s'est passé ici, qu'est-ce qui a été dit ? ». Les versions répondent à une
  // question plus rare et plus grave, celle d'après l'incident : « remets-moi
  // ça comme c'était ».
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setTab("activity");
    }
  }, [open]);

  const versions = useQuery({
    queryKey: ["page-versions", pageId],
    queryFn: () => fetchPageVersionsApi(projectId, pageId),
    // Comme le journal d'à côté : la liste ne part chercher ses lignes que
    // quand on la regarde. C'est l'ACTIVITÉ qui ouvre le panneau maintenant,
    // donc sans cette garde chaque ouverture paierait une requête pour un
    // onglet que personne n'a demandé.
    enabled: open && tab === "versions",
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
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent
        // Un peu plus large que le panneau d'un ticket (460 px) : ce qu'on lit
        // ici est un DOCUMENT, pas une description de trois lignes. Assez pour
        // que les titres et les listes du corps gardent leur air, assez étroit
        // pour rester une barre latérale.
        className="w-[min(560px,calc(100vw-2rem))]"
        // Le composeur de l'onglet Activité porte une suggestion de mention,
        // rendue en portail HORS du panneau : sans ça, choisir un nom dans la
        // liste comptait comme un clic dehors et refermait tout.
        onInteractOutside={keepOverlayOpenForPopper}
      >
        {/* En-tête, dans la grammaire du panneau d'un ticket : le titre à
            gauche, les boutons ronds à droite, et aucun trait — c'est la ligne
            des onglets qui sépare. */}
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
          <SidePanelTitle asChild>
            <span className="text-lg font-semibold tracking-tight">
              {t("activityTitle")}
            </span>
          </SidePanelTitle>
          <div className="-mr-1.5 flex items-center gap-0.5">
            <SidePanelClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tCommon("close")}
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                <X />
              </Button>
            </SidePanelClose>
          </div>
        </div>

        <SidePanelBody className="flex flex-col gap-4 pt-0">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "versions" | "activity")}
          >
            <TabsList variant="line" className="w-full justify-start p-0">
              <TabsTrigger value="activity">{t("historyTabActivity")}</TabsTrigger>
              <TabsTrigger value="versions">{t("historyTabVersions")}</TabsTrigger>
            </TabsList>

            {/* L'ACTIVITÉ (MIN-278) : les GESTES, là où l'onglet d'à côté rend
                les ÉTATS. `enabled` suit l'onglet — le journal ne part chercher
                ses lignes que quand on le regarde. */}
            <TabsContent value="activity" className="mt-4">
              <PageActivity
                projectId={projectId}
                pageId={pageId}
                currentUserId={user?.id ?? null}
                enabled={open && tab === "activity"}
              />
            </TabsContent>

            <TabsContent value="versions" className="mt-4 flex flex-col gap-3">
              {versions.isPending ? (
                <div className="flex justify-center py-8">
                  <Spinner className="size-4 text-muted-foreground" />
                </div>
              ) : versions.error ? (
                <p className="py-6 text-xs text-muted-foreground">
                  {t("historyLoadFailed")}
                </p>
              ) : rows.length === 0 ? (
                // Une page qu'on vient de créer n'a rien derrière elle. Le dire
                // vaut mieux qu'une colonne vide qu'on prendrait pour une panne.
                <p className="py-6 text-xs text-muted-foreground">
                  {t("historyEmpty")}
                </p>
              ) : (
                <>
                  <ol className="flex flex-col gap-2">
                    {rows.map((version) => (
                      <VersionCard
                        key={version.id}
                        version={version}
                        members={members}
                        label={versionLabel(version, t, format)}
                        open={version.id === selected}
                        onToggle={() =>
                          setSelected((current) =>
                            current === version.id ? null : version.id
                          )
                        }
                        preview={
                          version.id === selected
                            ? {
                                pending: preview.isPending,
                                failed: !!preview.error,
                                data: preview.data ?? null,
                              }
                            : null
                        }
                        restoring={restore.isPending}
                        onRestore={() => restore.mutate(version.id)}
                      />
                    ))}
                  </ol>
                  {/* La rétention se dit SOUS la liste, pas dans l'en-tête : ce
                      n'est pas ce qu'on vient chercher, c'est ce qu'on se
                      demande en arrivant au bout. */}
                  <p className="text-xs text-muted-foreground">
                    {t("historyDescription", { days: RETENTION_DAYS })}
                  </p>
                </>
              )}
            </TabsContent>

          </Tabs>
        </SidePanelBody>

        {/* Le composeur est FIXE, en pied de panneau — exactement comme celui
            d'un ticket. On écrit après avoir lu, donc après avoir fait défiler :
            un champ posé en bout de liste s'éloigne à mesure qu'on descend.
            Seulement sur l'onglet Activité : rien à commenter sur une liste de
            versions, et un champ inerte sous les yeux est une promesse fausse. */}
        {tab === "activity" && (
          <SidePanelFooter className="border-t-0 pt-3 sm:flex-row">
            <PageCommentBar projectId={projectId} pageId={pageId} />
          </SidePanelFooter>
        )}
      </SidePanelContent>
    </SidePanel>
  );
}

/**
 * LE VISAGE d'un auteur de version — le même vocabulaire que la timeline d'un
 * ticket, où l'on reconnaît déjà Numo, une clé MCP et un collègue sans lire.
 *
 * Trois cas, et l'ordre entre eux est la règle d'identité de minddy :
 *
 *  • une écriture d'AGENT DE CLÉ porte le logo de son agent — Claude Code,
 *    Cursor… — parce que c'est LUI qui a agi, jamais le porteur de la clé ;
 *  • toute autre écriture d'agent est celle de Numo, et porte son visage. C'est
 *    aussi le repli des versions d'avant MIN-282, qui n'ont pas gardé la clé ;
 *  • une écriture HUMAINE porte le portrait de son auteur, semé depuis le
 *    membre. Un auteur parti du projet n'a plus de graine à emprunter : son nom
 *    en fait une stable, comme dans la timeline.
 */
function VersionAvatar({
  version,
  members,
}: {
  version: PageVersion;
  members: Member[];
}) {
  const t = useTranslations("Pages");
  if (version.author_kind === "agent") {
    return (
      <span className="shrink-0" aria-label={t("writtenByAgent")}>
        {version.author_agent ? (
          <McpAvatar agent={version.author_agent} />
        ) : (
          <NumoAvatar />
        )}
      </span>
    );
  }
  const seed =
    (version.author_id
      ? members.find((m) => m.user_id === version.author_id)?.avatar_seed
      : null) ?? version.author_name;
  return <UserAvatar seed={seed} className="size-5 shrink-0" />;
}

/**
 * L'aperçu d'une version, BORNÉ en hauteur — une quinzaine de lignes, puis on
 * défile dedans.
 *
 * Sans ça, déplier une page de trois cents lignes déroule trois cents lignes
 * dans le panneau : la carte suivante part à des écrans de là, et la LISTE —
 * qui est ce qu'on est venu lire — disparaît. L'aperçu sert à reconnaître un
 * état, pas à le relire en entier ; pour ça il y a la page.
 *
 * Le DÉGRADÉ n'est pas une décoration : sans lui, la dernière ligne visible est
 * coupée net et rien ne distingue « le document s'arrête ici » de « il continue
 * plus bas ». Il ne paraît donc que quand il reste vraiment quelque chose à
 * lire, et s'efface une fois en bas.
 */
function PreviewScroller({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      // Une tolérance d'un pixel : les hauteurs fractionnaires d'un zoom
      // navigateur laissent sinon le dégradé allumé en bas de course.
      setMore(remaining > 1);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // L'éditeur se monte APRÈS ce rendu (`immediatelyRender: false`) : sans
    // observer, on mesurerait un conteneur encore vide et le dégradé
    // n'apparaîtrait jamais.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={box}
        className="scrollbar-quiet max-h-[22rem] overflow-y-auto overscroll-contain"
      >
        {children}
      </div>
      {more && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
        />
      )}
    </div>
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

/**
 * Une version, en CARTE — la même que celle d'un fil de commentaires : bordée,
 * fond de carte, séparateurs internes en `border-border/60`. Elle se déplie sur
 * l'aperçu de son document et le bouton qui le remet en place, plutôt que
 * d'envoyer le regard dans une seconde colonne.
 */
function VersionCard({
  version,
  members,
  label,
  open,
  onToggle,
  preview,
  restoring,
  onRestore,
}: {
  version: PageVersion;
  members: Member[];
  label: string;
  open: boolean;
  onToggle: () => void;
  /** L'aperçu de CETTE version — null tant qu'elle est repliée. */
  preview: { pending: boolean; failed: boolean; data: PageVersion | null } | null;
  restoring: boolean;
  onRestore: () => void;
}) {
  const t = useTranslations("Pages");

  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-colors",
        open ? "border-border" : "border-border/60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left outline-none"
      >
        <VersionAvatar version={version} members={members} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {version.title || t("untitled")}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 px-3.5 py-3">
          {preview?.pending ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4 text-muted-foreground" />
            </div>
          ) : preview?.failed || !preview?.data ? (
            <p className="py-4 text-sm text-muted-foreground">
              {t("historyLoadFailed")}
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate font-display text-lg font-semibold tracking-tight">
                  {preview.data.icon ? `${preview.data.icon} ` : ""}
                  {preview.data.title || t("untitled")}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={restoring}
                  onClick={onRestore}
                >
                  {restoring ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  {t("historyRestore")}
                </Button>
              </div>
              {/* `key` sur l'id : tiptap ne relit pas son `content`, donc passer
                  d'une version à l'autre demande un montage neuf. */}
              <PreviewScroller>
                <PageEditor
                  key={preview.data.id}
                  editable={false}
                  initialContent={(preview.data.content as JSONContent | null) ?? null}
                  onChange={() => {}}
                />
              </PreviewScroller>
            </>
          )}
        </div>
      )}
    </li>
  );
}
