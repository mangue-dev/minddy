/**
 * The microphone, and nothing else (MIN-294).
 *
 * The shell refuses by default everything that the page requests from the system
 * (`ALLOWED_PERMISSIONS`, desktop/src/main.ts). Voice dictation — the button
 * microphone of Numo, of the “new ticket” dialog, of the notebook — goes through
 * `getUserMedia`, therefore through the permission `media`: as long as it was not in
 * the list, Electron answered no BEFORE macOS was consulted. Hence the
 * symptom, which didn't seem like it: "microphone refused, and no __
 * request window opened". There was no one to ask.
 *
 * `media` covers the camera AND the microphone, in the same permission. We cannot therefore
 * just open it: this module says what we agree to let
 * pass through — audio, from our origin, and that's it.
 *
 * PUR module: the decision is made and tested here; `desktop/src/main.ts` does not
 * just wire it to `setPermissionRequestHandler`, then ask macOS.
 */

import { navigationDecision } from "./nav-guard";

/** What Electron passes into `details` of a `media` request, reduced to what decides. */
export interface MediaAccessRequest {
  /** The origin of the requesting document — missing on some requests. */
  securityOrigin?: string;
  /** The last URL loaded by the requesting frame: the fallback of the origin. */
  requestingUrl?: string;
  /** `["audio"]` for a dictation; `["video"]` or both for a camera. */
  mediaTypes?: readonly ("audio" | "video")[];
}

/**
 * Do we let this request reach the Mac's microphone?
 *
 * Three conditions, and we need them all:
 *
 * - **Audio, and only audio.** A request that carries `video`, even
 * accompanied by `audio`, is refused altogether rather than flattened: minddy has
 * no camera, and a request that wants one does not come from minddy.
 * - **An explicit list.** `mediaTypes` absent or empty, it is a request dont
 * we don't know what it opens - we don't sign blank.
 * - **Our origin.** The window loads REMOTE code; the guard of
 * navigation prevents you from getting there, this prevents a document which would be there
 * even if it arrived (a frame, a page opened before an update of the
 * guard) from turning on the microphone.
 */
export function microphoneRequestAllowed(
  request: MediaAccessRequest,
  origin: string
): boolean {
  const types = request.mediaTypes;
  if (!types || types.length === 0) return false;
  if (!types.every((type) => type === "audio")) return false;

  const from = request.securityOrigin || request.requestingUrl;
  if (!from) return false;
  return navigationDecision(from, origin) === "allow";
}
