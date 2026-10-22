"use client";

// Attachments as mentions (MIN-742): what a surface's own text can cite with
// `@`, and nothing beyond it.
//
// A ticket's description and plan cite the ticket's attachments, a comment
// cites its own, a creation dialog the ones added in it. The scope is the
// surface: the `@` menu offers only its attachments, and a resource pill
// resolves only from them (components/typed-mention-chip.tsx). A mention of
// another ticket's attachment therefore reads as unavailable.
//
// The surface's mention model is extended rather than rebuilt: the people,
// tickets, objectives and pages it already offers stay as they are.

import { useMemo } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import type { ResourceLike } from "@/components/resources";
import { attachmentPreviewKind } from "@/lib/attachment-preview";
import { openResourcePreview } from "@/lib/resource-preview";
import {
  attachmentFileUrl,
  pageResourceHref,
  resourceDisplayName,
} from "@/lib/resource-links";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { MentionLinks } from "@/components/mention-links";
import type { MentionOption } from "@/components/mention-suggest";

/** A resource a surface can offer: saved, or landed in a composer. */
export type MentionableResource = ResourceLike & { id: string };

/** A resource mention shows exactly what the resource's chip shows. */
export const resourceMentionLabel = resourceDisplayName;

/**
 * Where a resource mention leads: the link itself, the page in the app, or
 * the file through the authenticated proxy. `null` for what cannot open (a
 * trashed page, a file still uploading).
 */
export function resourceMentionHref(resource: ResourceLike): string | null {
  if (resource.kind === "link") return resource.url ?? null;
  if (resource.kind === "page") {
    return resource.page && resource.page_id && resource.project_id
      ? pageResourceHref(resource.project_id, resource.page_id)
      : null;
  }
  return resource.storage_path ? attachmentFileUrl(resource.storage_path) : null;
}

/** The `@` menu entries for a surface's resources. */
export function resourceMentionOptions(resources: readonly MentionableResource[]): MentionOption[] {
  return resources
    .filter((resource) => resourceMentionLabel(resource).trim())
    .map((resource) => ({
      type: "resource" as const,
      id: resource.id,
      label: resourceMentionLabel(resource),
      mime: resource.kind === "link"
        ? "text/uri-list"
        : resource.kind === "page"
          ? "application/vnd.minddy.page"
          : resource.mime_type ?? null,
      iconUrl: resource.kind === "link" ? resource.icon_data_url ?? null : null,
      icon: resource.kind === "page" ? resource.page?.icon ?? null : null,
    }));
}

/**
 * The surface's mention model, with its own resources added: offered in the
 * menu after the people, labeled and opened from this list alone.
 */
export function useResourceMentions<T extends DocumentEditorMentions | undefined>(
  base: T,
  resources: readonly ResourceLike[] | null | undefined,
): T {
  const router = useAppRouter();
  const mentionable = useMemo(
    () => (resources ?? []).filter((resource): resource is MentionableResource => !!resource.id),
    [resources],
  );
  // The editor rebuilds its extensions when this model changes identity, so
  // it follows what a chip shows, not every new array of the same rows.
  const signature = mentionable
    .map((resource) => [
      resource.id,
      resourceMentionLabel(resource),
      resourceMentionHref(resource) ?? "",
      resource.mime_type ?? "",
      resource.icon_data_url ?? resource.page?.icon ?? "",
    ].join("\u0000"))
    .join("\u0001");

  return useMemo((): T => {
    if (!base || mentionable.length === 0) return base;
    const byId = new Map(mentionable.map((resource) => [resource.id, resource]));
    const extra = resourceMentionOptions(mentionable);
    const firstOther = base.options.findIndex((option) => option.type !== "member");
    const at = firstOther === -1 ? base.options.length : firstOther;
    const options = [...base.options.slice(0, at), ...extra, ...base.options.slice(at)];

    const inner = base.links;
    const links: MentionLinks = {
      href: (type, id) => {
        if (type !== "resource") return inner?.href(type, id) ?? null;
        const resource = byId.get(id);
        return resource ? resourceMentionHref(resource) : null;
      },
      issueStatus: (id) => inner?.issueStatus(id) ?? null,
      issueTitle: (id) => inner?.issueTitle?.(id) ?? null,
      label: (type, id) => {
        if (type !== "resource") return inner?.label?.(type, id) ?? null;
        const resource = byId.get(id);
        return resource ? resourceMentionLabel(resource) : null;
      },
      navigate: (type, id) => {
        if (type !== "resource") {
          inner?.navigate(type, id);
          return;
        }
        const resource = byId.get(id);
        const href = resource ? resourceMentionHref(resource) : null;
        if (!resource || !href) return;
        // A page stays in the app and a link opens beside it. A file opens
        // the same reader as its card, over the text being read; a format the
        // reader cannot show downloads, as its card does.
        if (resource.kind === "page") router.push(href);
        else if (resource.kind === "link") window.open(href, "_blank", "noopener,noreferrer");
        else if (resource.storage_path && attachmentPreviewKind(resource.mime_type ?? "", resource.file_name)) {
          openResourcePreview({
            file_name: resource.file_name,
            storage_path: resource.storage_path,
            mime_type: resource.mime_type,
          });
        } else if (resource.storage_path) {
          window.location.assign(attachmentFileUrl(resource.storage_path, true));
        }
      },
    };
    return { ...base, options, links } as T;
    // `signature` stands for `mentionable`'s content: a new array of the same
    // rows must not rebuild the editor.
  }, [base, signature, router]);
}
