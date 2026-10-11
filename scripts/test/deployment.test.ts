import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRunner, deploy, parseOptions, parseStackOutputs, projectRoot } from '../lib/deployment.ts'
import type { Runner } from '../lib/deployment.ts'

const outputs = {
  APIGatewayEndpoint: 'https://api.example.com/dev/',
  FrontendBucketName: 'frontend-bucket',
  FrontendCloudFrontDistributionId: 'distribution',
  FrontendCloudFrontDistributionDomainName: 'frontend.example.com',
  UserPoolId: 'us-west-2_pool',
  UserPoolClientId: 'client',
}
const stackResponse = JSON.stringify({ Stacks: [{ Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue })) }] })
function runner() {
  return { run: vi.fn<Runner['run']>().mockImplementation(async (_command, args) => {
    if (args[0] === 'cloudformation') return stackResponse
    if (args[0] === 'cloudfront' && args[1] === 'create-invalidation') return 'invalidation\n'
    return ''
  }) }
}
afterEach(() => vi.restoreAllMocks())

describe('Node deployment tooling', () => {
  it('parses defaults and preserves parameter values as individual arguments', () => {
    expect(parseOptions(['all'])).toEqual({ target: 'all', stackName: 'cloudcast', region: 'us-west-2', dryRun: false, guided: false, parameterOverrides: [] })
    expect(parseOptions(['stack', '--parameter-overrides', 'Env=prod', 'CorsAllowOrigin=https://example.com/path with spaces', '--guided', '--stack-name', 'other', '--region', 'us-east-1', '--dry-run'])).toMatchObject({
      stackName: 'other', region: 'us-east-1', dryRun: true, guided: true,
      parameterOverrides: ['Env=prod', 'CorsAllowOrigin=https://example.com/path with spaces'],
    })
    expect(projectRoot.endsWith('/')).toBe(true)
  })
  it.each([[], ['unknown'], ['stack', '--profile', 'other'], ['stack', '--stack-name'], ['stack', '--region', '--dry-run'], ['stack', '--parameter-overrides'], ['frontend', '--guided'], ['build-sam', '--guided']].map(args => ({ args })))('rejects unsupported or incomplete arguments: $args', ({ args }) => {
    expect(() => parseOptions(args)).toThrow()
  })
  it.each(['stack', 'backend', 'workflow'])('deploys %s through the shared SAM stack after rebuilding', async target => {
    const commands = runner()
    await deploy(parseOptions([target, '--stack-name', 'custom', '--region', 'us-east-1', '--guided', '--parameter-overrides', 'Env=prod']), commands)
    expect(commands.run.mock.calls).toEqual([
      ['pnpm', ['build:backend']],
      ['sam', ['build', '--profile', 'personal', '--region', 'us-east-1']],
      ['sam', ['deploy', '--profile', 'personal', '--region', 'us-east-1', '--stack-name', 'custom', '--no-fail-on-empty-changeset', '--guided', '--parameter-overrides', 'Env=prod']],
    ])
  })
  it('build-sam rebuilds the Lambda and SAM artifacts without deploying', async () => {
    const commands = runner()
    await deploy(parseOptions(['build-sam']), commands)
    expect(commands.run.mock.calls.map(([command, args]) => [command, args[0]])).toEqual([['pnpm', 'build:backend'], ['sam', 'build']])
  })
  it('deploys frontend from one stack lookup, injects Vite config, then syncs and waits for invalidation', async () => {
    const commands = runner()
    await deploy(parseOptions(['frontend']), commands)
    expect(commands.run.mock.calls[0]).toEqual(['aws', ['cloudformation', 'describe-stacks', '--stack-name', 'cloudcast', '--output', 'json', '--profile', 'personal', '--region', 'us-west-2', '--no-cli-pager'], { capture: true }])
    expect(commands.run.mock.calls[1]).toEqual(['pnpm', ['--filter', 'frontend', 'build'], { env: {
      VITE_API_BASE_URL: outputs.APIGatewayEndpoint, VITE_COGNITO_USER_POOL_ID: outputs.UserPoolId, VITE_COGNITO_CLIENT_ID: outputs.UserPoolClientId,
    } }])
    expect(commands.run.mock.calls[2][1].slice(0, 5)).toEqual(['s3', 'sync', 'frontend/dist/', 's3://frontend-bucket/', '--delete'])
    expect(commands.run.mock.calls[3][1]).toContain('/*')
    expect(commands.run.mock.calls[4][1].slice(0, 7)).toEqual(['cloudfront', 'wait', 'invalidation-completed', '--distribution-id', 'distribution', '--id', 'invalidation'])
    for (const [command, args] of commands.run.mock.calls) {
      if (command === 'aws') {
        expect(args).toContain('personal')
        expect(args).toContain('us-west-2')
      }
    }
  })
  it('deploys the stack before retrieving frontend outputs in the all target', async () => {
    const commands = runner()
    await deploy(parseOptions(['all']), commands)
    expect(commands.run.mock.calls.map(([command, args]) => [command, args[0], args[1]])).toEqual([
      ['pnpm', 'build:backend', undefined], ['sam', 'build', '--profile'], ['sam', 'deploy', '--profile'],
      ['aws', 'cloudformation', 'describe-stacks'], ['pnpm', '--filter', 'frontend'], ['aws', 's3', 'sync'],
      ['aws', 'cloudfront', 'create-invalidation'], ['aws', 'cloudfront', 'wait'],
    ])
  })
  it('stops before frontend publication when the stack deployment fails', async () => {
    const commands = runner()
    commands.run.mockResolvedValueOnce('').mockResolvedValueOnce('').mockRejectedValueOnce(new Error('SAM failed'))
    await expect(deploy(parseOptions(['all']), commands)).rejects.toThrow('SAM failed')
    expect(commands.run).toHaveBeenCalledTimes(3)
  })
  it('stops before upload when stack outputs are missing or the frontend build fails', async () => {
    const commands = runner()
    commands.run.mockResolvedValueOnce('{}')
    await expect(deploy(parseOptions(['frontend']), commands)).rejects.toThrow('APIGatewayEndpoint')
    expect(commands.run).toHaveBeenCalledTimes(1)
    const failedBuild = runner()
    failedBuild.run.mockResolvedValueOnce(stackResponse).mockRejectedValueOnce(new Error('Build failed'))
    await expect(deploy(parseOptions(['frontend']), failedBuild)).rejects.toThrow('Build failed')
    expect(failedBuild.run).toHaveBeenCalledTimes(2)
  })
  it('stops before invalidation after an upload failure and rejects missing invalidation IDs', async () => {
    const commands = runner()
    commands.run.mockResolvedValueOnce(stackResponse).mockResolvedValueOnce('').mockRejectedValueOnce(new Error('S3 failed'))
    await expect(deploy(parseOptions(['frontend']), commands)).rejects.toThrow('S3 failed')
    expect(commands.run).toHaveBeenCalledTimes(3)
    const noId = runner()
    noId.run.mockResolvedValueOnce(stackResponse).mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('None')
    await expect(deploy(parseOptions(['frontend']), noId)).rejects.toThrow('invalidation ID')
    expect(noId.run).toHaveBeenCalledTimes(4)
  })
  it('checks required CloudFormation outputs', () => {
    expect(parseStackOutputs(stackResponse)).toEqual(outputs)
    expect(() => parseStackOutputs('{')).toThrow()
    expect(() => parseStackOutputs('{"Stacks":[]}')).toThrow('deploy the SAM stack first')
  })
  it('runs child processes at the repository root with profile personal and propagates failures', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const output = await createRunner(false).run(process.execPath, ['-e', "process.stdout.write(JSON.stringify([process.cwd(), process.env.AWS_PROFILE, process.env.VITE_API_BASE_URL]))"], {
      capture: true, env: { VITE_API_BASE_URL: 'test-api', AWS_PROFILE: 'other' },
    })
    expect(JSON.parse(output)).toEqual([projectRoot.replace(/\/$/, ''), 'personal', 'test-api'])
    await expect(createRunner(false).run(process.execPath, ['-e', 'process.exit(3)'])).rejects.toThrow('exit 3')
  })
  it('dry-run executes no child processes, including nonexistent commands', async () => {
    const logging = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await createRunner(true).run('nonexistent-cloudcast-command', [])).toBe('')
    await deploy(parseOptions(['all', '--dry-run']))
    expect(logging).toHaveBeenCalledWith(expect.stringContaining('s3://<FrontendBucketName>/'))
  })
})
