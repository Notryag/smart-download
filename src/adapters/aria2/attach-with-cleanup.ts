import { buildSourcePreview, getErrorMessage } from './utils'
import type { Aria2RpcClient } from './rpc-client'

const ARIA2_DUPLICATE_ATTACH_RETRY_LIMIT = 3

interface AttachLogger {
  warning(message: string, context?: unknown): void
}

export async function attachUriWithDuplicateCleanup(input: {
  client: Aria2RpcClient
  source: string
  options: Record<string, string>
  taskId: string
  logger?: AttachLogger
  cleanup: () => Promise<void>
}): Promise<string> {
  for (let attempt = 0; attempt < ARIA2_DUPLICATE_ATTACH_RETRY_LIMIT; attempt += 1) {
    try {
      return await input.client.addUri([input.source], input.options)
    } catch (error) {
      const message = getErrorMessage(error, 'aria2 创建任务失败')
      const isDuplicateRegistered = message.includes('already registered')
      const hasRemainingAttempt = attempt < ARIA2_DUPLICATE_ATTACH_RETRY_LIMIT - 1

      if (!isDuplicateRegistered || !hasRemainingAttempt) {
        throw error
      }

      input.logger?.warning('aria2 reported duplicate registered magnet; cleaning stale entries', {
        category: 'aria2-adapter',
        details: {
          attempt: attempt + 1,
          sourcePreview: buildSourcePreview(input.source)
        },
        taskId: input.taskId
      })
      await input.cleanup()
    }
  }

  throw new Error('aria2 创建任务失败')
}
