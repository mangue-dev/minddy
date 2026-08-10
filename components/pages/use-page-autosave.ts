"use client";

// L'ENREGISTREMENT d'une page (MIN-271) — débouncé, versionné, fusionné.
//
// Trois choses, et elles tiennent ensemble :
//
//  1. **Une seule écriture en vol.** Ce qui est tapé pendant qu'une requête
//     voyage n'ouvre pas une deuxième requête : il attend son tour dans
//     `pending`, et repart dès que la première est revenue. Deux PATCH
//     concurrents sur le même corps arriveraient dans un ordre que personne ne
//     contrôle, et le plus ancien gagnerait une fois sur deux.
//
//  2. **La version voyage avec le corps.** Chaque écriture dit sur quoi elle
//     s'appuie ; le serveur refuse (409) si la page a bougé depuis, au lieu
//     d'écraser. C'est tout le garde-fou, et il ne coûte qu'un entier.
//
//  3. **Le refus se résout par une fusion, pas par un choix.** Le 409 rapporte
//     le document du serveur : on le fusionne bloc par bloc avec celui de
//     l'écran (`lib/pages-merge.ts`), on adopte le résultat dans l'éditeur, et
//     on REJOUE l'écriture sur la nouvelle version. Ce qu'on ne sait pas
//     fusionner — un bloc que les deux ont écrit — ne se tranche pas en
//     silence : il ressort dans `conflicts`, et l'écran le dit.
//
// Ce qui n'est PAS ici : le temps réel. Une page ne se met pas à jour toute
// seule sous les yeux de son lecteur ; on n'apprend l'écriture de l'autre qu'au
// moment d'enregistrer la sienne. C'est le cadrage de MIN-271, et la porte
// laissée ouverte est `prosemirror-collab`, qui se poserait sur exactement ce
// compteur de version.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";

import {
  PageConflictError,
  type UpdatePageInput,
} from "@/lib/pages-api";
import type { Page } from "@/lib/pages";
import {
  applyRestore,
  mergeDocs,
  type PageBlockConflict,
  type PageDocJSON,
} from "@/lib/pages-merge";

/** Ce que l'en-tête affiche. `conflict` survit à l'écriture qui l'a produit :
    la page EST enregistrée, mais un bloc a été remplacé et il faut le dire. */
export type PageSaveState = "saved" | "saving" | "conflict";

/**
 * Le nombre de rejeux consécutifs. Trois, parce qu'un rejeu ne rate que si un
 * TROISIÈME enregistrement est passé pendant la fusion — au-delà, insister
 * ferait tourner une boucle plutôt que converger. On garde alors le brouillon
 * en attente : la prochaine frappe (ou le prochain ⌘S) le renverra.
 */
const MAX_REPLAYS = 3;

export interface PageAutosave {
  state: PageSaveState;
  /** L'horodatage de la dernière écriture acceptée, pour l'infobulle. */
  savedAt: string | null;
  /** Les blocs qu'on a refusé de trancher. Vide = fusion muette. */
  conflicts: PageBlockConflict[];
  /** Empile un changement ; l'écriture part après le délai d'inactivité. */
  schedule: (patch: UpdatePageInput) => void;
  /** Écrit maintenant ce qui attend (⌘S, sortie de page, onglet caché). */
  flush: () => Promise<void>;
  /** Retire le brouillon de la file — l'écriture de la dernière chance
      (`pagehide`) doit l'emporter elle-même, sans passer par une promesse. */
  takePending: () => UpdatePageInput | null;
  /** Remet ma version d'un bloc contesté, et l'enregistre. */
  restore: (conflict: PageBlockConflict) => void;
  /** « J'ai vu » — le bandeau se referme, le document ne bouge pas. */
  dismiss: () => void;
}

