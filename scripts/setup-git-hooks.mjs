import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const gitDir = resolve(repoRoot, '.git')
const hooksPath = '.githooks'

if (!existsSync(gitDir)) {
  process.exit(0)
}

const result = spawnSync('git', ['config', 'core.hooksPath', hooksPath], {
  cwd: repoRoot,
  stdio: 'inherit'
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
