import {
  DESKTOP_SHELL_CSP,
  desktopShellBrandHtml,
  desktopShellStyles,
} from "@/lib/desktop/shell-ui";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Builds the shell-owned server picker document. */
export function desktopServerPickerHtml(
  currentOrigin: string,
  isCustomServer: boolean,
  interFontDataUrl?: string,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${DESKTOP_SHELL_CSP}">
    <meta name="color-scheme" content="light dark">
    <title>Connect to a server</title>
    <style>
      ${desktopShellStyles(interFontDataUrl)}
      body { min-height: 100vh; }
      main { padding: 28px 30px 26px; }
      header { margin-top: 28px; }
      h1 { margin: 0; font-size: 24px; font-weight: 650; line-height: 1.2; letter-spacing: -.025em; }
      .intro { margin: 9px 0 0; max-width: 470px; }
      .local-choice { width: 100%; min-height: 82px; display: flex; align-items: center; gap: 14px; margin-top: 22px; border: 1px solid var(--border); border-radius: 16px; padding: 14px; background: var(--card); color: var(--foreground); text-align: left; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease; }
      .local-choice:hover { border-color: color-mix(in oklab, var(--foreground) 20%, var(--border)); background: var(--control-hover); }
      .local-choice .shell-icon-well { width: 44px; height: 44px; flex: 0 0 auto; border-radius: 14px; }
      .choice-copy { min-width: 0; flex: 1; }
      .choice-title { display: block; font-size: 14px; font-weight: 600; }
      .choice-help { display: block; margin-top: 3px; color: var(--muted-foreground); font-size: 12px; line-height: 1.45; }
      .choice-arrow { color: var(--muted-foreground); font-size: 18px; }
      .divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; color: var(--muted-foreground); font-size: 12px; }
      .divider::before, .divider::after { height: 1px; flex: 1; background: var(--border); content: ""; }
      .shell-input { margin-top: 8px; }
      #error { min-height: 18px; margin-top: 7px; }
      footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; }
      .actions { display: flex; gap: 8px; margin-left: auto; }
    </style>
  </head>
  <body>
    <main>
      ${desktopShellBrandHtml()}
      <header>
        <h1>Connect to a server</h1>
        <p class="intro shell-help">Connect to a minddy server you manage. Remote servers require HTTPS; localhost can use HTTP.</p>
      </header>
      <button class="local-choice shell-choice" id="local" type="button">
        <span class="shell-icon-well" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 7.5h6l2 2h10v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1.5"></path></svg>
        </span>
        <span class="choice-copy">
          <span class="choice-title">Run local minddy on this computer</span>
          <span class="choice-help">Choose the minddy folder once. The app will start it automatically from then on.</span>
        </span>
        <span class="choice-arrow" aria-hidden="true">→</span>
      </button>
      <div class="divider"><span>or use a server address</span></div>
      <form id="form">
        <label class="shell-label" for="origin">Server address</label>
        <input class="shell-input" id="origin" name="origin" type="url" required spellcheck="false" aria-describedby="error" value="${escapeHtml(currentOrigin)}" placeholder="https://minddy.example.com">
        <div class="shell-error" id="error" role="alert" aria-live="polite"></div>
        <footer>
          ${isCustomServer ? '<button class="shell-button shell-button-ghost" id="cloud" type="button">Use minddy Cloud</button>' : "<span></span>"}
          <div class="actions">
            <button class="shell-button shell-button-outline" id="cancel" type="button">Cancel</button>
            <button class="shell-button shell-button-primary" type="submit">Connect</button>
          </div>
        </footer>
      </form>
    </main>
    <script>
      const form = document.getElementById("form");
      const input = document.getElementById("origin");
      const error = document.getElementById("error");
      document.getElementById("local").addEventListener("click", async () => {
        error.textContent = "Starting local minddy…";
        const result = await window.minddyServerPicker.useLocal();
        error.textContent = result?.error || "";
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const result = await window.minddyServerPicker.save(input.value);
        if (result?.error) error.textContent = result.error;
      });
      document.getElementById("cancel").addEventListener("click", () => window.close());
      document.getElementById("cloud")?.addEventListener("click", () => window.minddyServerPicker.useCloud());
      input.select();
    </script>
  </body>
</html>`;
}
