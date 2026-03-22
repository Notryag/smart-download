import { describe, expect, it } from 'vitest'

import { formatBytes } from './download-task'

describe('download task utils', () => {
  it('formats bytes with decimal units when using KB/MB/GB labels', () => {
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1000)).toBe('1.0 KB')
    expect(formatBytes(5_702_520_832)).toBe('5.7 GB')
  })
})
