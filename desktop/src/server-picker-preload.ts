import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("minddyServerPicker", {
  save(origin: string) {
    return ipcRenderer.invoke("minddy:server-picker:save", origin) as Promise<{
      error?: string;
    }>;
  },
  useCloud() {
    return ipcRenderer.invoke("minddy:server-picker:cloud") as Promise<void>;
  },
});
