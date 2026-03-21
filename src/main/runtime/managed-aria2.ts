import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import type { App } from 'electron'
import { Aria2RpcClient, type Aria2ClientConfig } from '../../adapters'
import type { InMemoryLogger } from '../../core'

const STARTUP_TIMEOUT_MS = 15_000
const STARTUP_POLL_INTERVAL_MS = 250

export interface ManagedAria2StartResult {
  config: Aria2ClientConfig | null
  unavailableMessage?: string
}

function getPlatformBinaryName(): string {
  return process.platform === 'win32' ? 'aria2c.exe' : 'aria2c'
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function getAria2ResourceCandidates(): string[] {
  const binaryName = getPlatformBinaryName()
  const cwd = process.cwd()
  const resourcesPath = process.resourcesPath
  const candidates = [
    readEnv('ARIA2C_BIN'),
    resourcesPath
      ? join(resourcesPath, 'aria2', `${process.platform}-${process.arch}`, binaryName)
      : null,
    resourcesPath ? join(resourcesPath, 'aria2', process.platform, binaryName) : null,
    join(cwd, 'resources', 'aria2', `${process.platform}-${process.arch}`, binaryName),
    join(cwd, 'resources', 'aria2', process.platform, binaryName)
  ]

  return candidates.filter((value): value is string => Boolean(value))
}

function resolveBundledAria2BinaryPath(): string {
  const candidate = getAria2ResourceCandidates().find((filePath) => existsSync(filePath))

  if (!candidate) {
    throw new Error(
      `未找到内置 aria2c。请将二进制放到 resources/aria2/${process.platform}-${process.arch}/${getPlatformBinaryName()}。`
    )
  }

  return candidate
}

async function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配 aria2 RPC 端口'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createRpcSecret(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export class ManagedAria2Service {
  private child: ChildProcess | null = null
  private managedConfig: Aria2ClientConfig | null = null

  constructor(
    private readonly app: App,
    private readonly logger: InMemoryLogger
  ) {}

  async start(externalConfig: Aria2ClientConfig | null): Promise<ManagedAria2StartResult> {
    if (externalConfig) {
      this.logger.info('Using external aria2 RPC from environment variables')
      return { config: externalConfig }
    }

    try {
      const binaryPath = resolveBundledAria2BinaryPath()
      const runtimeDir = join(this.app.getPath('userData'), 'aria2')
      const downloadDir = join(this.app.getPath('downloads'), 'smart-download')
      const sessionPath = join(runtimeDir, 'session.txt')
      const port = await allocatePort()
      const secret = createRpcSecret()

      mkdirSync(runtimeDir, { recursive: true })
      mkdirSync(downloadDir, { recursive: true })
      closeSync(openSync(sessionPath, 'a'))

      this.managedConfig = {
        rpcUrl: `http://127.0.0.1:${port}/jsonrpc`,
        secret
      }

      const args = [
        '--enable-rpc=true',
        '--rpc-listen-all=false',
        `--rpc-listen-port=${port}`,
        `--rpc-secret=${secret}`,
        '--rpc-allow-origin-all=false',
        '--continue=true',
        '--max-concurrent-downloads=3',
        '--check-certificate=true',
        '--file-allocation=none',
        '--save-session-interval=1',
        `--input-file=${sessionPath}`,
        `--save-session=${sessionPath}`,
        `--dir=${downloadDir}`
      ]

      const child = spawn(binaryPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child

      child.once('error', (error) => {
        this.logger.error(`Managed aria2c spawn failed: ${error.message}`)
      })

      child.stdout?.on('data', (chunk) => {
        const message = chunk.toString().trim()
        if (message) {
          this.logger.info(`[aria2c] ${message}`)
        }
      })

      child.stderr?.on('data', (chunk) => {
        const message = chunk.toString().trim()
        if (message) {
          this.logger.error(`[aria2c] ${message}`)
        }
      })

      child.once('exit', (code, signal) => {
        const detail = signal ? `signal=${signal}` : `code=${code ?? 'unknown'}`
        this.logger.info(`Managed aria2c exited (${detail})`)
        this.child = null
      })

      await this.waitUntilReady(this.managedConfig)
      this.logger.info(`Managed aria2 RPC ready at ${this.managedConfig.rpcUrl}`)

      return { config: this.managedConfig }
    } catch (error) {
      const message = error instanceof Error ? error.message : '内置 aria2 启动失败'
      this.logger.error(message)
      this.stop()
      this.managedConfig = null

      return {
        config: null,
        unavailableMessage: message
      }
    }
  }

  stop(): void {
    if (!this.child || this.child.killed) {
      return
    }

    this.child.kill()
    this.child = null
  }

  private async waitUntilReady(config: Aria2ClientConfig): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    const client = new Aria2RpcClient(config)

    while (Date.now() < deadline) {
      if (!this.child || this.child.exitCode !== null) {
        throw new Error('内置 aria2 进程启动后立即退出。')
      }

      try {
        await client.getVersion()
        return
      } catch {
        await delay(STARTUP_POLL_INTERVAL_MS)
      }
    }

    throw new Error('内置 aria2 RPC 启动超时，请检查 aria2c 二进制是否可执行。')
  }
}
