import "server-only";

import { zipSync, strToU8 } from "fflate";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { pageToMarkdownServer } from "@/lib/server/pages-projection";
import { descendantIds } from "@/lib/pages";
import {
  exportPagesToFiles,
  pageFileSlug,
  type ExportInputPage,
  type ExportedFile,
} from "@/lib/pages-export";

/**
 * L'export d'une page (MIN-283), côté serveur : lire, projeter, empaqueter.
 *
 * Rien de neuf n'est écrit ici sur la FORME du markdown — la projection est
 * celle de MIN-269, testée et bidirectionnelle, montée dans une fonction
 * serveur par `lib/server/pages-projection.ts`. Ce module ne fait que la
 * chaîner sur une branche et rendre le tout sous la forme qu'un navigateur sait
 * télécharger.
 *
 * La BRANCHE est bornée : une page et tous ses descendants, corbeille exclue.
 * Une page corbeillée n'est plus dans le wiki ; l'exporter ferait ressortir
 * dans un fichier ce que la corbeille a retiré de l'écran.
 */

export type PageExportResult =
  | { ok: true; fileName: string; contentType: string; body: Uint8Array }
  | { ok: false; status: number; errorKey: "pageNotFound" | "databaseError" };

/** Combien de corps de page une lecture ramène à la fois (MIN-348). */
const BODY_BATCH = 50;

interface PageRow {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content: unknown;
  position: string;
}

/**
 * Une page seule → un `.md`. Une branche → un `.zip`, un fichier par page.
 *
 * Le ZIP est produit SANS compression (`level: 0`) : ce sont des fichiers texte
 * de quelques kilo-octets, l'archive n'existe que pour porter une
 * arborescence, et une compression coûterait du CPU de fonction pour un gain
 * qu'aucun utilisateur ne voit.
 */
export async function exportPage({
  pageId,
  actorId,
  branch,
}: {
  pageId: string;
  actorId: string;
  branch: boolean;
}): Promise<PageExportResult> {
  const service = getServiceClient();
  const { data: root } = await service
    .from("pages")
    .select("id, project_id, parent_id, title, icon, content, position")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!root) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await getProjectAccess(actorId, root.project_id as string))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const rootRow = root as unknown as PageRow;
  if (!branch) {
    const markdown = await pageToMarkdownServer({
      title: rootRow.title,
      icon: rootRow.icon,
      content: (rootRow.content ?? null) as never,
    });
    return {
      ok: true,
      fileName: `${pageFileSlug(rootRow.title)}.md`,
      contentType: "text/markdown; charset=utf-8",
      body: strToU8(markdown),
    };
  }

  // Deux lectures, et c'est la borne du sujet (MIN-348). La première ne prend
  // que le SQUELETTE — de quoi savoir qui descend de qui —, parce que la
  // branche demandée peut être une page sur mille et qu'il n'y a aucune raison
  // de faire descendre le corps des neuf cent quatre-vingt-dix-neuf autres. La
  // seconde ne va chercher les corps que de la branche, et par lots : c'est
  // aussi ce qui borne la taille d'UNE réponse PostgREST.
  const { data: skeleton, error } = await service
    .from("pages")
    .select("id, parent_id, title, icon, position")
    .eq("project_id", root.project_id as string)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (error) {
    console.error("[pages-export] list failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const all = (skeleton ?? []) as unknown as Omit<PageRow, "content">[];
  const inBranch = new Set([rootRow.id, ...descendantIds(all, rootRow.id)]);
  const branchPages = all.filter((p) => inBranch.has(p.id));

  const bodies = new Map<string, unknown>([[rootRow.id, rootRow.content]]);
  for (let i = 0; i < branchPages.length; i += BODY_BATCH) {
    const ids = branchPages
      .slice(i, i + BODY_BATCH)
      .map((p) => p.id)
      .filter((id) => id !== rootRow.id);
    if (ids.length === 0) continue;
    const { data: rows, error: bodyError } = await service
      .from("pages")
      .select("id, content")
      .in("id", ids);
    if (bodyError) {
      console.error("[pages-export] bodies failed:", bodyError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    for (const row of (rows ?? []) as { id: string; content: unknown }[]) {
      bodies.set(row.id, row.content);
    }
  }

  const pages: ExportInputPage[] = [];
  for (const page of branchPages) {
    pages.push({
      id: page.id,
      // La racine de l'ARCHIVE est la page exportée : son parent réel n'a rien
      // à y faire, et le garder mettrait tous les fichiers un cran trop bas.
      parent_id: page.id === rootRow.id ? null : page.parent_id,
      title: page.title,
      icon: page.icon,
      markdown: await pageToMarkdownServer({
        title: page.title,
        icon: page.icon,
        content: (bodies.get(page.id) ?? null) as never,
      }),
    });
  }

  const files = exportPagesToFiles(pages);
  return {
    ok: true,
    fileName: `${pageFileSlug(rootRow.title)}.zip`,
    contentType: "application/zip",
    body: zipArchive(files),
  };
}

/** Les fichiers, empaquetés. Isolé pour que le test lise l'archive produite. */
export function zipArchive(files: ExportedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[file.path] = strToU8(file.markdown);
  return zipSync(entries, { level: 0 });
}
