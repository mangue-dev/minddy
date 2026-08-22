import path from "node:path";
import { BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from "electron";

import { normalizeDesktopServerOrigin } from "@/lib/desktop/server-origin";

interface ServerPickerOptions {
  parent: BrowserWindow;
  currentOrigin: string;
  isCustomServer: boolean;
  onSave: (origin: string) => void;
  onUseLocal: () => Promise<{ error?: string }>;
  onUseCloud: () => void;
}

let picker: BrowserWindow | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pickerHtml(currentOrigin: string, isCustomServer: boolean): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <title>Connect to a server</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; background: Canvas; color: CanvasText; }
      main { padding: 32px; }
      h1 { margin: 0; font-size: 24px; letter-spacing: -.02em; }
      p { margin: 10px 0 24px; color: color-mix(in srgb, CanvasText 62%, transparent); font-size: 14px; line-height: 1.5; }
      label { display: block; font-size: 13px; font-weight: 600; }
      input { box-sizing: border-box; width: 100%; margin-top: 8px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 9px; background: Canvas; color: CanvasText; padding: 11px 12px; font: inherit; outline: none; }
      input:focus { border-color: #6d5bd0; box-shadow: 0 0 0 3px color-mix(in srgb, #6d5bd0 22%, transparent); }
      #error { min-height: 18px; margin: 8px 0 0; color: #d04444; font-size: 12px; }
      footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 22px; }
      .actions { display: flex; gap: 8px; margin-left: auto; }
      button { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 9px; background: Canvas; color: CanvasText; padding: 9px 14px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      button.primary { border-color: #6d5bd0; background: #6d5bd0; color: white; }
      button.link { border-color: transparent; padding-inline: 0; color: color-mix(in srgb, CanvasText 65%, transparent); }
    </style>
  </head>
  <body>
    <main>
      <h1>Connect to a server</h1>
      <p>Use your own minddy server in this desktop app. Public servers need HTTPS; localhost and private network IPs can use HTTP.</p>
      <button id="local" type="button">Run local minddy on this computer</button>
      <p class="local-help">Choose the minddy folder once. The app will start its local server and Supabase automatically from then on.</p>
      <form id="form">
        <label for="origin">Server address</label>
        <input id="origin" name="origin" type="url" required spellcheck="false" value="${escapeHtml(currentOrigin)}" placeholder="https://minddy.example.com">
        <div id="error" role="alert" aria-live="polite"></div>
        <footer>
          ${isCustomServer ? '<button class="link" id="cloud" type="button">Use minddy Cloud</button>' : "<span></span>"}
          <div class="actions">
            <button id="cancel" type="button">Cancel</button>
            <button class="primary" type="submit">Connect</button>
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

/** Opens the small native-shell server form and keeps only one copy alive. */
export function openServerPicker(options: ServerPickerOptions): void {
  if (picker && !picker.isDestroyed()) {
    picker.show();
    picker.focus();
    return;
  }

  const windowOptions: BrowserWindowConstructorOptions = {
    parent: options.parent,
    modal: true,
    width: 540,
    height: 430,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Connect to a server",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "server-picker-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  picker = new BrowserWindow(windowOptions);

  ipcMain.handle("minddy:server-picker:save", (event, raw: unknown) => {
    if (!picker || event.sender !== picker.webContents) return { error: "This server window is no longer active." };
    try {
      const origin = normalizeDesktopServerOrigin(raw);
      options.onSave(origin);
      picker.close();
      return {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Enter a valid server address." };
    }
  });
  ipcMain.handle("minddy:server-picker:cloud", (event) => {
    if (!picker || event.sender !== picker.webContents) return;
    options.onUseCloud();
    picker.close();
  });
  ipcMain.handle("minddy:server-picker:local", async (event) => {
    if (!picker || event.sender !== picker.webContents) return { error: "This server window is no longer active." };
    const result = await options.onUseLocal();
    if (!result.error) picker.close();
    return result;
  });

  picker.once("ready-to-show", () => picker?.show());
  picker.once("closed", () => {
    ipcMain.removeHandler("minddy:server-picker:save");
    ipcMain.removeHandler("minddy:server-picker:cloud");
    ipcMain.removeHandler("minddy:server-picker:local");
    picker = null;
  });
  void picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pickerHtml(options.currentOrigin, options.isCustomServer))}`);
}
