import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
export type Target =
  'all' | 'stack' | 'backend' | 'workflow' | 'transcoder' | 'frontend' | 'build-sam'
export type DeployOptions = {
  target: Target
  stackName: string
  region: string
  dryRun: boolean
  guided: boolean
  parameterOverrides: string[]
}
export type RunOptions = {
  capture?: boolean
  env?: NodeJS.ProcessEnv
  /** Written to the child's stdin; never logged. */
  input?: string
}
export interface Runner {
  run(command: string, args: string[], options?: RunOptions): Promise<string>
}

export const help = `Usage: node scripts/deploy.ts <all|stack|backend|workflow|transcoder|frontend|build-sam> [options]

  --stack-name <name>          CloudFormation stack (default: cloudcast)
  --region <region>            AWS region (default: us-west-2)
  --guided                    Run a guided SAM deployment
  --parameter-overrides <...>  Forward parameter assignments to SAM
  --dry-run                   Print commands without running them
  --help                      Show this help

AWS profile is always personal. Backend and workflow commands deploy the shared
SAM stack. The transcoder target builds the ffmpeg image with Docker and pushes
it to the stack's ECR repository. The all target deploys the stack, then the
transcoder image, then the frontend.
`

const targets: Target[] = [
  'all',
  'stack',
  'backend',
  'workflow',
  'transcoder',
  'frontend',
  'build-sam',
]
export function parseOptions(args: string[]): DeployOptions {
  const target = args[0]
  if (!targets.includes(target as Target)) {
    throw new Error(`Unknown deployment target: ${target || '(missing)'}`)
  }
  const options: DeployOptions = {
    target: target as Target,
    stackName: 'cloudcast',
    region: 'us-west-2',
    dryRun: false,
    guided: false,
    parameterOverrides: [],
  }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--guided') options.guided = true
    else if (arg === '--stack-name' || arg === '--region') {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
      if (arg === '--stack-name') options.stackName = value
      else options.region = value
    } else if (arg === '--parameter-overrides') {
      const start = i + 1
      while (args[i + 1] && !args[i + 1].startsWith('--'))
        options.parameterOverrides.push(args[++i])
      if (i < start) throw new Error('Missing values for --parameter-overrides')
    } else throw new Error(`Unknown option: ${arg}`)
  }
  if (
    ['transcoder', 'frontend', 'build-sam'].includes(options.target) &&
    (options.guided || options.parameterOverrides.length)
  ) {
    throw new Error('--guided and --parameter-overrides apply only to SAM deployment')
  }
  return options
}

export function createRunner(dryRun: boolean): Runner {
  return {
    run(command, args, options = {}) {
      // Arguments are always passed directly to spawn, never evaluated by a shell.
      console.log(
        [command, ...args]
          .map((value) => (/\s/.test(value) ? JSON.stringify(value) : value))
          .join(' '),
      )
      if (dryRun) return Promise.resolve('')
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: projectRoot,
          env: { ...process.env, ...options.env, AWS_PROFILE: 'personal' },
          stdio: [
            options.input == null ? 'inherit' : 'pipe',
            options.capture ? 'pipe' : 'inherit',
            'inherit',
          ],
        })
        child.stdin?.end(options.input)
        let output = ''
        child.stdout?.setEncoding('utf8').on('data', (chunk) => {
          output += chunk
        })
        child.once('error', (error) =>
          reject(new Error(`Unable to run ${command}: ${error.message}`, { cause: error })),
        )
        child.once('close', (code, signal) => {
          if (code === 0) resolve(output)
          else reject(new Error(`${command} failed (${signal || `exit ${code}`})`))
        })
      })
    },
  }
}

function awsArgs(options: DeployOptions, args: string[]): string[] {
  return [...args, '--profile', 'personal', '--region', options.region, '--no-cli-pager']
}
async function buildStack(options: DeployOptions, runner: Runner) {
  await runner.run('pnpm', ['build:backend'])
  await runner.run('sam', ['build', '--profile', 'personal', '--region', options.region])
}
async function deployStack(options: DeployOptions, runner: Runner) {
  await buildStack(options, runner)
  const args = [
    'deploy',
    '--profile',
    'personal',
    '--region',
    options.region,
    '--stack-name',
    options.stackName,
    '--no-fail-on-empty-changeset',
  ]
  if (options.guided) args.push('--guided')
  if (options.parameterOverrides.length)
    args.push('--parameter-overrides', ...options.parameterOverrides)
  await runner.run('sam', args)
}

