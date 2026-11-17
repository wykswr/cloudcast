import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readConfig, runJob } from './job'
import type { JobDeps } from './job'

const s3 = new S3Client({})
// Progress writes are best-effort: fail fast rather than hang the job on a dead connection.
const dynamo = new DynamoDBClient({
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 3000, requestTimeout: 5000 },
})

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
    // A Buffer body, unlike a stream, can be resent, so the SDK retries transient S3 errors.
    // Segments are a few MB each, so holding UPLOAD_CONCURRENCY of them in memory is cheap.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(path),
        ContentType: contentType,
      }),
    )
  },
  async reportProgress(target, percent) {
    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: target.table,
          Key: { user_id: { S: target.userId }, id: { S: target.videoId } },
          UpdateExpression:
            percent === null ? 'REMOVE processing_percent' : 'SET processing_percent = :percent',
          // Never touch a video that was deleted, or that already finished or failed.
          ConditionExpression: '#status = :processing',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ...(percent === null ? {} : { ':percent': { N: String(percent) } }),
            ':processing': { S: 'processing' },
          },
        }),
      )
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error
    }
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
