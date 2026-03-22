import type { Aria2TellStatusResult, Aria2UriResult } from './types'

export async function filterRelatedTasksBySource(input: {
  source: string
  tasks: Aria2TellStatusResult[]
  ignoredGids?: Set<string>
  readUris: (gid: string) => Promise<Aria2UriResult[]>
}): Promise<Aria2TellStatusResult[]> {
  const infoHash = extractMagnetInfoHash(input.source)
  const normalizedSource = input.source.trim()
  const ignoredGids = input.ignoredGids ?? new Set<string>()

  if (!infoHash) {
    return []
  }

  return (
    await Promise.all(
      input.tasks.map(async (task) => {
        if (ignoredGids.has(task.gid)) {
          return null
        }

        if (normalizeInfoHash(task.infoHash) === infoHash) {
          return task
        }

        if (!(await hasMatchingSourceUri(task.gid, normalizedSource, infoHash, input.readUris))) {
          return null
        }

        return task
      })
    )
  ).filter((task): task is Aria2TellStatusResult => task !== null)
}

export function extractMagnetInfoHash(source: string): string | null {
  const match = source.match(/xt=urn:btih:([^&]+)/i)
  return normalizeInfoHash(match?.[1])
}

function normalizeInfoHash(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

async function hasMatchingSourceUri(
  gid: string,
  source: string,
  infoHash: string,
  readUris: (gid: string) => Promise<Aria2UriResult[]>
): Promise<boolean> {
  const uris = await readUris(gid)

  return uris.some((uri) => {
    const normalizedUri = uri.uri.trim()

    return normalizedUri === source || extractMagnetInfoHash(normalizedUri) === infoHash
  })
}
