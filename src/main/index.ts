import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { Aria2DownloadAdapter } from '../adapters'
import { BasicDiagnosticsService, InMemoryLogger, InMemoryTaskManager } from '../core'
import { SqliteDownloadTaskStore } from '../storage'
import { readAria2ClientConfig } from './config/download-clients'
import { registerDownloadTaskIpc } from './ipc/download-task'
import { ManagedAria2Service } from './runtime/managed-aria2'

const isDev = !app.isPackaged

function registerWindowShortcuts(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return
    }

    if (isDev && input.code === 'F12') {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools()
      } else {
        window.webContents.openDevTools({ mode: 'undocked' })
      }

      event.preventDefault()
      return
    }

    if (!isDev) {
      if (input.code === 'KeyR' && (input.control || input.meta)) {
        event.preventDefault()
      }

      if (input.code === 'KeyI' && ((input.alt && input.meta) || (input.control && input.shift))) {
        event.preventDefault()
      }
    }
  })
}

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

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.smartdownload')
  }

  app.on('browser-window-created', (_, window) => {
    registerWindowShortcuts(window)
  })

  const taskStore = new SqliteDownloadTaskStore(
    join(app.getPath('userData'), 'storage', 'download-tasks.sqlite')
  )
  const logger = new InMemoryLogger()
  const managedAria2Service = new ManagedAria2Service(app, logger)

  return managedAria2Service.start(readAria2ClientConfig()).then((startup) => {
    const aria2Adapter = new Aria2DownloadAdapter(
      startup.config,
      startup.unavailableMessage ??
        '未能连接内置 aria2。请确认资源目录中的 aria2c 二进制存在且可执行。',
      logger
    )
    const taskManager = new InMemoryTaskManager(aria2Adapter, logger, taskStore)
    const diagnosticsService = new BasicDiagnosticsService(aria2Adapter)

    return taskManager.restoreTasks().then(() => {
      registerDownloadTaskIpc(taskManager, diagnosticsService, () => logger.listEntries())

      createWindow()

      app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow()
        }
      })

      app.on('before-quit', () => {
        managedAria2Service.stop()
        taskStore.close()
      })
    })
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
