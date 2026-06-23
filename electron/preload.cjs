const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qqCollector", {
  start: () => ipcRenderer.invoke("collector:start"),
  stop: () => ipcRenderer.invoke("collector:stop"),
  status: () => ipcRenderer.invoke("collector:status"),
  listMessages: () => ipcRenderer.invoke("messages:list"),
  dataPath: () => ipcRenderer.invoke("messages:path"),
  onStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("collector:status", handler);
    return () => ipcRenderer.removeListener("collector:status", handler);
  },
});
