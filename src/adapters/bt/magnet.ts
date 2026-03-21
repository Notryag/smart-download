function base32ToHex(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''

  for (const char of value.toUpperCase()) {
    const index = alphabet.indexOf(char)

    if (index === -1) {
      throw new Error('Unsupported base32 magnet hash')
    }

    bits += index.toString(2).padStart(5, '0')
  }

  let hex = ''

  for (let offset = 0; offset + 4 <= bits.length; offset += 4) {
    hex += Number.parseInt(bits.slice(offset, offset + 4), 2).toString(16)
  }

  return hex
}

export function assertMagnetSource(source: string): void {
  if (!source.trim().startsWith('magnet:?')) {
    throw new Error('BT adapter only supports magnet links')
  }
}

export function parseMagnetInfoHash(source: string): string {
  const magnet = new URL(source.trim())
  const xt = magnet.searchParams.get('xt')

  if (!xt?.startsWith('urn:btih:')) {
    throw new Error('Magnet link is missing btih info hash')
  }

  const rawHash = xt.slice('urn:btih:'.length)

  if (rawHash.length === 40) {
    return rawHash.toLowerCase()
  }

  if (rawHash.length === 32) {
    return base32ToHex(rawHash)
  }

  throw new Error('Unsupported magnet info hash format')
}
