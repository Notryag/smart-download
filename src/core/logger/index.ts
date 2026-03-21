export type LogLevel = 'info' | 'error'

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  taskId?: string
  createdAt: string
}

export class InMemoryLogger {
  private readonly entries: LogEntry[] = []

  constructor(private readonly limit = 500) {}

  info(message: string, taskId?: string): void {
    this.pushEntry('info', message, taskId)
  }

  error(message: string, taskId?: string): void {
    this.pushEntry('error', message, taskId)
  }

  listEntries(): LogEntry[] {
    return [...this.entries]
  }

  private pushEntry(level: LogLevel, message: string, taskId?: string): void {
    this.entries.unshift({
      id: crypto.randomUUID(),
      level,
      message,
      taskId,
      createdAt: new Date().toISOString()
    })

    if (this.entries.length > this.limit) {
      this.entries.length = this.limit
    }
  }
}
