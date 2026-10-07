// The only bridge between the web app and the desktop shell (sandboxed preload).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  /** Files the OS asked us to open before the app was ready. */
  ready: () => ipcRenderer.invoke("desktop:ready"),
  onOpenFile: (callback) => ipcRenderer.on("desktop:open-file", (_e, file) => callback(file)),
  onNavigate: (callback) => ipcRenderer.on("desktop:navigate", (_e, hash) => callback(hash)),
  openDialog: () => ipcRenderer.invoke("desktop:open-dialog"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  /** Downloads the installer of the update the last check found, and opens it. */
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateProgress: (callback) => ipcRenderer.on("desktop:update-progress", (_e, percent) => callback(percent)),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
});
