import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Aria2DownloadAdapter } from '../adapters'
import { BasicDiagnosticsService, InMemoryLogger, InMemoryTaskManager } from '../core'
import { SqliteDownloadTaskStore } from '../storage'
import { readAria2ClientConfig } from './config/download-clients'
import { registerDownloadTaskIpc } from './ipc/download-task'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'Smart Download',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.smartdownload')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const taskStore = new SqliteDownloadTaskStore(
    join(app.getPath('userData'), 'storage', 'download-tasks.sqlite')
  )
  const logger = new InMemoryLogger()
  const aria2Adapter = new Aria2DownloadAdapter(readAria2ClientConfig())
  const taskManager = new InMemoryTaskManager(aria2Adapter, logger, taskStore)
  const diagnosticsService = new BasicDiagnosticsService(aria2Adapter)

  return taskManager.restoreTasks().then(() => {
    registerDownloadTaskIpc(taskManager, diagnosticsService, () => logger.listEntries())

    createWindow()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on('before-quit', () => {
      taskStore.close()
    })
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
