const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("noir", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  installExtension: () => ipcRenderer.invoke("extensions:install"),
  removeExtension: (id) => ipcRenderer.invoke("extensions:remove", id),
  getExtensions: () => ipcRenderer.invoke("extensions:list"),
  showDownloads: () => ipcRenderer.invoke("downloads:open"),
  onDownload: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on("download:status", listener);
    return () => ipcRenderer.removeListener("download:status", listener);
  },
  onNewTab: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("browser:new-tab", listener);
    return () => ipcRenderer.removeListener("browser:new-tab", listener);
  },
});