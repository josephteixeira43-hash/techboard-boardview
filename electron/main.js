const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { PythonBridge } = require('./pythonBridge')

const bridge = new PythonBridge()
const isDev = !app.isPackaged
const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:3000/boardview'

let mainWindow = null

// Handler: testar se Python está disponível
ipcMain.handle('python:ping', async () => {
  return bridge.ping()
})

// Handler: extrair componentes de PDF
ipcMain.handle('python:extractPDF', async (_event, { pdfPath, deviceId, pageIndex }) => {
  return bridge.extractPDF(pdfPath, deviceId, pageIndex ?? 0)
})

ipcMain.handle('dialog:selectPdf', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Boardview', extensions: ['pdf'] }],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL(DEV_URL)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
