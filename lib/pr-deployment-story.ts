/**
 * The deployment story a PR card tells, made STICKY (MIN-548 review).
 *
 * The forge reads its deployment in one shot per fetch: a read that comes
 * back empty (a provider that stamps nothing while the environment builds,
 * a transient API hiccup) would otherwise tear the card down mid-build and
 * rebuild it a poll later. The card must hold its ground instead: a story
 * once seen stays on screen until the forge contradicts it — a running card
 * settles, a settled card keeps its duration, and nothing flickers to
 * "gone" in between.
 */
export interface PrDeploymentStory {
  status: "success" | "in_progress";
  /** Where the environment serves — the newest settled deployment. */
  url: string | null;
  /** Created date of the build in flight, while the story is running. */
  startedAt: string | null;
  /** Settled duration, frozen — never recomputed again. */
  durationMs: number | null;
}

/** What one fetch of the forge reported, `null` = nothing usable this time. */
export interface PrDeploymentReport {
  status: "success" | "in_progress";
  url: string | null;
  startedAt: string | null;
  durationMs: number | null;
}

/**
 * Folds one report into the story. `report` null (the forge went silent)
 * keeps the previous story — the card must not vanish while the
 * environment is being built. Same arguments again, same story back: the
 * caller can fold on every render.
 */
export function mergeDeploymentStory(
  prev: PrDeploymentStory | null,
  report: PrDeploymentReport | null,
  now: number,
): PrDeploymentStory | null {
  if (!report) return prev;

  if (report.status === "in_progress") {
    return {
      status: "in_progress",
      // The button keeps pointing at what already SERVES, even when this
      // poll could not resolve a destination of its own.
      url: report.url ?? prev?.url ?? null,
      startedAt: report.startedAt ?? prev?.startedAt ?? null,
      durationMs: null,
    };
  }

  // The forge settled the environment. Its duration wins; when it did not
  // date the settle, the clock the running card was ticking from freezes
  // at the moment the settle was first seen.
  let durationMs = report.durationMs ?? prev?.durationMs ?? null;
  if (durationMs == null) {
    const from = Date.parse(report.startedAt ?? prev?.startedAt ?? "");
    if (Number.isFinite(from) && now >= from) durationMs = now - from;
  }
  return {
    status: "success",
    url: report.url ?? prev?.url ?? null,
    startedAt: null,
    durationMs,
  };
}
