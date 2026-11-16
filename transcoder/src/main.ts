import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readConfig, runJob } from './job'
import type { JobDeps } from './job'

const s3 = new S3Client({})

const deps: JobDeps = {
  async download(bucket, key, path) {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    await mkdir(dirname(path), { recursive: true })
    await pipeline(response.Body as Readable, createWriteStream(path))
  },
  exec(command, args, onLine) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] })
      let output = ''
      createInterface({ input: child.stdout }).on('line', (line) => {
        if (onLine) onLine(line)
        else output += `${line}\n`
      })
      child.once('error', reject)
      child.once('close', (code, signal) => {
        if (code === 0) resolve(output)
        else reject(new Error(`${command} failed (${signal || `exit ${code}`})`))
      })
    })
  },
  async listFiles(dir) {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
  },
  async upload(bucket, key, path, contentType) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: (await stat(path)).size,
        ContentType: contentType,
      }),
    )
  },
  log(message, details) {
    console.log(JSON.stringify({ message, ...details }))
  },
}

// Node runs as PID 1 in the container, where SIGTERM is ignored unless handled. Fargate sends
// it two minutes before reclaiming a Spot task.
process.on('SIGTERM', () => process.exit(143))

try {
  await runJob(readConfig(process.env, await mkdtemp(join(tmpdir(), 'transcode-'))), deps)
} catch (error) {
  deps.log('Transcode failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
}
