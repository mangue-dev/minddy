import { isDeepStrictEqual } from "node:util";

/** Bound the actual inactivity experiment before opening any fixture session. */
export function parseVerificationInactiveMs(value) {
  if (value === undefined) return 75_000;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("MINDDY_PERF_VERIFY_INACTIVE_MS must be an integer from 16000 to 300000");
  const duration = Number(value);
  if (!Number.isSafeInteger(duration) || duration < 16_000 || duration > 300_000)
    throw new Error("MINDDY_PERF_VERIFY_INACTIVE_MS must be an integer from 16000 to 300000");
  return duration;
}

/** A visible document can genuinely blur; never infer absence from a CDP command. */
export function verifiedFocusAbsence(before, away, current, requiredMs = 16_000) {
  return before?.focused === true && away?.focused === false && current?.focused === false &&
    Number.isSafeInteger(requiredMs) && requiredMs >= 16_000 && requiredMs <= 300_000 &&
    Number.isFinite(away.wallClock) && Number.isFinite(current.wallClock) && current.wallClock - away.wallClock >= requiredMs &&
    Number.isFinite(away.at) && Number.isFinite(current.at) && current.at - away.at >= requiredMs;
}

/** Never restore over an unrecognized concurrent focus-document edit. */
export function focusPageRestorationState(item, current) {
  if (current.version === item.original.version && isDeepStrictEqual(current, item.original)) return "unchanged";
  const immutable = ({ version: _version, content_revision: _revision, content: _content, updated_at: _at, updated_by: _by, updated_kind: _kind, updated_api_key_id: _key, ...rest }) => rest;
  if (!isDeepStrictEqual(immutable(current), immutable(item.original))) return "unexpected";
  const candidates = [...(item.restorationCandidates ?? []), ...(item.expectedMutatedContent ? [{
    version: item.expectedSavedVersion ?? item.expectedMutationBaseVersion + 1,
    contentRevision: item.expectedSavedContentRevision, content: item.expectedMutatedContent,
  }] : [])];
  if (candidates.some((candidate) => candidate.version === current.version && candidate.contentRevision === current.content_revision && isDeepStrictEqual(candidate.content, current.content))) return "owned-mutation";
  return "unexpected";
}

/** Serialized read-only probe: exact mounted body, usable editor and accepted version. */
export function verificationPageReady(spec) {
  const visible = (node) => !!node?.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') && getComputedStyle(node).visibility !== "hidden";
  if (location.pathname !== new URL(spec.href, location.origin).pathname ||
    !visible(document.querySelector(`[data-app-tab-id="${spec.id}"][aria-selected="true"]`))) return false;
  const surface = document.querySelector(`[data-page-surface-id="${spec.pageId}"]`);
  const editor = surface?.querySelector('.tiptap[contenteditable="true"]');
  const body = window.__restoredVerify.client?.getQueryData(["page", spec.pageId]);
  return visible(surface) && visible(editor) && body?.id === spec.pageId && body.project_id === spec.projectId && body.version === spec.version &&
    editor.querySelectorAll(':scope > h2').length === 8 && editor.querySelectorAll(':scope > p').length === 72 &&
    [...surface.querySelectorAll('h1, textarea')].some((node) => visible(node) && (node.value ?? node.textContent).trim() === spec.title) &&
    (editor.innerText ?? editor.textContent).includes(spec.text) && JSON.stringify(body.content).includes(spec.text);
}
