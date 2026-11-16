import { readFileSync } from 'node:fs'
import jsonata from 'jsonata'
import { expect, it } from 'vitest'
import { manifestKey } from '../src/services/uploads'

const workflow = JSON.parse(
  readFileSync(new URL('../../tasks/workflow.asl.json', import.meta.url), 'utf8'),
)
const markReadyKey: string = workflow.States.MarkReady.Arguments.ExpressionAttributeValues[':hls'].S
const expression = markReadyKey.slice(2, -2).trim()
const transcode = workflow.States.RunTranscode
it.each(['holiday.mp4', 'holiday.final.mp4', 'holiday', 'holiday.v1.final.mov', '.mp4'])(
  'matches backend and deployed JSONata manifest naming for %s',
  async (filename) => {
    const key = `owner/video/raw/${filename}`
    expect(await jsonata(expression).evaluate({}, { userId: 'owner', videoId: 'video', key })).toBe(
      manifestKey('owner', 'video', key),
    )
  },
)
it('tells the transcoder to write the same manifest key that MarkReady records', () => {
  const environment: { Name: string; Value: string }[] =
    transcode.Arguments.Overrides.ContainerOverrides[0].Environment
  expect(environment.find((variable) => variable.Name === 'MANIFEST_KEY')?.Value).toBe(markReadyKey)
})
it.each([
  // Spot reclaimed the task, or it never started: run it again on on-demand capacity.
  ['FARGATE_SPOT', 'States.TaskFailed', '{"StopCode":"SpotInterruption"}', true],
  ['FARGATE_SPOT', 'ECS.AmazonECSException', 'Capacity is unavailable at this time', true],
  ['FARGATE_SPOT', 'States.TaskFailed', undefined, true],
  // The transcode itself failed, timed out, or on-demand was already tried: give up.
  ['FARGATE_SPOT', 'States.TaskFailed', '{"StopCode":"EssentialContainerExited"}', false],
  ['FARGATE_SPOT', 'States.TaskFailed', 'Essential container in task exited', false],
  ['FARGATE_SPOT', 'States.Timeout', undefined, false],
  ['FARGATE', 'States.TaskFailed', '{"StopCode":"SpotInterruption"}', false],
])(
  'retries on on-demand capacity only for %s %s %s',
  async (capacityProvider, Error, Cause, retry) => {
    const condition: string = transcode.Catch[0].Assign.retryOnDemand
    expect(
      await jsonata(condition.slice(2, -2)).evaluate(
        {},
        { capacityProvider, states: { errorOutput: { Error, Cause } } },
      ),
    ).toBe(retry)
  },
)
