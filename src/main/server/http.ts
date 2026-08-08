import http from 'node:http'
import os from 'node:os'
import express from 'express'

export interface ServerHandle {
  url: string
  port: number
  host: string
  close: () => Promise<void>
}

/** Bind an Express app. Defaults to 0.0.0.0 so other machines can reach the org. */
export function startHttp(app: express.Express, port: number, host = '0.0.0.0'): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(port, host, () => {
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : port
      resolve({
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        host,
        close: () => new Promise<void>((r) => server.close(() => r()))
      })
    })
  })
}

/** First non-internal IPv4 address; used only to display "reach me at" on the host. */
export function lanIPs(): string[] {
  const nets = os.networkInterfaces()
  const out: string[] = []
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}