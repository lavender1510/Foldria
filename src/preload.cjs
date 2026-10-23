const { contextBridge, ipcRenderer } = require('electron');
const channels = new Set(['folders:select', 'settings:get', 'settings:save', 'preview:create', 'sort:run', 'duplicates:scan', 'duplicates:cancel', 'duplicates:trash', 'history:list', 'history:undo', 'file:reveal', 'report:save']);
contextBridge.exposeInMainWorld('foldria', {
  invoke: (channel, ...args) => {
    if (!channels.has(channel)) throw new Error('Nicht erlaubte Aktion.');
    return ipcRenderer.invoke(channel, ...args);
  },
  onProgress: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('task:progress', handler);
    return () => ipcRenderer.removeListener('task:progress', handler);
  }
});
