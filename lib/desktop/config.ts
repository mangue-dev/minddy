/**
 * The constants that the desktop app and the web share (MIN-291).
 *
 * PUR module, without `electron` and without React: it is read by the main process
 * (bundled by scripts/build-desktop.mjs), by the preload, by the renderer, and
 * by the server-side callback route. This is exactly why it lives in
 * `lib/` and not `desktop/src/` — see desktop/README.md.
 */

/**
 * The development origin, or `null` — `MINDDY_DESKTOP_ORIGIN`.
 *
 * It only exists to develop against `localhost`: the signed app never reads an
 * origin from its environment. Installed users can choose a server through the
 * validated native picker, and that explicit choice is stored in `userData`.
 *
 * When it is installed, it wins on EVERYTHING, channel included: on `localhost` there
 * is neither stable nor preview, there is only one dev server.
 */
export const DESKTOP_ORIGIN_OVERRIDE: string | null =
  process.env.MINDDY_DESKTOP_ORIGIN?.trim() || null;

/**
 * The origin of the STABLE channel — the one that the window loads by default.
 *
 * The channel is chosen at runtime: see lib/desktop/channel.ts.
 */
export const DESKTOP_STABLE_ORIGIN: string =
  process.env.MINDDY_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
  "https://www.minddy.app";

/**
 * The origin of the PREVIEW channel — branch deployment `main` (MIN-352).
 *
 * Hard, like its neighbor, and for the same reason. This is not a separate
 * environment: it is the SAME Supabase project (same accounts, same
 * data, same public keys), served by the last commit of `main` instead of
 * of the last one promoted to production. Hence the fact that you can switch to it without losing anything — the only thing that doesn't follow is cookies, which are par
 * origin.
 */
export const DESKTOP_PREVIEW_ORIGIN = "https://preview.minddy.app";

/**
 * The DEFAULT origin of the window — the dev if requested, the stable otherwise.
 *
 * ⚠ This is not necessarily the one that the window loads: the channel chosen by the
 * person lives in the main process (`desktop/src/channel-store.ts`) and se
 * resolves to `desktopOriginForChannel`. This constant remains the starting point, and what surfaces that do not have a channel read (the help menu link, for example).
 */
export const DESKTOP_ORIGIN: string = DESKTOP_ORIGIN_OVERRIDE ?? DESKTOP_STABLE_ORIGIN;

/** The URL scheme that macOS assigns to us (`minddy://auth?code=…`). */
/**
 * The screen through which the window enters — **never the root**.
 *
 * `/` serves the argument, and the argument is addressed to someone who has not yet decided: in an installed app, this person does not exist not.
 * `/home` slices by itself, without an extra byte of logic here: the proxy y
 * returns to `/login` when the session is missing, and returns the app when it is
 * there. Aiming `/login` directly would cause the login screen to flash under the
 * eyes of someone who is already logged in.
 */
export const DESKTOP_ENTRY_PATH = "/home";

/**
 * The name of the app, and it is not decorative: **it is what names the folder
 * of data**. `app.getPath("userData")` derives from it, and this is where the
 * session, caches and — above all — the worktrees of the local agent will live (§4.3 of
 * framing: `~/Library/Application Support/minddy/…`).
 *
 * Hence the fact of putting it NOW, before there are installations:
 * changing it later would move everyone's folder, and you would have to
 * write a migration for a simple rename.
 *
 * What it does NOT fix: the name in the menu bar and the dock icon,
 * read in the `Info.plist` of the bundle. These are set by
 * `desktop/electron-builder.yml` (MIN-292), therefore by PACKAGING — hence the
 * causes macOS to display “Electron” in development, and this is normal.
 */
export const DESKTOP_APP_NAME = "minddy";

/** The signed identifier of the macOS bundle (`appId` in electron-builder.yml). */
export const DESKTOP_BUNDLE_ID = "app.minddy.desktop";

/** The URL scheme that macOS assigns to us (`minddy://auth?code=…`). */
export const DESKTOP_PROTOCOL = "minddy";

/** Returns protocol URLs delivered as command-line arguments on Linux. */
export function desktopProtocolArguments(argv: readonly string[]): string[] {
  return argv.filter((argument) =>
    argument.toLowerCase().startsWith(`${DESKTOP_PROTOCOL}:`)
  );
}

/** The host of the authentication deep link: `minddy://auth`. */
export const DESKTOP_AUTH_HOST = "auth";

/**
 * The host of the RETURN deep link: `minddy://open?next=…` (MIN-293).
 *
 * It returns the window to a page of the app from the system browser —
 * today the end of a Stripe payment, tomorrow any round trip of the same
 * kind. See lib/desktop/open-link.ts.
 */
export const DESKTOP_OPEN_HOST = "open";

/**
 * The bounce page that the system browser goes through to reopen the app.
 *
 * It exists because a third party can NOT bounce us back to `minddy://`:
 * Stripe (like any serious service) only accepts an http(s) URL in return.
 * So we give it this one, and it is she who calls the schema.
 */
export const DESKTOP_RETURN_PATH = "/desktop/return";

/**
 * The marker that the `redirectTo` of an authentication request carries when
 * it comes from the desktop app.
 *
 * It is in the URL and not in the user agent, and it is not a shortcut: the
 * browser that returns about `/auth/callback` is the SYSTEM browser, not
 * our window. Its user agent says nothing about us, and never will.
 */
export const DESKTOP_CALLBACK_FLAG = "desktop";

/**
 * The TURN marker, in the same URL (MIN-345).
 *
 * macOS delivers to the app everything that carries our schema, whatever it is
 * the origin: a `minddy://auth?code=…` received from the system connected the window
 * without anything connecting this link to a request from the app. The nonce leaves with
 * the request, passes through the provider and returns to the deep link, where the window
 * compares it to the one it kept. Without a match, the link is ignored.
 */
export const DESKTOP_TURN_PARAM = "turn";

/**
 * The user agent suffix of the window — `…Chrome/… minddy-desktop/1.0.0`.
 *
 * It is not used for ANY decision of the app (those read the presence of the bridge,
 * cf. lib/desktop/bridge.ts): it is used for the logs server and analytics
 * can distinguish the app from the browser without having to send them another
 * thing.
 */
export function desktopUserAgentSuffix(version: string): string {
  return `minddy-desktop/${version}`;
}

/**
 * The suffix placed on a user agent — **only once**.
 *
 * Measured in a real window: Electron's default user agent ALREADY has
 * `<nom de l'app>/<version>`, in the middle of the chain, just before `Chrome/…`.
 * Since the app is called `minddy-desktop`, naively adding the suffix makes it
 * appear twice — once in the middle, once at the end. It's not
 * serious, it's just wrong, and it shows in every log line.
 */
export function withDesktopUserAgent(userAgent: string, version: string): string {
  const suffix = desktopUserAgentSuffix(version);
  return userAgent.includes(suffix) ? userAgent : `${userAgent} ${suffix}`;
}
