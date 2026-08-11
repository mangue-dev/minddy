"use client";

// Une PAGE ouverte (MIN-270) : son en-tête, son corps, et ce qui les relie à la
// base.
//
// Ce composant se remonte à chaque changement de page (`key={pageId}` chez son
// appelant). C'est voulu : tiptap ne relit pas son `content` après le montage,
// et une page dont le corps changerait sous l'éditeur ne pourrait pas garder le
// curseur ni la pile d'annulation de toute façon.
//
// La SAUVEGARDE est VERSIONNÉE (MIN-271) : chaque écriture du corps dit sur
// quelle `version` elle s'appuie, le serveur refuse si la page a bougé, et le
// refus se résout par une fusion bloc par bloc plutôt que par un choix. Toute
// cette mécanique vit dans `usePageAutosave` — ici on ne fait que la brancher,
// l'afficher (l'état d'enregistrement, le bandeau de conflit) et lui donner
// l'éditeur, seule surface capable d'adopter un document fusionné.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Check, TriangleAlert } from "lucide-react";
import type { Editor, JSONContent } from "@tiptap/react";

import { eventKey } from "@/lib/keyboard/event-key";

import { fetchPageApi, updatePageOnUnload } from "@/lib/pages-api";
import { ancestorsOf, descendantIds } from "@/lib/pages";
import { pageKey, usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useAuth } from "@/lib/auth-context";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { BLOCK_ID_ATTRIBUTE, PageEditor } from "@/components/pages/page-editor";
import { PageHeader } from "@/components/pages/page-header";
import { PageTaskSurface } from "@/components/pages/page-task-surface";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { PageBreadcrumb } from "@/components/pages/page-breadcrumb";
import { PageConflictBanner } from "@/components/pages/page-conflict-banner";
import { PagePresence, usePresentOn } from "@/components/pages/page-presence";
import {
  usePageAutosave,
  type PageSaveState,
} from "@/components/pages/use-page-autosave";
import type { PagesLookup } from "@/components/pages/pages-lookup";

/** Délai avant écriture, à compter de la dernière frappe. */
const SAVE_DELAY_MS = 1_000;

/**
 * L'état d'enregistrement, en bout de la ligne d'icône — même grammaire que le
 * carnet : une roue pendant l'écriture, une coche le reste du temps, et le
 * « quand » réservé à l'infobulle.
 *
 * Une icône plutôt qu'un mot, parce que c'est une information qu'on cherche
 * (« est-ce parti ? ») et non une qu'on doit lire : un texte qui apparaît et
 * disparaît en haut d'un document attire l'œil à chaque frappe, exactement au
 * moment où on écrit.
 */
