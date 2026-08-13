import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import express from 'express'

export interface ServerHandle {
  url: string
  port: number
  host: string
  close: () => Promise<void>
}

interface TlsKeys {
  key: string
  cert: string
}

function bind(
  server: http.Server | https.Server,
  scheme: 'http' | 'https',
  port: number,
  host: string
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const addr = server.address()
      const actualPort = typeof addr === 'object' && addr ? addr.port : port
      resolve({
        url: `${scheme}://${host}:${actualPort}`,
        port: actualPort,
        host,
        close: () => new Promise<void>((r) => server.close(() => r()))
      })
    })
  })
}

/** Bind an Express app over plain HTTP. Defaults to 0.0.0.0 so other machines can reach the org. */
export function startHttp(app: express.Express, port: number, host = '0.0.0.0'): Promise<ServerHandle> {
  return bind(http.createServer(app), 'http', port, host)
}

/** Bind an Express app over TLS. Same app, same routes — only the transport differs. */
export function startHttps(app: express.Express, port: number, host: string, tls: TlsKeys): Promise<ServerHandle> {
  return bind(https.createServer({ key: tls.key, cert: tls.cert }, app), 'https', port, host)
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