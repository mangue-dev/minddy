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
import { useTranslations } from "next-intl";
import { Spinner, toast } from "mangue-ui";
import type { Editor, JSONContent } from "@tiptap/react";

import { fetchPageApi, type UpdatePageInput } from "@/lib/pages-api";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { BLOCK_ID_ATTRIBUTE, PageEditor } from "@/components/pages/page-editor";
import { PageHeader } from "@/components/pages/page-header";
import type { PagesLookup } from "@/components/pages/pages-lookup";

/** Délai avant écriture, à compter de la dernière frappe. */
const SAVE_DELAY_MS = 1_000;

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

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    setSaving(true);
    try {
      await updatePage(pageId, patch);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [pageId, updatePage, t]);

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
    <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
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
        {/* Un état d'écriture discret, en bas du document : il rassure sans
            réclamer l'attention, et disparaît dès que c'est écrit. */}
        <p
          aria-live="polite"
          className="mt-8 h-4 text-xs text-muted-foreground/70"
        >
          {saving ? t("saving") : ""}
        </p>
      </div>
    </div>
  );
}
