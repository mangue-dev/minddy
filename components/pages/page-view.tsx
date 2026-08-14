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
  Button,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Check, MoreHorizontal, TriangleAlert } from "lucide-react";
import type { Editor, JSONContent } from "@tiptap/react";

import { eventKey } from "@/lib/keyboard/event-key";

import {
  discardPageOnUnload,
  fetchPageApi,
  updatePageOnUnload,
} from "@/lib/pages-api";
import {
  cancelDraftDiscard,
  forgetDraftPage,
  isDraftPage,
  scheduleDraftDiscard,
} from "@/lib/pages-draft";
import { ancestorsOf, descendantIds } from "@/lib/pages";
import { pageKey, usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { SITE_NAME } from "@/lib/site";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { PageEditor } from "@/components/pages/page-editor";
import { usePageUploads } from "@/components/pages/page-uploads";
import {
  focusDocumentStart,
  posOfBlockId,
  revealBlock,
} from "@/components/pages/block-actions";
import { PageHeader } from "@/components/pages/page-header";
import { IssueActionsMenu } from "@/components/issue-context-menu";
import { usePageDocumentMenu } from "@/components/pages/page-document-actions";
import { PageHistorySheet } from "@/components/pages/page-history";
import { PageTaskSurface } from "@/components/pages/page-task-surface";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { PageBreadcrumb } from "@/components/pages/page-breadcrumb";
import { PageBacklinks } from "@/components/pages/page-backlinks";
import { PageCommentLayer } from "@/components/pages/page-comment-layer";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";
import { PageConflictBanner } from "@/components/pages/page-conflict-banner";
import { PageToc } from "@/components/pages/page-toc";
import { PagePresence, usePresentOn } from "@/components/pages/page-presence";
import {
  usePageAutosave,
  type PageSaveState,
} from "@/components/pages/use-page-autosave";
import type { PagesLookup } from "@/components/pages/pages-lookup";

/** Délai avant écriture, à compter de la dernière frappe. */
const SAVE_DELAY_MS = 1_000;

/**
 * OÙ EN EST CE DOCUMENT — l'état d'enregistrement et le dernier auteur, en un
 * seul objet (MIN-282).
 *
 * Les deux répondaient à la même question depuis deux coins opposés de l'écran :
 * une coche en haut à droite (« c'est parti »), et « modifiée par Clément il y a
 * 2 jours » sous le titre. Rien ne les reliait, alors qu'on les lit dans le même
 * mouvement en arrivant sur une page — et la seconde poussait le corps d'une
 * ligne, sur toutes les pages, pour une information qu'on cherche une fois.
 *
 * Ce que la fusion garde du raisonnement d'origine : **ce qui clignote reste une
 * icône**. Le texte, lui, est stable — un nom et une date qui ne bougent pas à
 * la frappe —, donc il peut s'écrire. La roue d'enregistrement tourne à côté
 * sans rien déplacer.
 *
 * Et c'est un BOUTON : c'est en lisant « modifiée par quelqu'un d'autre » qu'on
 * se demande ce qui a changé, donc c'est de là que s'ouvre le panneau
 * d'activité. La question reste à côté de sa réponse.
 */
function PageStatus({
  state,
  updatedAt,
  lastEdit,
  onOpenHistory,
}: {
  state: PageSaveState;
  updatedAt: string | null;
  /** QUI a écrit en dernier, et quand. Absent tant que le nom n'est pas résolu :
      un nom qui change sous les yeux se lit comme une erreur. */
  lastEdit: { name: string; at: string } | null;
  onOpenHistory: () => void;
}) {
  const t = useTranslations("Pages");
  const format = useFormatter();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Les deux horodatages que cette ligne connaît. Ils sont le plus souvent le
  // MÊME instant — la dernière écriture est celle qu'on vient d'enregistrer —
  // mais pas toujours : une écriture venue d'ailleurs bouge `lastEdit` sans
  // qu'on ait rien enregistré. Les deux tirent l'horloge, ci-dessous.
  const at = updatedAt ? new Date(updatedAt).getTime() : NaN;
  const editedAt = lastEdit ? new Date(lastEdit.at).getTime() : NaN;
  /**
   * L'instant de RÉFÉRENCE des durées relatives, et il ne doit jamais être
   * dépassé par ce qu'il mesure.
   *
   * L'horloge ne bat que toutes les 15 secondes : entre deux battements, un
   * enregistrement qui vient d'aboutir porte un horodatage POSTÉRIEUR à elle, et
   * le formateur relatif dit alors « dans 1 seconde ». Le maximum le ramène à
   * « à l'instant », qui est ce qu'on vient de faire.
   */
  const now = Math.max(
    tick,
    Number.isFinite(at) ? at : 0,
    Number.isFinite(editedAt) ? editedAt : 0
  );
  // Le conflit reste dans cette même icône, et ne devient pas une quatrième
  // chose à lire : la page EST enregistrée — c'est le bandeau, juste au-dessus
  // du document, qui porte ce qu'il y a à décider.
  const label =
    state === "saving"
      ? t("saving")
      : state === "conflict"
        ? t("savedWithConflict")
        : t("saved");

  const edited = lastEdit
    ? t("lastEditedBy", {
        name: lastEdit.name,
        time: format.relativeTime(editedAt, now),
      })
    : null;

  return (
    <button
      type="button"
      onClick={onOpenHistory}
      // Le nom accessible ne dépend PAS du survol : le texte visible est caché
      // au repos, donc absent de l'arbre d'accessibilité. Les deux moitiés sont
      // reprises ici — l'état, puis qui a écrit —, et le texte à l'écran est
      // marqué décoratif pour ne pas être annoncé deux fois.
      aria-label={edited ? `${label} — ${edited}` : label}
      className={cn(
        "group flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // Le fond au survol fait deux choses d'un coup : il dit que ça se
        // clique, et il détache le texte qui se déplie de ce qu'il recouvre —
        // sur une surface étroite, il passe devant le fil d'Ariane.
        "hover:bg-muted",
        state === "conflict"
          ? "text-amber-600 dark:text-amber-500"
          : "text-muted-foreground/70 hover:text-foreground"
      )}
    >
      <span role="status" aria-label={label} className="flex shrink-0">
        {state === "saving" ? (
          <Spinner className="size-3.5" />
        ) : state === "conflict" ? (
          <TriangleAlert className="size-3.5" />
        ) : (
          <Check className="size-3.5" />
        )}
      </span>
      {/* Au REPOS, une coche et rien d'autre. Le nom et la date ne sont pas ce
          qu'on surveille en écrivant — c'est ce qu'on va CHERCHER, une fois, en
          arrivant sur une page qu'on n'a pas écrite. Ils se déplient donc au
          survol (et à la tabulation), là où l'œil est déjà. */}
      {edited ? (
        <span
          aria-hidden
          className="hidden max-w-[14rem] truncate group-hover:block group-focus-visible:block"
        >
          {edited}
        </span>
      ) : null}
    </button>
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

/**
 * La coquille qui rend la SURFACE remontable (MIN-277).
 *
 * Restaurer une version réécrit le corps et fait avancer la `version` : le
 * document affiché et le compteur sur lequel s'appuie l'enregistrement sont
 * alors tous les deux périmés, et tiptap ne relit pas son `content`. Plutôt que
 * de rattraper les deux à la main, on remonte — exactement ce que fait déjà une
 * navigation d'une page à l'autre.
 */
export function PageView({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const [reload, setReload] = useState(0);
  return (
    <PageSurface
      key={reload}
      projectId={projectId}
      pageId={pageId}
      onRestored={() => setReload((n) => n + 1)}
    />
  );
}

function PageSurface({
  projectId,
  pageId,
  onRestored,
}: {
  projectId: string;
  pageId: string;
  /** Une version vient d'être remise en place : la surface se remonte. */
  onRestored: () => void;
}) {
  const t = useTranslations("Pages");
  const { user } = useAuth();
  const {
    pages,
    byId,
    loading: pagesLoading,
    updatePage,
    previewPage,
    createPage,
    duplicatePage,
    trashPage,
    discardPage,
    restorePage,
  } = usePagesQuery(projectId);
  const pagesLoaded = !pagesLoading;
  const { members, loading: membersLoading } = useMembersQuery(projectId, true);
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

  /* ── Le titre et le corps, cousus au clavier ─────────────────────────── */
  //
  // Le titre est un champ à part, mais pour qui écrit c'est la ligne au-dessus
  // de la première ligne du corps : ⌫ au tout début du document et ↑ depuis sa
  // première ligne remontent en FIN de titre, ↓ depuis le titre redescend dans
  // le corps. La moitié « document » du passage vit dans title-bridge.ts ;
  // c'est ici qu'elle rejoint le champ, seul endroit qui tienne les deux.
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const focusTitleEnd = useCallback(() => {
    const field = titleFieldRef.current;
    if (!field) return;
    field.focus();
    // En FIN de titre, et pas là où le caret traînait : on arrive par la
    // gauche, comme on arriverait en bout de la ligne précédente.
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, []);

  /* ── L'écriture, groupée et VERSIONNÉE (MIN-271) ──────────────────────── */
  const editorRef = useRef<Editor | null>(null);
  // Les images et les fichiers collés ou lâchés dans le corps (MIN-280). Monté
  // ici, avec l'éditeur, parce que c'est ici que vivent le projet, la page et la
  // ref de l'éditeur — un envoi qui aboutit doit retrouver son bloc.
  const uploads = usePageUploads(projectId, pageId, editorRef);
  // ↓ DESCEND — le curseur va sur la première ligne du corps, telle qu'elle est.
  const focusBodyStart = useCallback(() => {
    editorRef.current?.commands.focus("start");
  }, []);
  // Entrée OUVRE une ligne, comme partout ailleurs dans le document : une ligne
  // vide en tête du corps, curseur dedans (cf. `focusDocumentStart`).
  const openBodyLine = useCallback(() => {
    const editor = editorRef.current;
    if (editor) focusDocumentStart(editor);
  }, []);
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

  /* ── Le départ : écrire, ou faire comme si de rien n'était ───────────────
     Quitter la page ÉCRIT ce qui restait — sans ça, taper puis cliquer aussitôt
     sur une autre page de l'arbre perd la dernière seconde de frappe.
     Sauf si la page est un BROUILLON resté vide (lib/pages-draft.ts) : elle
     vient d'être créée, on n'y a rien mis, et il ne doit rien en rester.
     Ce qu'on lit au démontage passe par des refs : à cet instant il n'y a plus
     de rendu, et l'éditeur peut déjà être démonté. */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const titleRef = useRef(title);
  titleRef.current = title;
  const iconRef = useRef(icon);
  iconRef.current = icon;
  const contentRef = useRef<unknown>(null);
  useEffect(() => {
    if (page) contentRef.current = page.content;
  }, [page]);
  const discardRef = useRef(discardPage);
  discardRef.current = discardPage;

  /** Rien n'a été écrit sur cette page depuis qu'on l'a créée. */
  const stillBlank = useCallback(
    () =>
      isDraftPage(pageId) &&
      !titleRef.current.trim() &&
      !iconRef.current &&
      isEmptyDoc(contentRef.current),
    [pageId]
  );
  const blankRef = useRef(stillBlank);
  blankRef.current = stillBlank;

  useEffect(() => {
    // On est là : rien de ce qui a été programmé au démontage précédent ne doit
    // aboutir. C'est ce qui rend la destruction sûre en Strict Mode, où React
    // démonte et remonte aussitôt (cf. lib/pages-draft.ts).
    cancelDraftDiscard(pageId);
    return () => {
      if (blankRef.current()) {
        scheduleDraftDiscard(pageId, () => void discardRef.current(pageId));
        return;
      }
      // Écrite : ce n'est plus un brouillon, et elle ne le redeviendra pas.
      forgetDraftPage(pageId);
      void flushRef.current();
    };
  }, [pageId]);

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
      // Même règle qu'au démontage : un brouillon vide ne part pas en base, il
      // s'efface. `takePending` n'est pas appelé — il n'y a rien à écrire.
      if (blankRef.current()) {
        forgetDraftPage(pageId);
        discardPageOnUnload(projectId, pageId);
        return;
      }
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

  /* ── Qui a écrit en dernier, et l'historique (MIN-277) ────────────────── */
  //
  // Sur un ticket, personne ne le demande ; sur de la doc, c'est la ligne qui
  // fait qu'on croit une page. Le nom sort des MEMBRES du projet, déjà chargés
  // pour les mentions et la présence — jamais de l'email brut (lib/display-name).
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastWriterId =
    summary?.updated_by ?? page?.updated_by ?? summary?.created_by ?? page?.created_by ?? null;
  const lastWriterKind = summary?.updated_kind ?? page?.updated_kind ?? "human";
  const lastEditName = useMemo(() => {
    // Une écriture d'agent porte l'id du compte qui l'a permise ; on ne le
    // montre pas — c'est toute la règle d'identité de minddy.
    if (lastWriterKind === "agent") return SITE_NAME;
    if (!lastWriterId) return null;
    // On attend les membres plutôt que d'écrire « Quelqu'un » une seconde puis
    // le vrai nom : un nom qui change sous les yeux se lit comme une erreur.
    if (membersLoading) return null;
    const member = members.find((m) => m.user_id === lastWriterId);
    // Parti du projet, ou compte supprimé : la DATE reste la moitié utile de la
    // ligne, et « Quelqu'un » ne prétend rien de faux.
    return (member && displayName(member, "")) || t("someone");
  }, [members, membersLoading, lastWriterId, lastWriterKind, t]);
  const lastEditAt =
    autosave.savedAt ?? summary?.updated_at ?? page?.updated_at ?? null;

  /* ── Le chemin jusqu'ici ─────────────────────────────────────────────── */
  //
  // `ancestorsOf` remonte du plus proche à la racine ; le fil d'Ariane se lit
  // dans l'autre sens. Il est vide sur une page racine, et le composant ne rend
  // alors rien du tout.
  const trail = useMemo(
    () => ancestorsOf(pages, pageId).reverse(),
    [pages, pageId]
  );

  /* ── Faire SORTIR cette page : publier, exporter (MIN-283) ────────────── */
  //
  // Les mêmes entrées que dans le menu ⋯ de la ligne d'arbre, écrites une
  // fois (components/pages/page-document-actions.tsx). Elles sont ICI aussi
  // parce que c'est en LISANT une page qu'on décide de l'envoyer à quelqu'un —
  // pas en la cherchant dans une colonne.
  const documentMenu = usePageDocumentMenu({ projectId, pages });
  const pageRef = useMemo(() => ({ id: pageId, title }), [pageId, title]);

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

  /* ── La table des matières flottante ─────────────────────────────────── */
  //
  // Elle a besoin de DEUX choses que le corps ne rend pas de lui-même :
  // l'instance de l'éditeur (pour lire les titres et les suivre à la frappe) et
  // le conteneur qui défile (pour savoir où l'on en est, et pour y aller).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  /* ── Commenter un passage (MIN-282) ───────────────────────────────────── */
  //
  // La bulle de sélection rend le bloc et l'extrait ; le calque ouvre dessus le
  // panneau du fil, à côté du bloc. L'état vit ICI parce qu'il relie deux
  // enfants qui ne se connaissent pas — l'éditeur et le calque.
  const [draftAnchor, setDraftAnchor] = useState<PageCommentAnchor | null>(null);
  const onComment = useCallback((anchor: PageCommentAnchor) => {
    setDraftAnchor(anchor);
  }, []);
  const clearDraftAnchor = useCallback(() => setDraftAnchor(null), []);

  /* ── L'ancre d'un bloc ───────────────────────────────────────────────── */
  /** Marge au-dessus du bloc visé par une ancre, une fois arrivé. */
  const ANCHOR_MARGIN = 96;
  const bodyRef = useRef<HTMLDivElement>(null);
  const loaded = !!page;
  useEffect(() => {
    if (!loaded) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    // Après la peinture : le bloc visé n'existe dans le DOM qu'une fois le
    // document monté par tiptap, ce qui arrive un cran après la réponse.
    let unflash: (() => void) | null = null;
    const handle = requestAnimationFrame(() => {
      const view = editor;
      const container = scrollRef.current;
      if (!view || !container) return;
      // L'ancre se résout dans le DOCUMENT, et non dans le DOM : le clignement
      // est une décoration ProseMirror, qui se pose sur une POSITION (cf.
      // block-flash.ts). Le geste est ensuite exactement celui de la table des
      // matières — un seul chemin, un seul endroit où se tromper.
      const pos = posOfBlockId(view, id);
      if (pos === null) return;
      unflash = revealBlock(view, container, pos, ANCHOR_MARGIN);
    });
    return () => {
      cancelAnimationFrame(handle);
      unflash?.();
    };
  }, [loaded, pageId, editor]);

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
      {/* La réserve de droite : l'état est une coche au repos et son texte ne
          se déplie qu'au survol, par-dessus, sur son propre fond (MIN-282) —
          plus le ⋯, qui ouvre la publication et l'export (MIN-283). */}
      <div className="absolute top-3 left-3.5 z-10 flex min-w-0 max-w-[calc(100%-11rem)] items-center">
        <PageBreadcrumb trail={trail} hrefFor={(id) => `${base}/${id}`} />
      </div>

      <div className="absolute top-3 right-3.5 z-10 flex items-center gap-1.5">
        <PagePresence userIds={present} members={members} />
        <PageStatus
          state={autosave.state}
          updatedAt={autosave.savedAt ?? summary?.updated_at ?? page.updated_at}
          lastEdit={
            lastEditName && lastEditAt
              ? { name: lastEditName, at: lastEditAt }
              : null
          }
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <IssueActionsMenu
          searchable={false}
          actions={documentMenu.actionsFor(pageRef)}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground/70 hover:text-foreground"
              aria-label={t("pageOptions")}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
      </div>
      {documentMenu.dialogs}

      {/* La table des matières flotte au bord droit du PANNEAU, donc hors du
          conteneur qui défile : elle reste à sa place pendant qu'on descend
          dans le document, et c'est le défilement qui la traverse. */}
      <PageToc editor={editor} scrollRef={scrollRef} />

      <div ref={scrollRef} className="scrollbar-quiet h-full overflow-y-auto">
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
            // La sidebar, le fil d'Ariane et le bloc sous-page lisent le cache
            // de la LISTE : sans cet écrit local, ils ne bougeaient qu'une
            // seconde plus tard, à l'enregistrement groupé — on tapait un titre
            // en regardant l'ancien dans la colonne de gauche.
            previewPage(pageId, { title: next });
            schedule({ title: next });
          }}
          onIconChange={(next) => {
            setEdited((current) => ({ ...current, icon: next }));
            previewPage(pageId, { icon: next });
            schedule({ icon: next });
            void flush();
          }}
          onEnter={openBodyLine}
          onDown={focusBodyStart}
          fieldRef={titleFieldRef}
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
          <PageTaskSurface
            projectId={projectId}
            pageTitle={title}
            flush={flush}
          >
            <PageEditor
              initialContent={(page.content as JSONContent | null) ?? null}
              onChange={(content) => {
                contentRef.current = content;
                schedule({ content });
              }}
              pages={lookup}
              uploads={uploads}
              mentions={mentions}
              mentionLinks={mentionSources.links}
              editorRef={editorRef}
              onEditor={setEditor}
              onSubpagesRemoved={onSubpagesRemoved}
              onLeaveTop={focusTitleEnd}
              onComment={onComment}
            />
          </PageTaskSurface>
        </div>
        {/* En pied du DOCUMENT, dans la même colonne que lui : « qui s'appuie
            sur cette page ? » se demande quand on a fini de la lire, pas dans
            un meuble qui prendrait de la largeur en permanence. Absent tant que
            personne ne cite la page (MIN-279). */}
        <PageBacklinks projectId={projectId} pageId={pageId} />
      </div>
      </div>

      {/* Le compte annoncé est le compte RÉEL : la page qu'on voit disparaître
          plus tous ses descendants, qui partent avec elle sans être à l'écran.
          Dire « cette page » quand cinq s'en vont, c'est faire de la corbeille
          une surprise plutôt qu'un filet. */}
      {/* L'historique, ouvert depuis la ligne « modifiée par » de l'en-tête —
          là où la question se pose. Monté seulement quand il est demandé : il
          tire un second éditeur avec lui. */}
      {historyOpen ? (
        <PageHistorySheet
          projectId={projectId}
          pageId={pageId}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onRestored={onRestored}
        />
      ) : null}

      {/* Les COMMENTAIRES (MIN-282), en calque : rien dans le flux du document.
          Le fil d'un bloc s'ouvre à côté de son bloc, celui de la page vit dans
          l'onglet « Activité » de l'historique. */}
      <PageCommentLayer
        projectId={projectId}
        pageId={pageId}
        editor={editor}
        members={members}
        currentUserId={user?.id ?? null}
        draftAnchor={draftAnchor}
        onDraftAnchorDone={clearDraftAnchor}
      />

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
