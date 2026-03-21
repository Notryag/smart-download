import type { DownloadTaskSnapshot } from '../download'
import type { LogContext } from '../../core'
import type { TaskIdInput } from '../../types'
import {
  ARIA2_STATE_SETTLE_INTERVAL_MS,
  ARIA2_STATE_SETTLE_TIMEOUT_MS,
  delay
} from './utils'

interface StateWaiterLogger {
  warning(message: string, context?: LogContext | string): void
}

interface Aria2StateWaiterOptions {
  timeoutMs?: number
  intervalMs?: number
  getNow?: () => number
  sleep?: (ms: number) => Promise<void>
}

export class Aria2StateWaiter {
  private readonly timeoutMs: number
  private readonly intervalMs: number
  private readonly getNow: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly readSnapshot: (input: TaskIdInput) => Promise<DownloadTaskSnapshot>,
    private readonly logger?: StateWaiterLogger,
    options: Aria2StateWaiterOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? ARIA2_STATE_SETTLE_TIMEOUT_MS
    this.intervalMs = options.intervalMs ?? ARIA2_STATE_SETTLE_INTERVAL_MS
    this.getNow = options.getNow ?? Date.now
    this.sleep = options.sleep ?? delay
  }

  async waitForSnapshot(
    input: TaskIdInput,
    predicate: (snapshot: DownloadTaskSnapshot) => boolean
  ): Promise<DownloadTaskSnapshot> {
    const deadline = this.getNow() + this.timeoutMs

    while (this.getNow() < deadline) {
      const snapshot = await this.readSnapshot(input)

      if (predicate(snapshot)) {
        return snapshot
      }

      await this.sleep(this.intervalMs)
    }

    this.logger?.warning('aria2 task did not reach expected state before timeout', {
      category: 'aria2-adapter',
      details: {
        timeoutMs: this.timeoutMs
      },
      taskId: input.taskId
    })
    return this.readSnapshot(input)
  }
}
