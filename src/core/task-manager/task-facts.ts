import type {
  DownloadTask,
  DownloadTaskBottleneckCode,
  DownloadTaskFacts,
  DownloadTaskMetadataState
} from '../../types'

const LONG_METADATA_THRESHOLD_MS = 60_000
const ZERO_SPEED_THRESHOLD_MS = 60_000

function clampResourceHealthScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

export function buildResourceHealthScore(task: DownloadTask): number | undefined {
  if (task.type !== 'magnet') {
    return undefined
  }

  if (typeof task.facts?.resourceHealthScore === 'number') {
    return task.facts.resourceHealthScore
  }

  let score = 100
  const metadataElapsedMs = task.facts?.metadataElapsedMs
  const zeroSpeedDurationMs = task.facts?.zeroSpeedDurationMs
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const trackerCount = task.facts?.trackerCount ?? task.trackerCount
  const fallbackTrackerCount = task.facts?.fallbackTrackerCount ?? task.fallbackTrackerCount
  const normalizedSeedersCount = seedersCount ?? 0
  const normalizedTrackerCount = trackerCount ?? 0
  const normalizedFallbackTrackerCount = fallbackTrackerCount ?? 0

  if (task.status === 'metadata' && (metadataElapsedMs ?? 0) >= LONG_METADATA_THRESHOLD_MS) {
    score -= 45
  }

  if (task.status === 'downloading' && (zeroSpeedDurationMs ?? 0) >= ZERO_SPEED_THRESHOLD_MS) {
    score -= 50
  }

  if (normalizedSeedersCount <= 0) {
    score -= 25
  } else if (normalizedSeedersCount === 1) {
    score -= 20
  } else if (normalizedSeedersCount <= 3) {
    score -= 10
  }

  if (normalizedTrackerCount <= 1) {
    score -= 10
  }

  if (normalizedFallbackTrackerCount > 0 && score < 100) {
    score += 5
  }

  return clampResourceHealthScore(score)
}

export function buildResourceHealthLevel(
  score: number | undefined
): DownloadTaskFacts['resourceHealthLevel'] | undefined {
  if (typeof score !== 'number') {
    return undefined
  }
  if (score >= 80) {
    return 'healthy'
  }
  if (score >= 40) {
    return 'degraded'
  }
  return 'critical'
}

export function buildPeerAvailability(
  seedersCount: number | undefined
): DownloadTaskFacts['peerAvailability'] {
  const normalizedSeedersCount = seedersCount ?? 0

  if (normalizedSeedersCount <= 0) {
    return 'none'
  }
  if (normalizedSeedersCount === 1) {
    return 'scarce'
  }
  if (normalizedSeedersCount <= 3) {
    return 'limited'
  }
  return 'good'
}

export function buildTrackerHealth(
  trackerCount: number | undefined
): DownloadTaskFacts['trackerHealth'] {
  if ((trackerCount ?? 0) <= 0) {
    return 'none'
  }
  if (trackerCount === 1) {
    return 'sparse'
  }
  return 'normal'
}

export function buildMetadataState(task: DownloadTask): DownloadTaskMetadataState {
  if (task.status !== 'metadata') {
    return 'idle'
  }

  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const connectionsCount = task.facts?.connectionsCount ?? task.connectionsCount

  if ((connectionsCount ?? 0) > 0) {
    return 'exchanging_metadata'
  }

  if ((seedersCount ?? 0) > 0) {
    return 'connecting_peers'
  }

  return 'waiting_peers'
}

export function buildBottleneckCode(task: DownloadTask): DownloadTaskBottleneckCode {
  const metadataElapsedMs = task.facts?.metadataElapsedMs
  const zeroSpeedDurationMs = task.facts?.zeroSpeedDurationMs
  const seedersCount = task.facts?.seedersCount ?? task.seedersCount
  const trackerCount = task.facts?.trackerCount ?? task.trackerCount

  if (task.status === 'downloading' && (zeroSpeedDurationMs ?? 0) >= ZERO_SPEED_THRESHOLD_MS) {
    return 'zero_speed_stall'
  }

  if (task.status === 'metadata' && (metadataElapsedMs ?? 0) >= LONG_METADATA_THRESHOLD_MS) {
    return 'metadata_stall'
  }

  if ((seedersCount ?? 0) <= 1) {
    return 'peer_sparse'
  }

  if ((trackerCount ?? 0) <= 1) {
    return 'tracker_sparse'
  }

  return 'none'
}
