import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { DOWNLOAD_TASK_IPC_CHANNELS, type DownloadTaskApi } from '../types'

const api: DownloadTaskApi = {
  createTask(input) {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.createTask, input)
  },
  getDashboard() {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.getDashboard)
  },
  onDashboardUpdated(listener) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      snapshot: Awaited<ReturnType<DownloadTaskApi['getDashboard']>>
    ): void => {
      listener(snapshot)
    }

    ipcRenderer.on(DOWNLOAD_TASK_IPC_CHANNELS.dashboardUpdated, handler)

    return () => {
      ipcRenderer.off(DOWNLOAD_TASK_IPC_CHANNELS.dashboardUpdated, handler)
    }
  },
  listTasks() {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.listTasks)
  },
  getDiagnostics() {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.getDiagnostics)
  },
  pauseTask(input) {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.pauseTask, input)
  },
  resumeTask(input) {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.resumeTask, input)
  },
  deleteTask(input) {
    return ipcRenderer.invoke(DOWNLOAD_TASK_IPC_CHANNELS.deleteTask, input)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  const windowWithApi = window as typeof window & {
    electron: typeof electronAPI
    api: DownloadTaskApi
  }

  windowWithApi.electron = electronAPI
  windowWithApi.api = api
}
