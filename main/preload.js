const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    processVoice: () => ipcRenderer.invoke('process-voice'),
    minimize: () => ipcRenderer.send('minimize-window'),
    close: () => ipcRenderer.send('close-window'),
    toggleAutostart: (enabled) => ipcRenderer.send('toggle-autostart', enabled),
    onStatusUpdate: (cb) => ipcRenderer.on('status-update', (_, msg) => cb(msg)),
    onGoodbye: (cb) => ipcRenderer.on('goodbye-message', (_, msg) => cb(msg)),
    onUserMessage: (cb) => ipcRenderer.on('user-message', (_, msg) => cb(msg)),
    onAriaMessage: (cb) => ipcRenderer.on('aria-message', (_, data) => cb(data)),
})