import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import compression from 'compression'
import cors from 'cors'
import multer from 'multer'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import { Storage } from '@google-cloud/storage'
import mime from 'mime'
import { nanoid } from 'nanoid'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const password = process.env.ACCESS_PASSWORD || 'howsmumu'
const sessionSecret = process.env.SESSION_SECRET || 'change-me-session-secret'
const projectId = process.env.GCP_PROJECT || 'dwtlung'
const bucketName = process.env.GCS_BUCKET || 'dwtlung'
const bucketPrefix = normalizePrefix(process.env.GCS_PREFIX || 'howsmumu/')
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'
const maxFileSizeBytes = 100 * 1024 * 1024 // 100MB

const storage = new Storage({ projectId })
const bucket = storage.bucket(bucketName)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeBytes }
})

app.use(helmet())
app.use(morgan('dev'))
app.use(express.json())
app.use(cookieParser())
app.use(compression())
app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
)

function normalizePrefix (prefix) {
  if (!prefix) return ''
  if (!prefix.endsWith('/')) return `${prefix}/`
  return prefix
}

function buildAuthToken () {
  return crypto.createHash('sha256').update(`${sessionSecret}:${password}`).digest('hex')
}

function authMiddleware (req, res, next) {
  const token = req.cookies.auth_token
  if (token && token === buildAuthToken()) {
    return next()
  }
  return res.status(401).json({ error: 'Unauthorized' })
}

app.post('/auth/login', (req, res) => {
  const { password: input } = req.body || {}
  if (input !== password) {
    return res.status(401).json({ error: 'Invalid password' })
  }
  const token = buildAuthToken()
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true'
  })
  return res.json({ ok: true })
})

app.post('/auth/logout', (req, res) => {
  res.clearCookie('auth_token')
  res.json({ ok: true })
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/files', authMiddleware, async (_req, res) => {
  try {
    const [files] = await bucket.getFiles({ prefix: bucketPrefix })
    const items = files
      .filter(file => file.name !== bucketPrefix && !file.name.endsWith('/'))
      .map(file => {
        const nameWithoutPrefix = file.name.replace(bucketPrefix, '')
        const originalName = decodeFilename(file.metadata?.metadata?.originalName || nameWithoutPrefix)
        return {
          id: file.id || nanoid(8),
          name: originalName,
          path: nameWithoutPrefix,
          size: Number(file.metadata?.size || 0),
          updated: file.metadata?.updated || file.metadata?.timeCreated
        }
      })
    res.json({ files: items })
  } catch (err) {
    console.error('List error', err)
    res.status(500).json({ error: 'Failed to list files' })
  }
})

app.post('/api/files', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  const file = req.file
  const originalName = decodeFilename(file.originalname)
  const safeName = sanitizeFilename(originalName)
  const objectName = `${bucketPrefix}${safeName}`
  const contentType = file.mimetype || mime.getType(safeName) || 'application/octet-stream'

  try {
    const blob = bucket.file(objectName)
    const stream = blob.createWriteStream({
      resumable: false,
      contentType,
      metadata: {
        metadata: {
          originalName
        }
      }
    })

    stream.on('error', (err) => {
      console.error('Upload stream error', err)
      res.status(500).json({ error: 'Upload failed' })
    })

    stream.on('finish', () => {
      res.status(201).json({ ok: true, name: file.originalname })
    })

    stream.end(file.buffer)
  } catch (err) {
    console.error('Upload error', err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

app.get('/api/files/:fileName', authMiddleware, async (req, res) => {
  const fileName = req.params.fileName
  const filePath = `${bucketPrefix}${fileName}`
  const file = bucket.file(filePath)
  try {
    const [exists] = await file.exists()
    if (!exists) {
      return res.status(404).json({ error: 'File not found' })
    }
    const [metadata] = await file.getMetadata()
    const downloadName = decodeFilename(metadata?.metadata?.originalName || fileName)
    res.setHeader('Content-Type', metadata.contentType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    file.createReadStream().on('error', (err) => {
      console.error('Download stream error', err)
      res.status(500).json({ error: 'Download failed' })
    }).pipe(res)
  } catch (err) {
    console.error('Download error', err)
    res.status(500).json({ error: 'Download failed' })
  }
})

app.delete('/api/files/:fileName', authMiddleware, async (req, res) => {
  const fileName = req.params.fileName
  const filePath = `${bucketPrefix}${fileName}`
  const file = bucket.file(filePath)
  try {
    const [exists] = await file.exists()
    if (!exists) {
      return res.status(404).json({ error: 'File not found' })
    }
    await file.delete()
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete error', err)
    res.status(500).json({ error: 'Delete failed' })
  }
})

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large (max 100MB)' })
    }
    return res.status(400).json({ error: err.message })
  }
  console.error('Unhandled error', err)
  res.status(500).json({ error: 'Server error' })
})

const distPath = path.resolve('frontend', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})

function sanitizeFilename (name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function decodeFilename (name) {
  // Convert latin1-encoded UTF-8 to a proper UTF-8 string while keeping valid Unicode intact.
  try {
    if (!name) return name
    const isLatin1 = Array.from(name).every((char) => char.charCodeAt(0) <= 0xff)
    if (!isLatin1) return name
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    return decoded.includes('\uFFFD') ? name : decoded
  } catch (e) {
    return name
  }
}
