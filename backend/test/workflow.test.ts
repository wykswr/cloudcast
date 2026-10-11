import { readFileSync } from 'node:fs'
import jsonata from 'jsonata'
import { expect, it } from 'vitest'
import { manifestKey } from '../src/services/uploads'

const workflow = JSON.parse(readFileSync(new URL('../../tasks/workflow.asl.json', import.meta.url), 'utf8'))
const expression = workflow.States.MarkReady.Arguments.ExpressionAttributeValues[':hls'].S.slice(2, -2).trim()
it.each(['holiday.mp4', 'holiday.final.mp4', 'holiday', 'holiday.v1.final.mov', '.mp4'])('matches backend and deployed JSONata manifest naming for %s', async filename => {
  const key = `owner/video/raw/${filename}`
  expect(await jsonata(expression).evaluate({}, { userId: 'owner', videoId: 'video', key })).toBe(manifestKey('owner', 'video', key))
})
