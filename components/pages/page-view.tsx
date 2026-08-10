"use client";

// Une PAGE ouverte (MIN-270) : son en-tête, son corps, et ce qui les relie à la
// base.
//
// Ce composant se remonte à chaque changement de page (`key={pageId}` chez son
// appelant). C'est voulu : tiptap ne relit pas son `content` après le montage,
// et une page dont le corps changerait sous l'éditeur ne pourrait pas garder le
// curseur ni la pile d'annulation de toute façon.
//
// La SAUVEGARDE est ici volontairement simple — un PATCH groupé, une seconde
// après la dernière frappe. La sauvegarde versionnée (fusion par bloc, conflit
// entre deux onglets, `version`) est MIN-271 : elle remplacera `flush` ci-dessous
// sans toucher au reste de l'écran.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import {
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "mangue-ui";
import { Check } from "lucide-react";
import type { Editor, JSONContent } from "@tiptap/react";

import { eventKey } from "@/lib/keyboard/event-key";

import {
  fetchPageApi,
  updatePageOnUnload,
  type UpdatePageInput,
} from "@/lib/pages-api";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { BLOCK_ID_ATTRIBUTE, PageEditor } from "@/components/pages/page-editor";
import { PageHeader } from "@/components/pages/page-header";
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
function PageSaveState({
  saving,
  updatedAt,
}: {
  saving: boolean;
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={saving ? t("saving") : t("saved")}
          className="flex text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          {saving ? (
            <Spinner className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{saving ? t("saving") : when}</TooltipContent>
    </Tooltip>
  );
}

export function PageView({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const t = useTranslations("Pages");
  const { pages, byId, updatePage, createPage } = usePagesQuery(projectId);
  const { members } = useMembersQuery(projectId, true);
  const mentionSources = useDescriptionMentions(projectId, members);
  const mentions = useMemo(
    () => ({
      items: () => mentionSources.options,
      onQuery: mentionSources.onQuery,
    }),
    [mentionSources]
  );

  const { data: page, isPending, error } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => fetchPageApi(projectId, pageId),
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

  /* ── L'écriture, groupée ─────────────────────────────────────────────── */
  const pending = useRef<UpdatePageInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);

  /** Le brouillon en attente, retiré de la file — annule aussi le minuteur. */
  const takePending = useCallback((): UpdatePageInput | null => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    return patch;
  }, []);

  const flush = useCallback(async () => {
    const patch = takePending();
    if (!patch) return;
    setSaving(true);
    try {
      await updatePage(pageId, patch);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [pageId, updatePage, takePending, t]);

  const schedule = useCallback(
    (patch: UpdatePageInput) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

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
  const lookup = useMemo<PagesLookup>(
    () => ({
      get: (id) => {
        const row = pages.find((p) => p.id === id);
        return row ? { id: row.id, title: row.title, icon: row.icon } : undefined;
      },
      create: async () => {
        try {
          const child = await createPage({ parent_id: pageId });
          return child.id;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("createFailed"));
          return null;
        }
      },
    }),
    [pages, createPage, pageId, t]
  );

  /* ── L'ancre d'un bloc ───────────────────────────────────────────────── */
  const editorRef = useRef<Editor | null>(null);
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

  if (isPending || !page) {
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
      <div className="absolute top-3 right-3.5 z-10">
        <PageSaveState
          saving={saving}
          updatedAt={summary?.updated_at ?? page.updated_at}
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
        <div ref={bodyRef} className="mt-6">
          <PageEditor
            initialContent={(page.content as JSONContent | null) ?? null}
            onChange={(content) => schedule({ content })}
            pages={lookup}
            mentions={mentions}
            editorRef={editorRef}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
