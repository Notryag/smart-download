import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Aria2DownloadAdapter } from './index'
import { ARIA2_FALLBACK_TRACKERS } from './utils'

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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Aria2DownloadAdapter attach options', () => {
  it('renames single-file magnet output when the target file already exists', async () => {
    const savePath = mkdtempSync(join(tmpdir(), 'smart-download-aria2-'))
    writeFileSync(join(savePath, 'ubuntu.iso'), 'existing file')

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

    try {
      const adapter = new Aria2DownloadAdapter({
        rpcUrl: 'http://127.0.0.1:6800/jsonrpc'
      })

      await adapter.attachTask({
        taskId: 'task-1',
        source: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890&dn=ubuntu.iso',
        savePath
      })

      const addUriRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
        method: string
        params: unknown[]
      }

      expect(addUriRequest.method).toBe('aria2.addUri')
      const attachedMagnet = new URL(String(addUriRequest.params[0]?.[0]))

      expect(attachedMagnet.searchParams.get('xt')).toBe(
        'urn:btih:1234567890123456789012345678901234567890'
      )
      expect(attachedMagnet.searchParams.get('dn')).toBe('ubuntu.iso')
      expect(attachedMagnet.searchParams.getAll('tr')).toEqual([...ARIA2_FALLBACK_TRACKERS])
      for (const tracker of ARIA2_FALLBACK_TRACKERS) {
        expect(attachedMagnet.searchParams.getAll('tr')).toContain(tracker)
      }
      expect(addUriRequest.params[1]).toEqual({
        dir: savePath,
        'index-out': '1=ubuntu (1).iso',
        pause: 'true'
      })
    } finally {
      rmSync(savePath, { force: true, recursive: true })
    }
  })
})
