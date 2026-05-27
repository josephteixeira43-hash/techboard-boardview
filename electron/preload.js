const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('python:ping'),
  selectPdf: () => ipcRenderer.invoke('dialog:selectPdf'),
  extractPDF: ({ pdfPath, deviceId, pageIndex = 0 }) =>
    ipcRenderer.invoke('python:extractPDF', { pdfPath, deviceId, pageIndex }),
})
