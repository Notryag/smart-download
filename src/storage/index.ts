import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type { DownloadTask } from '../types'

export interface DownloadTaskStore {
  upsertTask(task: DownloadTask): Promise<void>
  listTasks(): Promise<DownloadTask[]>
  deleteTask(taskId: string): Promise<void>
}

interface DownloadTaskRow {
  payloadJson: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function toTaskRow(row: Record<string, unknown>): DownloadTaskRow {
  const payloadJson = row.payloadJson

  if (typeof payloadJson !== 'string') {
    throw new Error('持久化任务数据格式无效')
  }

  return { payloadJson }
}

function parseTaskRow(row: DownloadTaskRow): DownloadTask {
  try {
    return JSON.parse(row.payloadJson) as DownloadTask
  } catch (error) {
    throw new Error(getErrorMessage(error, '解析持久化任务数据失败'))
  }
}

export class SqliteDownloadTaskStore implements DownloadTaskStore {
  private readonly database: DatabaseSync
  private readonly upsertStatement: StatementSync
  private readonly listStatement: StatementSync
  private readonly deleteStatement: StatementSync

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })

    this.database = new DatabaseSync(databasePath, {
      timeout: 3_000
    })

    this.database.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS download_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
    `)

    this.upsertStatement = this.database.prepare(`
      INSERT INTO download_tasks (id, name, status, created_at, updated_at, payload_json)
      VALUES (:id, :name, :status, :createdAt, :updatedAt, :payloadJson)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json
    `)

    this.listStatement = this.database.prepare(`
      SELECT payload_json AS payloadJson
      FROM download_tasks
      ORDER BY created_at DESC
    `)

    this.deleteStatement = this.database.prepare(`
      DELETE FROM download_tasks
      WHERE id = :taskId
    `)
  }

  async upsertTask(task: DownloadTask): Promise<void> {
    try {
      this.upsertStatement.run({
        id: task.id,
        name: task.name,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        payloadJson: JSON.stringify(task)
      })
    } catch (error) {
      throw new Error(`保存任务状态失败：${getErrorMessage(error, 'SQLite 写入失败')}`)
    }
  }

  async listTasks(): Promise<DownloadTask[]> {
    try {
      const rows = this.listStatement.all()
      return rows.map((row) => parseTaskRow(toTaskRow(row)))
    } catch (error) {
      throw new Error(`读取持久化任务失败：${getErrorMessage(error, 'SQLite 读取失败')}`)
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    try {
      this.deleteStatement.run({ taskId })
    } catch (error) {
      throw new Error(`删除持久化任务失败：${getErrorMessage(error, 'SQLite 删除失败')}`)
    }
  }

  close(): void {
    if (this.database.isOpen) {
      this.database.close()
    }
  }
}
