import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DownloadTask } from '../../types'
import { Aria2DownloadAdapter } from './index'

function createRpcResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

function mockFetchSequence(
  ...responses: Array<{ body: unknown; status?: number }>
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn()

  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(createRpcResponse(response.body, response.status))
  }

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function createPersistedTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: 'task-1',
    type: 'magnet',
    name: 'Ubuntu ISO',
    source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
    savePath: 'D:\\Downloads',
    status: 'paused',
    progress: 0.5,
    downloadedBytes: 50,
    speedBytes: 0,
    createdAt: '2026-03-21T12:00:00.000Z',
    updatedAt: '2026-03-21T12:01:00.000Z',
    remoteId: 'gid-1',
    totalBytes: 100,
    ...patch
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Aria2DownloadAdapter', () => {
  it('reports runtime as unavailable when BitTorrent is not enabled', async () => {
    mockFetchSequence({
      body: {
        result: {
          version: '1.37.0',
          enabledFeatures: ['Async DNS']
        }
      }
    })

    const adapter = new Aria2DownloadAdapter({ rpcUrl: 'http://127.0.0.1:6800/jsonrpc' })
    const status = await adapter.getRuntimeStatus()

    expect(status.ready).toBe(false)
    expect(status.client).toBe('aria2')
    expect(status.message).toContain('未启用 BitTorrent')
  })

  it('attaches a task through aria2 RPC and returns the first snapshot', async () => {
    const fetchMock = mockFetchSequence(
      {
        body: {
          result: 'gid-1'
        }
      },
      {
        body: {
          result: {
            gid: 'gid-1',
            status: 'active',
            totalLength: '0',
            completedLength: '0',
            downloadSpeed: '0'
          }
        }
      }
    )

    const adapter = new Aria2DownloadAdapter({
      rpcUrl: 'http://127.0.0.1:6800/jsonrpc',
      secret: 'rpc-secret'
    })
    const session = await adapter.attachTask({
      taskId: 'task-1',
      source: ' magnet:?xt=urn:btih:1234567890123456789012345678901234567890 ',
      savePath: ' D:\\Downloads ',
      name: 'Ubuntu ISO'
    })

    expect(session.remoteId).toBe('gid-1')
    expect(session.status).toBe('metadata')
    expect(session.source).toBe('magnet:?xt=urn:btih:1234567890123456789012345678901234567890')
    expect(session.savePath).toBe('D:\\Downloads')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const addUriRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      method: string
      params: unknown[]
    }
    const tellStatusRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      method: string
      params: unknown[]
    }

    expect(addUriRequest.method).toBe('aria2.addUri')
    expect(addUriRequest.params).toEqual([
      'token:rpc-secret',
      ['magnet:?xt=urn:btih:1234567890123456789012345678901234567890'],
      {
        dir: 'D:\\Downloads',
        pause: 'true'
      }
    ])
    expect(tellStatusRequest.method).toBe('aria2.tellStatus')
    expect(tellStatusRequest.params).toEqual(['token:rpc-secret', 'gid-1'])
  })

  it('starts a hydrated task by unpausing and waiting for an active snapshot', async () => {
    mockFetchSequence(
      {
        body: {
          result: 'OK'
        }
      },
      {
        body: {
          result: {
            gid: 'gid-1',
            status: 'active',
            totalLength: '100',
            completedLength: '25',
            downloadSpeed: '5'
          }
        }
      }
    )

    const adapter = new Aria2DownloadAdapter({ rpcUrl: 'http://127.0.0.1:6800/jsonrpc' })
    await adapter.hydrateTask(createPersistedTask())

    const snapshot = await adapter.startTask({ taskId: 'task-1' })

    expect(snapshot.status).toBe('downloading')
    expect(snapshot.progress).toBe(0.25)
    expect(snapshot.etaSeconds).toBe(15)
  })

  it('ignores completed and missing-result errors when deleting a task', async () => {
    mockFetchSequence(
      {
        body: {
          error: {
            code: 1,
            message: 'Download already completed'
          }
        }
      },
      {
        body: {
          error: {
            code: 2,
            message: 'Invalid GID'
          }
        }
      }
    )

    const adapter = new Aria2DownloadAdapter({ rpcUrl: 'http://127.0.0.1:6800/jsonrpc' })
    await adapter.hydrateTask(createPersistedTask())

    await expect(adapter.deleteTask({ taskId: 'task-1' })).resolves.toBeUndefined()
    await expect(adapter.getTaskSnapshot({ taskId: 'task-1' })).rejects.toThrow(
      'Download session not found for task: task-1'
    )
  })
})
