import {
  DESKTOP_SHELL_CSP,
  desktopShellBrandHtml,
  desktopShellStyles,
} from "@/lib/desktop/shell-ui";

const ERR_ABORTED = -3;

export interface DesktopServerLoadFailure {
  errorCode: number;
  isMainFrame: boolean;
  validatedUrl: string;
}

/** Returns true only when the active minddy document genuinely failed to load. */
export function isDesktopServerUnavailable(
  failure: DesktopServerLoadFailure,
  activeOrigin: string,
): boolean {
  if (!failure.isMainFrame || failure.errorCode === ERR_ABORTED) return false;
  try {
    return new URL(failure.validatedUrl).origin === new URL(activeOrigin).origin;
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function retryUrlForOrigin(activeOrigin: string, attemptedUrl: string): string {
  const origin = new URL(activeOrigin).origin;
  try {
    const attempted = new URL(attemptedUrl);
    return attempted.origin === origin ? attempted.href : `${origin}/home`;
  } catch {
    return `${origin}/home`;
  }
}

/** Builds the local document shown when the configured minddy server cannot load. */
export function desktopServerUnavailableHtml(
  activeOrigin: string,
  attemptedUrl: string,
  interFontDataUrl?: string,
): string {
  const server = new URL(activeOrigin);
  const displayOrigin = server.origin;
  const serverName = server.host;
  const retryUrl = retryUrlForOrigin(activeOrigin, attemptedUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${DESKTOP_SHELL_CSP}">
    <meta name="color-scheme" content="light dark">
    <title>minddy server unavailable</title>
    <style>
      ${desktopShellStyles(interFontDataUrl)}
      body { min-height: 100vh; display: grid; place-items: center; }
      main { width: min(100% - 48px, 540px); text-align: center; }
      .shell-brand { justify-content: center; margin-bottom: 56px; }
      .status { width: 48px; height: 48px; margin: 0 auto 22px; }
      h1 { margin: 0; font-size: clamp(26px, 4vw, 32px); font-weight: 650; line-height: 1.18; letter-spacing: -.035em; }
      .explanation { margin: 14px auto 0; max-width: 480px; color: var(--muted-foreground); font-size: 14px; line-height: 1.6; }
      .origin { display: inline-block; max-width: 100%; margin-top: 18px; padding: 7px 10px; overflow: hidden; border-radius: 8px; background: var(--muted); color: var(--muted-foreground); font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
      .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 28px; }
      .actions a { text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      ${desktopShellBrandHtml()}
      <div class="status shell-icon-well" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="2"></rect><rect x="3" y="14" width="18" height="6" rx="2"></rect><path d="M7 7h.01M7 17h.01M4 4l16 16"></path></svg>
      </div>
      <h1>minddy can’t reach ${escapeHtml(serverName)}</h1>
      <p class="explanation">The configured minddy server may be stopped, or its address may be incorrect. Check that the server is running and reachable from this computer.</p>
      <div class="origin" aria-label="Configured server: ${escapeHtml(displayOrigin)}">${escapeHtml(displayOrigin)}</div>
      <div class="actions">
        <a class="shell-button shell-button-primary" href="${escapeHtml(retryUrl)}">Try again</a>
        <button class="shell-button shell-button-outline" id="server-settings" type="button">Check server settings</button>
      </div>
    </main>
    <script>
      document.getElementById("server-settings").addEventListener("click", () => {
        window.minddy?.openServerPicker?.();
      });
    </script>
  </body>
</html>`;
}
