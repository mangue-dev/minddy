import path from "node:path";
import { BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from "electron";

import { normalizeDesktopServerOrigin } from "@/lib/desktop/server-origin";
import { desktopServerPickerHtml } from "@/lib/desktop/server-picker-page";
import { desktopShellFontDataUrl } from "./shell-font";

interface ServerPickerOptions {
  parent: BrowserWindow;
  currentOrigin: string;
  isCustomServer: boolean;
  onSave: (origin: string) => void;
  onUseLocal: () => Promise<{ error?: string }>;
  onUseCloud: () => void;
}

let picker: BrowserWindow | null = null;

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
    height: 550,
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
  const html = desktopServerPickerHtml(
    options.currentOrigin,
    options.isCustomServer,
    desktopShellFontDataUrl(),
  );
  void picker.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  );
}