export function usePageAutosave({
  pageId,
  page,
  fresh,
  delayMs,
  save,
  editorRef,
  onError,
}: {
  pageId: string;
  /** La page telle qu'elle a été lue : la BASE de la première écriture. */
  page: Page | undefined;
  /**
   * `page` vient-elle d'une lecture faite pendant CE montage ?
   *
   * Le compteur de version ne vaut que s'il est celui du serveur : le tenir
   * d'un cache, c'est fonder tout le garde-fou sur une donnée dont on ne sait
   * pas l'âge. `isFetchedAfterMount`, chez l'appelant.
   */
  fresh: boolean;
  delayMs: number;
  /** L'écriture elle-même — `usePagesQuery.updatePage`, qui patche aussi
      l'arbre. Elle lève `PageConflictError` sur un refus de version. */
  save: (pageId: string, input: UpdatePageInput) => Promise<Page>;
  editorRef: React.MutableRefObject<Editor | null>;
  onError: (error: unknown) => void;
}): PageAutosave {
  /** La dernière version SERVEUR connue : son corps et son compteur. C'est la
      base de la fusion, et elle avance à chaque écriture acceptée. */
  const base = useRef<{ content: PageDocJSON | null; version: number }>({
    content: null,
    version: 0,
  });
  /** Ce que porte l'ÉCRAN, toujours à jour — la fusion travaille sur lui et non
      sur le corps parti dans la requête, qui a une seconde de retard. */
  const screen = useRef<PageDocJSON | null>(null);

  // La base est posée UNE fois par page, et SEULEMENT depuis une lecture faite
  // pendant ce montage (`fresh`). Les deux moitiés de cette phrase corrigent
  // chacune un 409 sur une page où personne d'autre n'écrit :
  //
  //  - une fois : un refetch qui repasserait par ici écraserait la version que
  //    les écritures ont fait avancer, et la sauvegarde suivante repartirait
  //    sur un compteur périmé ;
  //  - depuis une lecture fraîche : sinon on se cale sur la PREMIÈRE donnée
  //    venue, c'est-à-dire le cache — un instantané de localStorage vieux de
  //    plusieurs heures au rechargement. Le verrou ci-dessous figeait alors
  //    cette version périmée pour toute la session, et TOUTES les sauvegardes
  //    partaient en 409 (résolus en silence par la fusion, mais gratuits).
  const seeded = useRef<string | null>(null);
  const loaded = fresh && page?.id === pageId;
  useEffect(() => {
    if (!loaded || !page || seeded.current === pageId) return;
    seeded.current = pageId;
    base.current = {
      content: (page.content as PageDocJSON | null) ?? null,
      version: page.version,
    };
    screen.current = base.current.content;
  }, [loaded, page, pageId]);

  const pending = useRef<UpdatePageInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<PageBlockConflict[]>([]);

  const takePending = useCallback((): UpdatePageInput | null => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    // Une écriture de dernière chance part sur la version qu'on a en main :
    // sans elle, elle écraserait — avec elle, elle est simplement refusée.
    if (patch && patch.content !== undefined && patch.version === undefined) {
      return { ...patch, version: base.current.version };
    }
    return patch;
  }, []);

  /** Adopte un document venu d'ailleurs sans faire repartir l'autosave : le
      curseur est replacé où il était, autant que le nouveau document le
      permette — un conflit ne doit pas renvoyer le lecteur en haut de page. */
  const adopt = useCallback(
    (doc: PageDocJSON) => {
      screen.current = doc;
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) return;
      const at = editor.state.selection.from;
      editor.commands.setContent(doc as JSONContent, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.min(at, Math.max(0, max - 1)));
    },
    [editorRef]
  );

  const write = useCallback(async () => {
    if (inFlight.current) return; // la file est déjà servie
    let patch = takePending();
    if (!patch) return;

    inFlight.current = true;
    setSaving(true);
    try {
      // Une écriture, ses rejeux, puis ce qui a été tapé pendant — le tout
      // dans UNE boucle, donc jamais deux requêtes en vol.
      while (patch) {
        let replays = 0;
        let sent: UpdatePageInput | null = patch;
        while (sent) {
          const attempt: UpdatePageInput = sent;
          try {
            const saved = await save(pageId, attempt);
            if (attempt.content !== undefined) {
              base.current = {
                content: attempt.content as PageDocJSON,
                version: saved.version,
              };
            }
            setSavedAt(saved.updated_at);
            sent = null;
          } catch (err) {
            if (!(err instanceof PageConflictError) || replays >= MAX_REPLAYS) {
              // Un refus qu'on ne sait pas résoudre ne perd pas la frappe : le
              // brouillon retourne dans la file, la prochaine tentative le
              // reprendra.
              pending.current = { ...attempt, ...pending.current };
              throw err;
            }
            replays += 1;
            sent = resolve(err, attempt);
          }
        }
        patch = takePending();
      }
    } catch (err) {
      onError(err);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }

    /** Le 409 : fusionner, adopter, et dire ce qu'on n'a pas su fusionner. */
    function resolve(
      err: PageConflictError,
      sent: UpdatePageInput
    ): UpdatePageInput | null {
      const theirs = (err.page.content as PageDocJSON | null) ?? null;
      const mine = screen.current ?? (sent.content as PageDocJSON | null);
      const merged = mergeDocs(base.current.content, mine, theirs);

      base.current = { content: merged.doc, version: err.page.version };
      adopt(merged.doc);
      if (merged.conflicts.length > 0) {
        setConflicts((current) => [...current, ...merged.conflicts]);
      }
      setSavedAt(err.page.updated_at);

      // Rien à rendre au serveur : la fusion n'a retenu que ce qu'il porte
      // déjà. Les champs hors corps (titre, icône) repartent quand même — ils
      // n'ont pas été écrits, et ils ne se disputent avec personne.
      const { content: _content, version: _version, ...rest } = sent;
      if (!merged.changed) {
        return Object.keys(rest).length > 0 ? rest : null;
      }
      return { ...rest, content: merged.doc, version: err.page.version };
    }
  }, [pageId, save, takePending, adopt, onError]);

  const writeRef = useRef(write);
  writeRef.current = write;

  const flush = useCallback(async () => {
    await writeRef.current();
  }, []);

  const schedule = useCallback(
    (patch: UpdatePageInput) => {
      if (patch.content !== undefined) {
        screen.current = patch.content as PageDocJSON;
      }
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void writeRef.current(), delayMs);
    },
    [delayMs]
  );

  const restore = useCallback(
    (conflict: PageBlockConflict) => {
      const doc = applyRestore(
        screen.current ?? base.current.content ?? { type: "doc", content: [] },
        conflict,
        screen.current
      );
      adopt(doc);
      setConflicts((current) => current.filter((c) => c.id !== conflict.id));
      schedule({ content: doc });
      void writeRef.current();
    },
    [adopt, schedule]
  );

  const dismiss = useCallback(() => setConflicts([]), []);

  // Le minuteur ne survit pas au composant : une écriture programmée qui part
  // après le démontage écrirait sur une page qu'on ne regarde plus. La sortie
  // de page, elle, est écrite par l'appelant (`flush`) AVANT de démonter.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const state: PageSaveState = saving
    ? "saving"
    : conflicts.length > 0
      ? "conflict"
      : "saved";

  return useMemo(
    () => ({
      state,
      savedAt,
      conflicts,
      schedule,
      flush,
      takePending,
      restore,
      dismiss,
    }),
    [state, savedAt, conflicts, schedule, flush, takePending, restore, dismiss]
  );
}
