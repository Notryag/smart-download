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

describe('Aria2DownloadAdapter runtime', () => {
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
})

describe('Aria2DownloadAdapter attach flow', () => {
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

  it('retries task attach after cleaning stale registered magnet downloads', async () => {
    const fetchMock = mockFetchSequence(
      {
        body: {
          error: {
            code: 1,
            message: 'The download is already registered.'
          }
        }
      },
      {
        body: {
          result: [
            {
              gid: 'gid-old-active',
              status: 'active',
              infoHash: '1234567890123456789012345678901234567890'
            }
          ]
        }
      },
      {
        body: {
          result: []
        }
      },
      {
        body: {
          result: [
            {
              gid: 'gid-old-stopped',
              status: 'complete',
              infoHash: '1234567890123456789012345678901234567890'
            }
          ]
        }
      },
      {
        body: {
          result: 'OK'
        }
      },
      {
        body: {
          result: 'OK'
        }
      },
      {
        body: {
          result: 'OK'
        }
      },
      {
        body: {
          result: 'gid-new'
        }
      },
      {
        body: {
          result: {
            gid: 'gid-new',
            status: 'active',
            totalLength: '100',
            completedLength: '10',
            downloadSpeed: '5'
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
      source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890',
      savePath: 'D:\\Downloads'
    })

    expect(session.remoteId).toBe('gid-new')

    const requestMethods = fetchMock.mock.calls.map((call) => {
      const request = JSON.parse(String(call?.[1]?.body)) as { method: string }
      return request.method
    })

    expect(requestMethods).toEqual([
      'aria2.addUri',
      'aria2.tellActive',
      'aria2.tellWaiting',
      'aria2.tellStopped',
      'aria2.forceRemove',
      'aria2.removeDownloadResult',
      'aria2.removeDownloadResult',
      'aria2.addUri',
      'aria2.tellStatus'
    ])
  })

})

describe('Aria2DownloadAdapter snapshot and cleanup flow', () => {
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

  it('follows aria2 metadata handoff to the real download gid', async () => {
    mockFetchSequence(
      {
        body: {
          result: {
            gid: 'gid-meta',
            status: 'complete',
            totalLength: '435179',
            completedLength: '435179',
            downloadSpeed: '0',
            followedBy: ['gid-real']
          }
        }
      },
      {
        body: {
          result: {
            gid: 'gid-real',
            status: 'complete',
            totalLength: '5702520832',
            completedLength: '5702520832',
            downloadSpeed: '0'
          }
        }
      }
    )

    const adapter = new Aria2DownloadAdapter({ rpcUrl: 'http://127.0.0.1:6800/jsonrpc' })
    await adapter.hydrateTask(createPersistedTask({ remoteId: 'gid-meta' }))

    const snapshot = await adapter.getTaskSnapshot({ taskId: 'task-1' })

    expect(snapshot.remoteId).toBe('gid-real')
    expect(snapshot.status).toBe('completed')
    expect(snapshot.totalBytes).toBe(5702520832)
    expect(snapshot.downloadedBytes).toBe(5702520832)
  })

  it('cleans up related aria2 downloads with the same info hash when deleting a task', async () => {
    const fetchMock = mockFetchSequence(
      {
        body: {
          result: 'OK'
        }
      },
      {
        body: {
          result: 'OK'
        }
      },
      {
        body: {
          result: []
        }
      },
      {
        body: {
          result: []
        }
      },
      {
        body: {
          result: [
            {
              gid: 'gid-old-stopped',
              status: 'complete',
              infoHash: '1234567890123456789012345678901234567890'
            }
          ]
        }
      },
      {
        body: {
          result: 'OK'
        }
      }
    )

    const adapter = new Aria2DownloadAdapter({
      rpcUrl: 'http://127.0.0.1:6800/jsonrpc',
      secret: 'rpc-secret'
    })
    await adapter.hydrateTask(createPersistedTask())

    await adapter.deleteTask({ taskId: 'task-1' })

    const requestMethods = fetchMock.mock.calls.map((call) => {
      const request = JSON.parse(String(call?.[1]?.body)) as { method: string, params: unknown[] }
      return {
        method: request.method,
        params: request.params
      }
    })

    expect(requestMethods).toEqual([
      {
        method: 'aria2.forceRemove',
        params: ['token:rpc-secret', 'gid-1']
      },
      {
        method: 'aria2.removeDownloadResult',
        params: ['token:rpc-secret', 'gid-1']
      },
      {
        method: 'aria2.tellActive',
        params: [
          'token:rpc-secret',
          ['gid', 'status', 'infoHash']
        ]
      },
      {
        method: 'aria2.tellWaiting',
        params: [
          'token:rpc-secret',
          0,
          1000,
          ['gid', 'status', 'infoHash']
        ]
      },
      {
        method: 'aria2.tellStopped',
        params: [
          'token:rpc-secret',
          0,
          1000,
          ['gid', 'status', 'infoHash']
        ]
      },
      {
        method: 'aria2.removeDownloadResult',
        params: ['token:rpc-secret', 'gid-old-stopped']
      }
    ])
  })
})

describe('Aria2DownloadAdapter delete flow', () => {
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
      },
      {
        body: {
          result: []
        }
      },
      {
        body: {
          result: []
        }
      },
      {
        body: {
          result: []
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
