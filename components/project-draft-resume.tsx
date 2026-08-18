"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { clearPendingDraftId, readPendingDraftId } from "@/lib/project-draft";

/**
 * Resumption of the creation wizard (MIN-62). GitHub installation / OAuth
 * GitLab leaves the page in full screen; the project does not yet exist, so
 * the callback returns to `/home?setup=git[&git=connected&connection=…]`.
 *
 * The draft is already in the base: `sessionStorage` only keeps the id, the
 * round trip time. This component (mounted once for the entire app, rendered
 * null) reads this pointer, finds the draft in the list and reopens the
 * wizard in the git step — repository selector open if the connection has been created.
 *
 * Without pointer (other tab, session lost) or without draft correspondent,
 * only the toast remains: nothing to reopen.
 */
export function ProjectDraftResume() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Settings");
  const { projectDrafts, resumeProjectDraft } = useProjects();

  // The id read on arrival. The resumption awaits the list of drafts — the
  // request may very well not have responded yet when the URL is cleaned.
  const [pending, setPending] = useState<{
    draftId: string;
    connectionId: string | null;
  } | null>(null);

  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get("setup") !== "git") return;
    handled.current = true;

    const status = searchParams.get("git");
    if (status === "connected") {
      toast.success(t("gitConnectedToast"));
    } else if (status === "error") {
      toast.error(t("gitConnectError"));
    }

    const draftId = readPendingDraftId();
    if (draftId) {
      setPending({
        draftId,
        connectionId: status === "connected" ? searchParams.get("connection") : null,
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    next.delete("git");
    next.delete("connection");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, t]);

  useEffect(() => {
    if (!pending) return;
    const draft = projectDrafts.find((d) => d.id === pending.draftId);
    // Not there yet: the list may be in flight. We will return to his response — and
    // if the draft has disappeared (deleted elsewhere), nothing will reopen, this
    // which is exactly what is needed.
    if (!draft) return;
    setPending(null);
    clearPendingDraftId();
    resumeProjectDraft(draft, pending.connectionId);
  }, [pending, projectDrafts, resumeProjectDraft]);

  return null;
}
