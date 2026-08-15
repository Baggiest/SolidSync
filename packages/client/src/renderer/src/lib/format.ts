export function formatSince(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const URL_RE = /^(https?):\/\/([^/:]+)(?::(\d+))?(?:\/.*)?$/i
const HOST_PORT_RE = /^([^/:]+):(\d{2,5})$/

/**
 * Accept a pasted server URL ("http://192.168.1.50:3020") or "host:port" and
 * split it into parts. Returns null when the input isn't a full link, so plain
 * typing of an IP is left untouched.
 */
export function parseServerInput(
  raw: string
): { host: string; port: number | null; tls: boolean | null } | null {
  const m = URL_RE.exec(raw.trim())
  if (m) {
    return { host: m[2], port: m[3] ? Number(m[3]) : null, tls: m[1].toLowerCase() === 'https' }
  }
  const hp = HOST_PORT_RE.exec(raw.trim())
  if (hp) {
    return { host: hp[1], port: Number(hp[2]), tls: null }
  }
  return null
}