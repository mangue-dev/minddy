"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { formatChangelogDate } from "@/lib/changelog";
import type { ChangelogFeatureDetail, ChangelogFeatureSummary, ChangelogLabels, ChangelogPageContent, ChangelogReleaseSummary } from "@/lib/changelog-types";
import { ChangelogIllustration } from "@/components/changelog-illustration";

export function releaseAnchor(version: string) { return `v${version.replaceAll(".", "-")}`; }

async function load<T>(locale: Locale, query = ""): Promise<T> {
  const response = await fetch(`/api/changelog?locale=${encodeURIComponent(locale)}${query}`);
  if (!response.ok) throw new Error("Changelog request failed");
  return response.json();
}

/** The browser receives one locale and one page; details arrive only on selection. */
export function ChangelogEntries({ initial, locale, labels }: {
  initial?: ChangelogPageContent; locale: Locale; labels: ChangelogLabels;
}) {
  const [page, setPage] = useState<ChangelogPageContent | undefined>(initial);
  const [busy, setBusy] = useState(!initial);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ChangelogFeatureSummary | null>(null);
  const [detail, setDetail] = useState<ChangelogFeatureDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const requests = useRef(new Map<string, Promise<ChangelogFeatureDetail>>());
  const mounted = useRef(true);
  const pageRequest = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialog.current?.open) {
        // Handle the detail before an enclosing responsive dialog can dismiss.
        event.preventDefault(); event.stopPropagation();
        dialog.current.close(); setSelected(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, []);
  const fetchPage = useCallback(async (after?: string) => {
    const request = ++pageRequest.current;
    setBusy(true); setError(false);
    try {
      const result = await load<ChangelogPageContent>(locale, after ? `&after=${encodeURIComponent(after)}` : "");
      if (mounted.current && request === pageRequest.current) setPage(previous => ({ ...result, releases: after && previous
        ? [...previous.releases, ...result.releases.filter(r => !previous.releases.some(p => p.version === r.version))] : result.releases }));
    } catch { if (mounted.current && request === pageRequest.current) setError(true); }
    finally { if (mounted.current && request === pageRequest.current) setBusy(false); }
  }, [locale]);

  useEffect(() => {
    pageRequest.current++;
    requests.current.clear();
    dialog.current?.close();
    setSelected(null); setDetail(null); setPage(initial); setError(false);
    setBusy(!initial);
    if (!initial) void fetchPage();
  }, [initial, fetchPage]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetail(null); setDetailError(false);
    if (!requests.current.has(selected.id)) {
      requests.current.set(selected.id, load<ChangelogFeatureDetail>(locale, `&feature=${encodeURIComponent(selected.id)}`));
    }
    const request = requests.current.get(selected.id)!;
    request.then(result => { if (active) setDetail(result); })
      .catch(() => {
        if (requests.current.get(selected.id) === request) requests.current.delete(selected.id);
        if (active) setDetailError(true);
      });
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => { active = false; };
  }, [selected, locale]);

  // Historical feature and version links work even when the target is outside the first page.
  useEffect(() => {
    let active = true;
    const followAnchor = async () => {
      const anchor = window.location.hash.slice(1);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(anchor)) return;
      const version = /^v\d+-\d+-\d+$/.test(anchor) ? anchor.slice(1).replaceAll("-", ".") : null;
      try {
        if (version) {
          if (!document.getElementById(anchor)) {
            const release = await load<ChangelogReleaseSummary>(locale, `&version=${version}`);
            if (active) setPage(p => p ? ({ ...p, releases: [...p.releases.filter(r => r.version !== version), release] }) : { releases: [release], next: null });
            requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
          }
        } else {
          const feature = await load<ChangelogFeatureDetail>(locale, `&feature=${encodeURIComponent(anchor)}`);
          if (active) { requests.current.set(anchor, Promise.resolve(feature)); setSelected(feature); }
        }
      } catch { /* Unknown historical anchors leave the readable release list in place. */ }
    };
    void followAnchor();
    window.addEventListener("hashchange", followAnchor);
    return () => { active = false; window.removeEventListener("hashchange", followAnchor); };
  }, [locale]);

  const closeDetail = () => {
    dialog.current?.close();
    setSelected(null);
  };

  return (
    <div>
      <ol className="space-y-14 sm:space-y-20">
        {page?.releases.map(release => (
          <li key={release.version} id={releaseAnchor(release.version)} className="scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1 font-mono text-xs font-medium">v{release.version}</span>
              <time dateTime={release.publishedAt} className="text-xs text-muted-foreground">
                {formatChangelogDate(release.publishedAt.slice(0, 10), locale)}
              </time>
            </div>
            {release.layout === "compact" ? (
              <div className="border-b border-border pb-7">
                <h2 className="mb-2 text-lg font-medium tracking-tight">{release.title}</h2>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{release.summary}</p>
                {release.features.length > 0 && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  {release.features.map(feature => <button key={feature.id} type="button" onClick={() => setSelected(feature)} aria-haspopup="dialog" className="text-left text-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
                    {feature.title} <span aria-hidden>↗</span>
                  </button>)}
                </div>}
              </div>
            ) : (
              <>
                <h2 className="mb-3 max-w-2xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl">{release.title}</h2>
                <p className="mb-7 max-w-2xl leading-relaxed text-pretty text-muted-foreground">{release.summary}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {release.features.map((feature, index) => (
                    <button key={feature.id} type="button" onClick={() => setSelected(feature)}
                      aria-label={feature.title} aria-haspopup="dialog" className={`group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 ${index === 0 ? "sm:col-span-2" : ""}`}>
                      <div className={index === 0 ? "h-56 sm:h-64" : "h-44"}><ChangelogIllustration illustration={feature.illustration} /></div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="mb-2 text-lg leading-snug font-semibold tracking-tight text-balance">{feature.title}</h3>
                        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{feature.summary}</p>
                        <span className="mt-5 flex items-center gap-2 text-xs font-medium text-muted-foreground group-hover:text-foreground">{labels.details}<span aria-hidden className="ml-auto flex size-6 items-center justify-center rounded-full border border-border">+</span></span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
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
      {selected && (
        <dialog ref={dialog} data-changelog-detail aria-labelledby="changelog-detail-title"
          onKeyDown={event => {
            if (event.key !== "Tab") return;
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex='0']")];
            const target = event.shiftKey ? controls.at(-1) : controls[0];
            const boundary = event.shiftKey ? controls[0] : controls.at(-1);
            if (target && document.activeElement === boundary) { event.preventDefault(); target.focus(); }
          }}
          onCancel={event => { event.preventDefault(); closeDetail(); }} onClose={() => setSelected(null)}
          onClick={event => { if (event.target === event.currentTarget) closeDetail(); }}
          className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
          <div className="relative p-6 sm:p-8">
            <button type="button" autoFocus onClick={closeDetail} aria-label={labels.close} className="absolute top-4 right-4 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-background text-lg hover:bg-muted">×</button>
            <div className="mb-6 h-56"><ChangelogIllustration illustration={selected.illustration} /></div>
            {detail && <p className="mb-3 font-mono text-xs text-muted-foreground">v{detail.version}</p>}
            <h2 id="changelog-detail-title" className="mb-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{selected.title}</h2>
            {detail ? <div className="space-y-4 leading-relaxed text-pretty text-muted-foreground">{detail.details.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
              : detailError ? <div role="alert"><p>{labels.error}</p><button type="button" className="mt-3 underline underline-offset-4" onClick={() => setSelected({ ...selected })}>{labels.retry}</button></div>
                : <p role="status" className="text-muted-foreground">{labels.loading}</p>}
          </div>
        </dialog>
      )}
    </div>
  );
}
