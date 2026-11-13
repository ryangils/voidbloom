// Bridge between the game page and the desktop window. Kept tiny on purpose:
// the page can only ask about, or change, fullscreen.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isFullscreen: () => ipcRenderer.invoke('vb:is-fullscreen'),
  setFullscreen: on => ipcRenderer.invoke('vb:set-fullscreen', !!on),
});
