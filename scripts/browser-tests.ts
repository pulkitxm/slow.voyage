import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const offline = process.argv.includes('--offline')
const argumentsToForward = process.argv.slice(2).filter((argument) => argument !== '--offline')
const tests = offline
  ? ['tests/offline.test.ts']
  : [
      'tests/browser.test.ts',
      'tests/driving.test.ts',
      'tests/controller-mapping.test.ts',
      'tests/graphics.test.ts',
    ]
const root = resolve('.review/tmp')
await mkdir(root, { recursive: true })
const scratch = await mkdtemp(resolve(root, 'browser-tests-'))
const child = Bun.spawn([process.execPath, 'test', ...tests, ...argumentsToForward], {
  env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch },
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
})
const interrupt = () => child.kill('SIGINT')
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
const code = await child.exited
process.off('SIGINT', interrupt)
process.off('SIGTERM', interrupt)
if (code === 0) await rm(scratch, { recursive: true, force: true })
else console.error(`Browser scratch retained: ${relative(process.cwd(), scratch)}`)
process.exitCode = code
