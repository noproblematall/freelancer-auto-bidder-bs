// Emoji flag for a two-letter country code ('' when there is none).
export function countryFlag(code) {
  if (!code || String(code).length !== 2) return ''
  const up = String(code).toUpperCase()
  if (up === 'EU') return ''
  return String.fromCodePoint(0x1F1E6 - 65 + up.charCodeAt(0), 0x1F1E6 - 65 + up.charCodeAt(1))
}
