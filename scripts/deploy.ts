import { deploy, help, parseOptions } from './lib/deployment.ts'

const args = process.argv.slice(2)
if (args.includes('--help')) console.log(help)
else {
  try {
    await deploy(parseOptions(args))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
