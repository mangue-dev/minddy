"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { formatChangelogDate, mergeChangelogReleases } from "@/lib/changelog";
import type { ChangelogFeatureDetail, ChangelogLabels, ChangelogPageContent, ChangelogReleaseSummary } from "@/lib/changelog-types";
import { ChangelogFeatureCard } from "@/components/changelog-feature-card";
import styles from "./changelog-cards.module.css";

export function releaseAnchor(version: string) { return `v${version.replaceAll(".", "-")}`; }

async function load<T>(locale: Locale, query = ""): Promise<T> {
  const response = await fetch(`/api/changelog?locale=${encodeURIComponent(locale)}${query}`);
  if (!response.ok) throw new Error("Changelog request failed");
  return response.json();
}

/** The browser receives one locale and one page; details arrive only on opening. */
export function ChangelogEntries({ initial, locale, labels }: {
  initial?: ChangelogPageContent; locale: Locale; labels: ChangelogLabels;
}) {
  const [page, setPage] = useState<ChangelogPageContent | undefined>(initial);
  const [busy, setBusy] = useState(!initial);
  const [error, setError] = useState(false);
  const [reveal, setReveal] = useState<{ id: string; sequence: number } | null>(null);
  const requests = useRef(new Map<string, Promise<ChangelogFeatureDetail>>());
  const mounted = useRef(true);
  const pageRequest = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const fetchPage = useCallback(async (after?: string) => {
    const request = ++pageRequest.current;
    setBusy(true); setError(false);
    try {
      const result = await load<ChangelogPageContent>(locale, after ? `&after=${encodeURIComponent(after)}` : "");
      if (mounted.current && request === pageRequest.current) setPage(previous => ({ ...result, releases: after && previous
        ? mergeChangelogReleases(previous.releases, result.releases) : result.releases }));
    } catch { if (mounted.current && request === pageRequest.current) setError(true); }
    finally { if (mounted.current && request === pageRequest.current) setBusy(false); }
  }, [locale]);
  const fetchDetail = useCallback((id: string) => {
    if (!requests.current.has(id)) {
      const request = load<ChangelogFeatureDetail>(locale, `&feature=${encodeURIComponent(id)}`).catch(error => {
        if (requests.current.get(id) === request) requests.current.delete(id);
        throw error;
      });
      requests.current.set(id, request);
    }
    return requests.current.get(id)!;
  }, [locale]);

  useEffect(() => {
    pageRequest.current++;
    requests.current.clear();
    setReveal(null); setPage(initial); setError(false); setBusy(!initial);
    if (!initial) void fetchPage();
  }, [initial, fetchPage]);

  // Historical links load their release before opening the feature in its own card.
  useEffect(() => {
    let active = true;
    const appendRelease = (release: ChangelogReleaseSummary) => setPage(p => p ? ({ ...p,
      releases: mergeChangelogReleases(p.releases, [release]),
    }) : { releases: [release], next: null });
    const followAnchor = async () => {
      const anchor = window.location.hash.slice(1);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(anchor)) return;
      const version = /^v\d+-\d+-\d+$/.test(anchor) ? anchor.slice(1).replaceAll("-", ".") : null;
      try {
        if (version) {
          if (!document.getElementById(anchor)) {
            const release = await load<ChangelogReleaseSummary>(locale, `&version=${version}`);
            if (active) appendRelease(release);
            requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
          }
        } else {
          const feature = await fetchDetail(anchor);
          if (!document.getElementById(releaseAnchor(feature.version))) {
            const release = await load<ChangelogReleaseSummary>(locale, `&version=${feature.version}`);
            if (active) appendRelease(release);
          }
          if (active) setReveal(previous => ({ id: anchor, sequence: (previous?.sequence ?? 0) + 1 }));
        }
      } catch { /* Unknown historical anchors leave the readable release list in place. */ }
    };
    void followAnchor();
    window.addEventListener("hashchange", followAnchor);
    return () => { active = false; window.removeEventListener("hashchange", followAnchor); };
  }, [locale, fetchDetail]);

  return (
    <div>
      <ol className="space-y-14 sm:space-y-20">
        {page?.releases.map(release => (
          <li key={`${locale}:${release.version}`} id={releaseAnchor(release.version)} className={`${styles.release} scroll-mt-24`}>
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>v{release.version}</span><span aria-hidden>•</span>
              <time dateTime={release.publishedAt}>{formatChangelogDate(release.publishedAt.slice(0, 10), locale)}</time>
            </div>
            <h2 className={release.layout === "compact" ? "mb-2 text-lg font-medium tracking-tight" : "mb-3 max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl"}>{release.title}</h2>
            <p className={release.layout === "compact" ? "max-w-2xl text-sm leading-relaxed text-muted-foreground" : "mb-7 max-w-2xl leading-relaxed text-pretty text-muted-foreground"}>{release.summary}</p>
            <div className={release.layout === "compact" ? "mt-3 border-b border-border pb-4" : styles.masonry}>
              {release.features.map(feature => <ChangelogFeatureCard
                key={feature.id} feature={feature} labels={labels} compact={release.layout === "compact"}
                loadDetail={fetchDetail} reveal={reveal?.id === feature.id ? reveal.sequence : undefined}
              />)}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-col items-center gap-3" aria-live="polite">
        {busy && <p className="text-sm text-muted-foreground" role="status">{labels.loading}</p>}
        {error && <p className="text-sm text-muted-foreground" role="alert">{labels.error}</p>}
        {(page?.next || error) && <button type="button" disabled={busy} onClick={() => void fetchPage(page?.next ?? undefined)} className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50">
          {error ? labels.retry : labels.more}
        </button>}
      </div>
    </div>
  );
}
