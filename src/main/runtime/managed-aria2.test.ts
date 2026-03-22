import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Aria2RpcClient } from '../../adapters'
import { InMemoryLogger } from '../../core'
import { ManagedAria2Service } from './managed-aria2'

const childProcessMocks = vi.hoisted(() => {
  const spawn = vi.fn()
  return { spawn }
})

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')

  return {
    ...actual,
    spawn: childProcessMocks.spawn
  }
})

function createChildProcessMock(): {
  stdout: { on: ReturnType<typeof vi.fn> }
  stderr: { on: ReturnType<typeof vi.fn> }
  once: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  killed: boolean
  exitCode: null
} {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    once: vi.fn(),
    kill: vi.fn(),
    killed: false,
    exitCode: null
  }
}

function createAppMock(userDataPath: string, downloadsPath: string): {
  getPath: (name: 'userData' | 'downloads') => string
} {
  return {
    getPath(name: 'userData' | 'downloads'): string {
      if (name === 'userData') {
        return userDataPath
      }

      return downloadsPath
    }
  }
}

describe('ManagedAria2Service', () => {
  let workspacePath: string
  let aria2BinPath: string
  let userDataPath: string
  let downloadsPath: string
  let sessionPath: string
  let envBackup: string | undefined

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'smart-download-managed-aria2-'))
    aria2BinPath = join(workspacePath, 'aria2c.exe')
    userDataPath = join(workspacePath, 'user-data')
    downloadsPath = join(workspacePath, 'downloads')
    sessionPath = join(userDataPath, 'aria2', 'session.txt')
    envBackup = process.env.ARIA2C_BIN
    process.env.ARIA2C_BIN = aria2BinPath

    writeFileSync(aria2BinPath, 'fake binary')
    mkdirSync(join(userDataPath, 'aria2'), { recursive: true })
    childProcessMocks.spawn.mockReturnValue(createChildProcessMock())
    vi.spyOn(Aria2RpcClient.prototype, 'getVersion').mockResolvedValue({
      version: '1.37.0',
      enabledFeatures: ['BitTorrent']
    })
  })

  afterEach(() => {
    if (envBackup === undefined) {
      delete process.env.ARIA2C_BIN
    } else {
      process.env.ARIA2C_BIN = envBackup
    }

    rmSync(workspacePath, { force: true, recursive: true })
    vi.restoreAllMocks()
    childProcessMocks.spawn.mockReset()
  })

  it('deduplicates repeated magnet entries in session.txt before starting aria2', async () => {
    writeFileSync(
      sessionPath,
      [
        'magnet:?xt=urn:btih:c8295ce630f2064f08440db1534e4992cfe4862a&dn=ubuntu.iso',
        ' gid=gid-old-1',
        ' dir=D:',
        ' continue=true',
        'magnet:?xt=urn:btih:c8295ce630f2064f08440db1534e4992cfe4862a&dn=ubuntu.iso',
        ' gid=gid-old-2',
        ' dir=D:',
        ' continue=true',
        'magnet:?xt=urn:btih:ACF88DFC1BD6CD944C63E56E1706624AA5FDBE54',
        ' gid=gid-other',
        ' dir=D:\\'
      ].join('\n')
    )

    const service = new ManagedAria2Service(
      createAppMock(userDataPath, downloadsPath) as never,
      new InMemoryLogger()
    )

    await service.start(null)

    const nextSessionContent = readFileSync(sessionPath, 'utf8')

    expect(nextSessionContent.match(/xt=urn:btih:c8295ce630f2064f08440db1534e4992cfe4862a/gi)).toHaveLength(
      1
    )
    expect(nextSessionContent).toContain('gid=gid-old-2')
    expect(nextSessionContent).toContain('gid=gid-other')
  })
})