const requiredOutputs = [
  'APIGatewayEndpoint',
  'FrontendCloudFrontDistributionId',
  'FrontendCloudFrontDistributionDomainName',
  'FrontendBucketName',
  'UserPoolId',
  'UserPoolClientId',
] as const
export type StackOutputs = Record<(typeof requiredOutputs)[number], string>
export function parseStackOutputs<K extends string = (typeof requiredOutputs)[number]>(
  json: string,
  required: readonly K[] = requiredOutputs as readonly string[] as readonly K[],
): Record<K, string> {
  const data = JSON.parse(json) as {
    Stacks?: { Outputs?: { OutputKey: string; OutputValue: string }[] }[]
  }
  const outputs = Object.fromEntries(
    (data.Stacks?.[0]?.Outputs || []).map((output) => [output.OutputKey, output.OutputValue]),
  )
  for (const key of required)
    if (!outputs[key]) throw new Error(`Stack output ${key} is missing; deploy the SAM stack first`)
  return outputs as Record<K, string>
}
async function readStackOutputs<K extends string>(
  options: DeployOptions,
  runner: Runner,
  required: readonly K[],
): Promise<Record<K, string>> {
  const json = await runner.run(
    'aws',
    awsArgs(options, [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      options.stackName,
      '--output',
      'json',
    ]),
    { capture: true },
  )
  return options.dryRun
    ? (Object.fromEntries(required.map((key) => [key, `<${key}>`])) as Record<K, string>)
    : parseStackOutputs(json, required)
}
async function deployTranscoder(options: DeployOptions, runner: Runner) {
  await runner.run('pnpm', ['--filter', 'transcoder', 'build'])
  const { TranscoderRepositoryUri: repository } = await readStackOutputs(options, runner, [
    'TranscoderRepositoryUri',
  ] as const)
  const password = await runner.run('aws', awsArgs(options, ['ecr', 'get-login-password']), {
    capture: true,
  })
  await runner.run(
    'docker',
    ['login', '--username', 'AWS', '--password-stdin', repository.split('/')[0]],
    { input: password.trim() },
  )
  // The task definition runs x86_64 and always pulls `latest`.
  const image = `${repository}:latest`
  await runner.run('docker', ['build', '--platform', 'linux/amd64', '-t', image, 'transcoder'])
  await runner.run('docker', ['push', image])
}
async function deployFrontend(options: DeployOptions, runner: Runner) {
  const outputs = await readStackOutputs(options, runner, requiredOutputs)
  // Vite gives process environment precedence over .env.production. Keep local files intact.
  await runner.run('pnpm', ['--filter', 'frontend', 'build'], {
    env: {
      VITE_API_BASE_URL: outputs.APIGatewayEndpoint,
      VITE_COGNITO_USER_POOL_ID: outputs.UserPoolId,
      VITE_COGNITO_CLIENT_ID: outputs.UserPoolClientId,
    },
  })
  await runner.run(
    'aws',
    awsArgs(options, [
      's3',
      'sync',
      'frontend/dist/',
      `s3://${outputs.FrontendBucketName}/`,
      '--delete',
    ]),
  )
  const invalidation = await runner.run(
    'aws',
    awsArgs(options, [
      'cloudfront',
      'create-invalidation',
      '--distribution-id',
      outputs.FrontendCloudFrontDistributionId,
      '--paths',
      '/*',
      '--query',
      'Invalidation.Id',
      '--output',
      'text',
    ]),
    { capture: true },
  )
  const invalidationId = options.dryRun ? '<InvalidationId>' : invalidation.trim()
  if (!invalidationId || invalidationId === 'None')
    throw new Error('CloudFront did not return an invalidation ID')
  await runner.run(
    'aws',
    awsArgs(options, [
      'cloudfront',
      'wait',
      'invalidation-completed',
      '--distribution-id',
      outputs.FrontendCloudFrontDistributionId,
      '--id',
      invalidationId,
    ]),
  )
  console.log(
    `${options.dryRun ? 'Frontend URL after deployment' : 'Frontend deployed'}: https://${outputs.FrontendCloudFrontDistributionDomainName}`,
  )
}

export async function deploy(
  options: DeployOptions,
  runner: Runner = createRunner(options.dryRun),
) {
  if (options.target === 'build-sam') return buildStack(options, runner)
  console.log(
    `${options.dryRun ? 'Previewing' : 'Deploying'} ${options.target}: stack ${options.stackName}, region ${options.region}, profile personal`,
  )
  if (!['transcoder', 'frontend'].includes(options.target)) await deployStack(options, runner)
  if (options.target === 'all' || options.target === 'transcoder')
    await deployTranscoder(options, runner)
  if (options.target === 'all' || options.target === 'frontend')
    await deployFrontend(options, runner)
}
