import { ElectronAPI } from '@electron-toolkit/preload'
import type { DownloadTaskApi } from '../types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: DownloadTaskApi
  }
}
