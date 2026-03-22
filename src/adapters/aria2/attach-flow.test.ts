import { afterEach, expect, it, vi } from 'vitest'

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

function listRequestMethods(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => {
    const request = JSON.parse(String(call?.[1]?.body)) as { method: string }
    return request.method
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
  expect(listRequestMethods(fetchMock)).toEqual([
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

it('removes duplicate magnet tasks even when aria2 list output misses infoHash', async () => {
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
            status: 'active'
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
        result: []
      }
    },
    {
      body: {
        result: [
          {
            uri: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890&dn=Ubuntu'
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
  expect(listRequestMethods(fetchMock)).toEqual([
    'aria2.addUri',
    'aria2.tellActive',
    'aria2.tellWaiting',
    'aria2.tellStopped',
    'aria2.getUris',
    'aria2.forceRemove',
    'aria2.removeDownloadResult',
    'aria2.addUri',
    'aria2.tellStatus'
  ])
})

it('retries duplicate cleanup more than once before failing task creation', async () => {
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
        result: []
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
        error: {
          code: 1,
          message: 'The download is already registered.'
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
        result: [
          {
            gid: 'gid-old-stopped',
            status: 'error',
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
  expect(listRequestMethods(fetchMock)).toEqual([
    'aria2.addUri',
    'aria2.tellActive',
    'aria2.tellWaiting',
    'aria2.tellStopped',
    'aria2.forceRemove',
    'aria2.removeDownloadResult',
    'aria2.addUri',
    'aria2.tellActive',
    'aria2.tellWaiting',
    'aria2.tellStopped',
    'aria2.removeDownloadResult',
    'aria2.addUri',
    'aria2.tellStatus'
  ])
})