function PageSaveIndicator({
  state,
  updatedAt,
}: {
  state: PageSaveState;
  updatedAt: string | null;
}) {
  const t = useTranslations("Pages");
  const format = useFormatter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const at = updatedAt ? new Date(updatedAt).getTime() : NaN;
  // Sous la minute, le formateur relatif compte les secondes à voix haute
  // (« enregistré il y a 4 secondes »), ce qui est plus bavard que le silence.
  const when =
    !Number.isFinite(at) || now - at < 60_000
      ? t("savedJustNow")
      : t("savedAgo", { time: format.relativeTime(at, now) });

  // Le conflit reste dans cette même icône, et ne devient pas une quatrième
  // chose à lire : la page EST enregistrée — c'est le bandeau, juste au-dessus
  // du document, qui porte ce qu'il y a à décider.
  const label =
    state === "saving"
      ? t("saving")
      : state === "conflict"
        ? t("savedWithConflict")
        : t("saved");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={label}
          className={cn(
            "flex transition-colors",
            state === "conflict"
              ? "text-amber-600 dark:text-amber-500"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          {state === "saving" ? (
            <Spinner className="size-3.5" />
          ) : state === "conflict" ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{state === "saved" ? when : label}</TooltipContent>
    </Tooltip>
  );
}

/** Un corps vide, ou qui ne porte qu'un paragraphe vide — ce que rend une page
    qu'on vient de créer, quel que soit le chemin par lequel on l'a créée. */
function isEmptyDoc(content: unknown): boolean {
  const blocks = (content as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0] as { type?: string; content?: unknown[] };
  return only?.type === "paragraph" && !only.content?.length;
}

export function PageView({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const t = useTranslations("Pages");
  const { user } = useAuth();
  const {
    pages,
    byId,
    loading: pagesLoading,
    updatePage,
    createPage,
    duplicatePage,
    trashPage,
    restorePage,
  } = usePagesQuery(projectId);
  const pagesLoaded = !pagesLoading;
  const { members } = useMembersQuery(projectId, true);
  const present = usePresentOn(pageId);
  const mentionSources = useDescriptionMentions(projectId, members);
  const mentions = useMemo(
    () => ({
      items: () => mentionSources.options,
      onQuery: mentionSources.onQuery,
    }),
    [mentionSources]
  );

  // `refetchOnMount: "always"` : l'éditeur ne lit son document qu'au montage,
  // donc ce cache-là n'a pas droit à la fenêtre de fraîcheur des autres. Sans
  // ça, revenir sur une page moins de cinq minutes après l'avoir quittée la
  // rouvrait sur le corps du premier chargement — un coéquipier, Numo, ou un
  // autre onglet a pu écrire depuis, et rien ne serait allé le demander.
  const {
    data: page,
    isPending,
    isFetchedAfterMount,
    error,
  } = useQuery({
    queryKey: pageKey(pageId),
    queryFn: () => fetchPageApi(projectId, pageId),
    refetchOnMount: "always",
  });

  // La ligne de la LISTE est la source du titre et de l'icône affichés : c'est
  // elle que la sidebar, le fil d'Ariane et le bloc sous-page lisent, et les
  // trois doivent bouger dès la première lettre tapée ici.
  //
  // Dès qu'on a tapé, en revanche, c'est CE composant qui fait foi. Sans cela,
  // la réponse d'un PATCH parti une seconde plus tôt réécrit dans le champ le
  // titre d'AVANT les dernières lettres — une frappe rapide se voyait revenir
  // en arrière à chaque enregistrement.
  const summary = byId.get(pageId);
  const [edited, setEdited] = useState<{
    title?: string;
    icon?: string | null;
  }>({});
  const title = edited.title ?? summary?.title ?? page?.title ?? "";
  const icon =
    edited.icon !== undefined ? edited.icon : (summary?.icon ?? page?.icon ?? null);

  /* ── L'écriture, groupée et VERSIONNÉE (MIN-271) ──────────────────────── */
  const editorRef = useRef<Editor | null>(null);
  const onSaveError = useCallback(
    (err: unknown) => {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    },
    [t]
  );
  const autosave = usePageAutosave({
    pageId,
    page,
    // La `version` qui sert de garde-fou ne se prend PAS dans le cache : elle
    // n'a de sens que venue du serveur, et de ce montage-ci.
    fresh: isFetchedAfterMount,
    delayMs: SAVE_DELAY_MS,
    save: updatePage,
    editorRef,
    onError: onSaveError,
  });
  const { schedule, flush, takePending } = autosave;

  // Quitter la page ÉCRIT ce qui restait : sans ça, taper puis cliquer aussitôt
  // sur une autre page de l'arbre perd la dernière seconde de frappe.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), [pageId]);

  // L'onglet qui s'en va (rafraîchissement, fermeture, navigation externe).
  //
  // `pagehide` est le seul événement sur lequel on puisse compter — `beforeunload`
  // ne se déclenche pas toujours sur mobile, et à ce moment-là un `fetch`
  // ordinaire meurt avec le document. D'où l'écriture `keepalive`, qui part
  // sans qu'on l'attende : sans elle, la dernière seconde de frappe était
  // perdue et la page rouvrait sur sa version d'avant.
  //
  // `visibilitychange` complète le tableau : passer sur un autre onglet écrit
  // tout de suite, par un PATCH normal, plutôt que de laisser le brouillon
  // attendre un retour qui peut ne jamais venir.
  useEffect(() => {
    const onHide = () => {
      const patch = takePending();
      if (patch) updatePageOnUnload(projectId, pageId, patch);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectId, pageId, takePending]);

  // ⌘S / Ctrl+S écrit maintenant, comme dans le carnet. L'enregistrement est
  // déjà automatique : ce que le geste apporte n'est pas la sauvegarde, c'est
  // de la VOIR — le réflexe est trop ancré pour qu'on laisse le navigateur
  // répondre à sa place par sa boîte « enregistrer la page ».
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        eventKey(event) === "s"
      ) {
        event.preventDefault();
        void flushRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /* ── Les sous-pages du corps (MIN-272) ───────────────────────────────── */
  //
  // La même information est portée à deux endroits : `parent_id` en base, et le
  // bloc `subpage` dans ce document. La colonne fait la vérité, le bloc en est
  // une vue — et c'est ici que la vue redescend sur la vérité.
  const router = useRouter();
  const base = `/projects/${projectId}/pages`;

  const lookup = useMemo<PagesLookup>(
    () => ({
      ready: pagesLoaded,
      get: (id) => {
        const row = byId.get(id);
        return row ? { id: row.id, title: row.title, icon: row.icon } : undefined;
      },
      href: (id) => `${base}/${id}`,
      navigate: (id) => router.push(`${base}/${id}`),
      create: async () => {
        try {
          const child = await createPage({ parent_id: pageId });
          return child.id;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("createFailed"));
          return null;
        }
      },
      opened: (id) => {
        // Le bloc vient d'être posé dans CE document : on l'écrit AVANT de
        // partir. Sans ce `flush`, la navigation démonte l'éditeur avec, dans
        // le brouillon, un bloc que personne n'a encore enregistré — la
        // sous-page existe, son lien dans le parent non.
        void flushRef.current().finally(() => router.push(`${base}/${id}`));
      },
      duplicate: async (id) => {
        try {
          const copy = await duplicatePage(id);
          toast.success(t("duplicated"));
          return copy.id;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("duplicateFailed"));
          return null;
        }
      },
      restore: async (id) => {
        try {
          await restorePage(id);
          toast.success(t("restored"));
          return true;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("restoreFailed"));
          return false;
        }
      },
    }),
    [pagesLoaded, byId, base, createPage, duplicatePage, pageId, restorePage, router, t]
  );

  /* ── Supprimer le bloc met la page à la corbeille ─────────────────────── */
  //
  // Le comportement de Notion, retenu délibérément contre « détacher » : quand
  // on supprime le lien vers une sous-page, c'est le plus souvent qu'on veut
  // supprimer la sous-page. La laisser vivre la ferait survivre dans une
  // sidebar qu'on ne regarde pas tout le temps, sans jamais qu'on le voie.
  //
  // Ce qui rend ce choix tenable, c'est la corbeille : rien n'est détruit,
  // tout revient pendant 30 jours (MIN-266). Et ce qui le rend honnête, c'est
  // que la confirmation annonce le compte RÉEL — la page qu'on voit et tous ses
  // descendants, qui partent avec elle sans être à l'écran.
  const [pendingTrash, setPendingTrash] = useState<string[] | null>(null);
  const pendingCount = useMemo(() => {
    if (!pendingTrash) return 0;
    const gone = new Set<string>();
    for (const id of pendingTrash) {
      gone.add(id);
      for (const child of descendantIds(pages, id)) gone.add(child);
    }
    return gone.size;
  }, [pendingTrash, pages]);

  const onSubpagesRemoved = useCallback(
    (ids: string[]) => {
      // Un bloc ORPHELIN qu'on efface ne demande rien à personne : sa page
      // n'est déjà plus là, il n'y a que du texte à retirer.
      const live = ids.filter((id) => byId.has(id));
      if (live.length === 0) return;
      setPendingTrash(live);
    },
    [byId]
  );

  // Confirmer ferme la boîte, et Radix annonce toute fermeture de la même
  // façon. Sans cette marque, le « oui » repasserait par le chemin du « non »
  // et défairait la suppression qu'on vient d'accepter.
  const decided = useRef(false);

  const cancelTrash = useCallback(() => {
    setPendingTrash(null);
    // Le bloc est DÉJÀ parti du document quand la question se pose : la
    // détection constate une suppression, elle ne l'intercepte pas (il y a une
    // douzaine de façons de supprimer un bloc, et les intercepter une par une
    // c'est en oublier). Annuler, c'est donc défaire — et la boîte étant
    // modale, le geste défait est bien le dernier.
    editorRef.current?.commands.undo();
  }, []);

  const confirmTrash = useCallback(() => {
    const ids = pendingTrash;
    decided.current = true;
    setPendingTrash(null);
    if (!ids) return;
    void (async () => {
      try {
        let trashed = 0;
        for (const id of ids) trashed += await trashPage(id);
        toast.success(
          trashed > 1
            ? t("trashedWithChildren", { count: trashed })
            : t("trashedOne")
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("deleteFailed"));
      }
    })();
  }, [pendingTrash, trashPage, t]);

  /* ── Le chemin jusqu'ici ─────────────────────────────────────────────── */
  //
  // `ancestorsOf` remonte du plus proche à la racine ; le fil d'Ariane se lit
  // dans l'autre sens. Il est vide sur une page racine, et le composant ne rend
  // alors rien du tout.
  const trail = useMemo(
    () => ancestorsOf(pages, pageId).reverse(),
    [pages, pageId]
  );

  /* ── Ce que Numo voit quand on est sur cette page ─────────────────────── */
  //
  // La page ouverte devient le contexte ambiant de l'assistant (MIN-273) : « fais
  // des tickets de cette page », « corrige ce paragraphe » se résolvent alors
  // sans qu'on ait à la nommer, et Numo a les outils pour la lire et l'écrire.
  //
  // Le titre part avec l'id : la pilule le dit sans relire la page, et le prompt
  // peut la nommer avant le premier appel d'outil. C'est le titre AFFICHÉ, donc
  // celui qu'on vient peut-être de taper.
  useAssistantContext(
    useMemo(
      () => ({ projectId, pageId, pageTitle: title, pageIcon: icon }),
      [projectId, pageId, title, icon]
    )
  );

  /* ── L'ancre d'un bloc ───────────────────────────────────────────────── */
  const bodyRef = useRef<HTMLDivElement>(null);
  const loaded = !!page;
  useEffect(() => {
    if (!loaded) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    // Après la peinture : le bloc visé n'existe dans le DOM qu'une fois le
    // document monté par tiptap, ce qui arrive un cran après la réponse.
    const handle = requestAnimationFrame(() => {
      const target = bodyRef.current?.querySelector<HTMLElement>(
        `[data-${BLOCK_ID_ATTRIBUTE}="${CSS.escape(id)}"]`
      );
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      // Le surlignage se retire tout seul : il dit « c'est ce bloc-là », il
      // n'est pas une sélection et ne doit pas survivre à la lecture.
      target.classList.add("page-block-target");
      setTimeout(() => target.classList.remove("page-block-target"), 2_000);
    });
    return () => cancelAnimationFrame(handle);
  }, [loaded, pageId]);

  if (error) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        {error instanceof Error ? error.message : t("loadFailed")}
      </p>
    );
  }

  // On attend la réponse de CE montage, et pas seulement « une » donnée.
  //
  // C'est la contrepartie du modèle : tiptap ne relit jamais son `content`, donc
  // le document sur lequel l'éditeur se monte est celui qu'il gardera à l'écran
  // jusqu'au démontage. Peindre d'abord le cache — le réflexe partout ailleurs
  // dans l'app, et ce que fait la réhydratation depuis le disque au
  // rechargement — mettait à l'écran un corps périmé que la réponse arrivée un
  // instant plus tard ne pouvait plus corriger. D'où l'attente : sur un
  // document, un instant de squelette vaut mieux qu'une version d'avant
  // affichée avec l'aplomb de la bonne.
  if (isPending || !page || !isFetchedAfterMount) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      {/* L'état d'enregistrement est épinglé au COIN de la surface, hors du
          flux et hors du défilement : il reste au même endroit quand on
          descend dans le document, et ne pousse rien. Même place que dans le
          carnet, à ceci près qu'il est à droite — la gauche est occupée par la
          barre secondaire. */}
      {/* Les avatars des autres lecteurs voisinent l'état d'enregistrement, et
          c'est le bon endroit : les deux répondent à la même question — « où en
          est ce document, et suis-je seul dessus ? ». */}
      {/* Le CHEMIN, à l'opposé de l'état d'enregistrement : les deux sont
          épinglés hors du flux et hors du défilement, et se partagent la même
          ligne. Il ne paraît que sur une sous-page — voir page-breadcrumb.tsx. */}
      <div className="absolute top-3 left-3.5 z-10 flex min-w-0 max-w-[calc(100%-9rem)] items-center">
        <PageBreadcrumb trail={trail} hrefFor={(id) => `${base}/${id}`} />
      </div>

      <div className="absolute top-3 right-3.5 z-10 flex items-center gap-2.5">
        <PagePresence
          userIds={present}
          members={members}
          meId={user?.id ?? null}
        />
        <PageSaveIndicator
          state={autosave.state}
          updatedAt={autosave.savedAt ?? summary?.updated_at ?? page.updated_at}
        />
      </div>

      <div className="scrollbar-quiet h-full overflow-y-auto">
      {/* La COLONNE du document. Elle porte deux choses, et elle est la seule à
          pouvoir les porter ensemble : la réserve de GOUTTIÈRE à gauche (56 px,
          la largeur exacte de la poignée et du `+`) et le positionnement dont
          le chrome se sert pour s'y placer. Titre et blocs partagent donc le
          même bord gauche, et la marge du survol tombe dans la réserve au lieu
          de décaler le corps sous le titre. */}
      <div className="relative mx-auto w-full max-w-3xl px-6 py-10 md:pl-24 md:pr-10">
        <PageHeader
          title={title}
          icon={icon}
          // Une page NEUVE — sans nom et sans contenu — met le curseur dans son
          // titre. Le test porte sur ce que la page EST, et pas sur la façon
          // dont on y est arrivé : c'est vrai qu'on vienne du `/page` du corps
          // du parent, du `+` de la sidebar ou du menu d'une ligne de l'arbre,
          // et ça évite de faire voyager un « je viens d'être créée » à travers
          // trois composants et une navigation.
          autoFocus={!title && isEmptyDoc(page.content)}
          onTitleChange={(next) => {
            setEdited((current) => ({ ...current, title: next }));
            schedule({ title: next });
          }}
          onIconChange={(next) => {
            setEdited((current) => ({ ...current, icon: next }));
            schedule({ icon: next });
            void flush();
          }}
          onEnter={() => editorRef.current?.commands.focus("start")}
        />
        {/* Entre le titre et le corps : au-dessus du document, parce que c'est
            du document qu'il parle, et dans le flux, parce qu'un écrasement
            silencieux est exactement ce qu'on refuse — il ne se ferme qu'au
            geste de son lecteur. */}
        <PageConflictBanner
          conflicts={autosave.conflicts}
          onRestore={autosave.restore}
          onDismiss={autosave.dismiss}
        />
        <div ref={bodyRef} className="mt-6">
          {/* Ce que « confier une tâche » veut dire quand elle sort d'une page
              plutôt que du carnet : le prompt nomme la page, et la navigation
              attend que ce qui est en attente soit écrit (MIN-274). */}
          <PageTaskSurface pageTitle={title} flush={flush}>
            <PageEditor
              initialContent={(page.content as JSONContent | null) ?? null}
              onChange={(content) => schedule({ content })}
              pages={lookup}
              mentions={mentions}
              editorRef={editorRef}
              onSubpagesRemoved={onSubpagesRemoved}
            />
          </PageTaskSurface>
        </div>
      </div>
      </div>

      {/* Le compte annoncé est le compte RÉEL : la page qu'on voit disparaître
          plus tous ses descendants, qui partent avec elle sans être à l'écran.
          Dire « cette page » quand cinq s'en vont, c'est faire de la corbeille
          une surprise plutôt qu'un filet. */}
      <AlertDialog
        open={pendingTrash !== null}
        onOpenChange={(open) => {
          if (open) return;
          if (decided.current) {
            decided.current = false;
            return;
          }
          cancelTrash();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("subpageDeleteTitle", { count: pendingCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("subpageDeleteBody", { count: pendingCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("subpageDeleteCancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmTrash}>
              {t("subpageDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
