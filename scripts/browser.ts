import { Launcher } from 'chrome-launcher'

interface BrowserDiscovery {
  which(command: string): string | null
  installations(): string[]
}

const systemDiscovery: BrowserDiscovery = {
  which: (command) => Bun.which(command),
  installations: () => Launcher.getInstallations(),
}

export function browserExecutable(
  configured = process.env.BROWSER_EXECUTABLE,
  discovery = systemDiscovery,
) {
  const override = configured?.trim()
  if (override) {
    const executable = discovery.which(override)
    if (!executable) throw new Error('BROWSER_EXECUTABLE must name an executable command or file.')
    return executable
  }
  for (const command of [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
    'msedge',
  ]) {
    const executable = discovery.which(command)
    if (executable) return executable
  }
  let installed: string[] = []
  try {
    installed = discovery.installations()
  } catch {}
  for (const candidate of installed) {
    const executable = discovery.which(candidate)
    if (executable) return executable
  }
  throw new Error(
    'Install Chrome or Chromium, or set BROWSER_EXECUTABLE to an executable command or path.',
  )
}
