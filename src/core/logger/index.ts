export type LogLevel = 'info' | 'warning' | 'error'

export type LogCategory =
  | 'task-manager'
  | 'aria2-adapter'
  | 'aria2-runtime'
  | 'diagnostics'
  | 'storage'
  | 'ipc'

export type LogDetails = Record<string, string | number | boolean | null>

export interface LogContext {
  category?: LogCategory
  details?: LogDetails
  taskId?: string
}

export interface LogEntry {
  id: string
  category: LogCategory
  level: LogLevel
  message: string
  details?: LogDetails
  taskId?: string
  createdAt: string
}

export class InMemoryLogger {
  private readonly entries: LogEntry[] = []

  constructor(private readonly limit = 500) {}

  info(message: string, context?: LogContext | string): void {
    this.pushEntry('info', message, context)
  }

  warning(message: string, context?: LogContext | string): void {
    this.pushEntry('warning', message, context)
  }

  error(message: string, context?: LogContext | string): void {
    this.pushEntry('error', message, context)
  }

  listEntries(): LogEntry[] {
    return [...this.entries]
  }

  private pushEntry(level: LogLevel, message: string, context?: LogContext | string): void {
    const normalized = this.normalizeContext(context)

    this.entries.unshift({
      id: crypto.randomUUID(),
      category: normalized.category,
      level,
      details: normalized.details,
      message,
      taskId: normalized.taskId,
      createdAt: new Date().toISOString()
    })

    if (this.entries.length > this.limit) {
      this.entries.length = this.limit
    }
  }

  private normalizeContext(
    context?: LogContext | string
  ): Required<Pick<LogEntry, 'category'>> & Pick<LogEntry, 'details' | 'taskId'> {
    if (typeof context === 'string') {
      return {
        category: 'task-manager',
        taskId: context
      }
    }

    return {
      category: context?.category ?? 'task-manager',
      details: context?.details,
      taskId: context?.taskId
    }
  }
}
