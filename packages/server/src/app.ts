import type { NextFunction, Request, Response } from 'express'
import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { OrgStore } from './store'
import { sha1File } from './lib/hash'
import { VERSION } from '@solidsync/shared'
import type { VersionInfo, WorkStatus } from '@solidsync/shared'

/**
 * Plain REST, JSON over HTTP (spec §10). No websockets. Clients poll
 * /api/health and /api/org on an interval — nothing more than fetch().
 */
export function createApp(store: OrgStore, opts: { caPem?: string } = {}): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '4mb' }))

  // CAD files can be large; stream uploads through a temp dir instead of RAM.
  const tmpRoot = path.join(os.tmpdir(), `solidsync-${randomUUID().slice(0, 8)}`)
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        mkdir(tmpRoot, { recursive: true }).then(() => cb(null, tmpRoot))
      },
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname ?? 'file'}`)
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 }
  })

  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next)
    }

  const replyError = (res: Response, status: number, message: string): void => {
    res.status(status).json({ ok: false, error: message })
  }

  const userName = (req: Request): string => String(req.headers['x-user'] ?? 'someone')

  // ---- health / org -------------------------------------------------------------

  // The org's TLS CA, served to clients for one-time trust (TOFU bootstrap).
  if (opts.caPem) {
    app.get('/tls/ca.pem', (_req, res) => {
      res.type('application/x-pem-file').send(opts.caPem!)
    })
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      orgName: store.getOrgName(),
      hostName: store.getHostName(),
      rev: store.getRev(),
      serverTime: new Date().toISOString(),
      version: VERSION
    })
  })

  app.get('/api/org', (_req, res) => {
    res.json(store.getOrgSnapshot())
  })

  // ---- projects / sections --------------------------------------------------------

  app.post('/api/projects', wrap(async (req, res) => {
    const name = (Array.isArray(req.body?.name) ? req.body.name[0] : req.body?.name ?? '').trim()
    if (!name) return replyError(res, 400, 'project name is required')
    const projectId = await store.createProject(name)
    res.json({ ok: true, projectId })
  }))

  app.delete('/api/projects/:projectId', wrap(async (req, res) => {
    await store.deleteProject(String(req.params.projectId))
    res.json({ ok: true })
  }))

  app.post('/api/projects/:projectId/archive', wrap(async (req, res) => {
    const projectId = String(req.params.projectId)
    if (!store.getOrgSnapshot().projects.some((p) => p.id === projectId))
      return replyError(res, 404, 'project not found')
    await store.archiveProject(projectId)
    res.json({ ok: true })
  }))

  app.post('/api/projects/:projectId/unarchive', wrap(async (req, res) => {
    const projectId = String(req.params.projectId)
    if (!store.getOrgSnapshot().projects.some((p) => p.id === projectId))
      return replyError(res, 404, 'project not found')
    await store.unarchiveProject(projectId)
    res.json({ ok: true })
  }))

  app.post('/api/projects/:projectId/copy', wrap(async (req, res) => {
    const sourceId = String(req.params.projectId)
    const source = store.getOrgSnapshot().projects.find((p) => p.id === sourceId)
    if (!source) return replyError(res, 404, 'project not found')
    const requested = (Array.isArray(req.body?.name) ? req.body.name[0] : req.body?.name ?? '').trim()
    const name = requested || `Copy of ${source.name}`
    const branch = await store.branchProject(sourceId, name)
    res.json({ ok: true, projectId: branch.projectId, name: branch.name, versionsCopied: branch.versionsCopied })
  }))

  app.post('/api/projects/:projectId/sections', wrap(async (req, res) => {
    const name = (Array.isArray(req.body?.name) ? req.body.name[0] : req.body?.name ?? '').trim()
    if (!name) return replyError(res, 400, 'section name is required')
    const sectionId = await store.createSection(String(req.params.projectId), name)
    res.json({ ok: true, sectionId })
  }))

  // ---- file download ----------------------------------------------------------------

  app.get(
    '/api/projects/:projectId/parts/:partId/versions/:versionId/file',
    wrap(async (req, res) => {
      const projectId = String(req.params.projectId)
      const partId = String(req.params.partId)
      const versionId = String(req.params.versionId)
      const part = store.getPart(partId)
      if (!part || part.projectId !== projectId) return replyError(res, 404, 'part not found')
      const version = store.getVersionInfo(partId, versionId)
      if (!version) return replyError(res, 404, 'version not found')
      const rel = store.versionRelPath(part.sectionId, partId, versionId, extOf(version.fileName))
      const abs = path.join(store.projectRepoDir(projectId), rel)
      res.setHeader('Content-Disposition', `inline; filename="${version.fileName}"`)
      res.setHeader('Content-Type', 'application/octet-stream')
      // Org data lives under ~/.config/... which contains a dotfile segment;
      // without this, send() 404s every download as a "dotfile".
      res.sendFile(abs, { dotfiles: 'allow' })
    })
  )

  // ---- part record edits ---------------------------------------------------------------

  app.post('/api/parts/:partId/head', wrap(async (req, res) => {
    await store.setHead(String(req.params.partId), String(req.body?.versionId ?? ''))
    res.json({ ok: true })
  }))

  app.put('/api/parts/:partId/status', wrap(async (req, res) => {
    const status = (Array.isArray(req.body?.workStatus) ? req.body.workStatus[0] : req.body?.workStatus ?? '') as WorkStatus
    if (!['red', 'yellow', 'green'].includes(status))
      return replyError(res, 400, 'workStatus must be red|yellow|green')
    await store.setWorkStatus(String(req.params.partId), status)
    res.json({ ok: true })
  }))

  app.post('/api/parts/:partId/parent', wrap(async (req, res) => {
    const parentId = req.body?.parentId ? String(req.body.parentId) : null
    await store.setParent(String(req.params.partId), parentId)
    res.json({ ok: true })
  }))

  app.patch('/api/parts/:partId/name', wrap(async (req, res) => {
    const name = (Array.isArray(req.body?.name) ? req.body.name[0] : req.body?.name ?? '').trim()
    if (!name) return replyError(res, 400, 'name is required')
    await store.setPartName(String(req.params.partId), name)
    res.json({ ok: true })
  }))

  // ---- throw a file in ----------------------------------------------------------------

  const ingest = async (req: Request, res: Response, opts: {
    projectId: string
    sectionId: string
    existingPartId: string | null
  }): Promise<void> => {
    const file = req.file
    if (!file) return replyError(res, 400, 'no file received')
    try {
      const sha1 = await sha1File(file.path)
      const size = file.size
      const ext = extOf(file.originalname ?? '')
      const fileName = file.originalname
      const by = userName(req)

      // DB rows + file bytes + git commit happen atomically inside one enqueue.
      const result = await store.enqueue(async () => {
        let stamped: VersionInfo
        // Re-throwing the exact same object → new version of the existing part.
        const found = store.rawFindPartBySha1(sha1)
        if (found && found.projectId === opts.projectId) {
          stamped = store.rawAddVersion({ partId: found.partId, fileName, ext, sha1, size, by })
          store.rawSetHead(found.partId, stamped.id)
        } else if (opts.existingPartId) {
          stamped = store.rawAddVersion({ partId: opts.existingPartId, fileName, ext, sha1, size, by })
          store.rawSetHead(opts.existingPartId, stamped.id)
        } else {
          stamped = store.rawIngestNewPart({
            projectId: opts.projectId,
            sectionId: opts.sectionId,
            fileName,
            ext,
            sha1,
            size,
            by,
            parentId: parentIdOrNull(req)
          })
        }
        const part = store.getPart(stamped.partId)
        if (!part) throw new Error('part vanished after write')

        // Move bytes into the project's versioned git tree.
        const repo = store.projectRepo(part.projectId)
        await repo.ensureInit()
        const rel = store.versionRelPath(part.sectionId, part.id, stamped.id, ext)
        const abs = path.join(store.projectRepoDir(part.projectId), rel)
        await mkdir(path.dirname(abs), { recursive: true })
        await copyFile(file.path, abs)
        await repo.commitAll(`Save a version of ${part.name}`)
        return { part: store.getPart(stamped.partId)!, version: stamped }
      })

      res.json({ ok: true, part: result.part, versionId: result.version.id })
    } catch (err) {
      replyError(res, 500, err instanceof Error ? err.message : String(err))
    } finally {
      unlink(file.path).catch(() => undefined)
    }
  }

  app.post('/api/upload', upload.single('file'), wrap(async (req, res) => {
    const projectId = (Array.isArray(req.body?.projectId) ? req.body.projectId[0] : req.body?.projectId ?? '')
    const sectionId = (Array.isArray(req.body?.sectionId) ? req.body.sectionId[0] : req.body?.sectionId ?? '')
    if (!projectId || !sectionId) return replyError(res, 400, 'projectId and sectionId are required')
    await ingest(req, res, { projectId, sectionId, existingPartId: null })
  }))

  app.post('/api/projects/:projectId/parts/:partId/versions', upload.single('file'), wrap(async (req, res) => {
    const projectId = String(req.params.projectId)
    const partId = String(req.params.partId)
    const part = store.getPart(partId)
    if (!part || part.projectId !== projectId) return replyError(res, 404, 'part not found')
    await ingest(req, res, { projectId, sectionId: part.sectionId, existingPartId: partId })
  }))

  // ---- error handler ----------------------------------------------------------------

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    replyError(res, 500, err.message)
  })

  return app
}

function extOf(name: string): string {
  return path.extname(name).replace(/^\./, '').toLowerCase()
}

function parentIdOrNull(req: Request): string | null {
  const v = req.body?.parentId
  return v && v !== '' ? String(v) : null
}
