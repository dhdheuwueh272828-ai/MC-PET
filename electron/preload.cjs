const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:ignore-mouse', ignore),
  showMenu: (state) => ipcRenderer.send('pet:menu', state),
  setPanelMode: (open) => ipcRenderer.send('pet:panel-mode', open),
  onMenuAction: (cb) => ipcRenderer.on('pet:menu-action', (_e, msg) => cb(msg)),
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, p) => cb(p)),
});
