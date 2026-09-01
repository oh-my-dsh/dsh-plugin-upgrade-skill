import { spawn, type SpawnOptions } from 'node:child_process'

/** Build the exact cmd.exe argument vector required to execute a trusted .cmd shim. */
export function windowsCmdShimArgs(binary: string, args: readonly string[]): string[] {
  const unsafe = /[&|<>"'`%!\n\r\0]/
  if (/["%\n\r\0]/.test(binary) || args.some(arg => unsafe.test(arg))) {
    throw new Error('doctor: unsafe Windows command argument')
  }
  const commandLine = '""' + binary + '" ' + args.map(arg => '"' + arg + '"').join(' ') + '"'
  return ['/d', '/s', '/c', commandLine]
}

export interface DshSpawnSpec {
  command: string
  args: string[]
  windowsVerbatimArguments?: boolean
}

/** Return a platform-specific command without enabling general shell parsing. */
export function dshSpawnSpec(binary: string, args: readonly string[], platform: NodeJS.Platform = process.platform): DshSpawnSpec {
  if (platform === 'win32') {
    if (binary.toLowerCase().endsWith('.cmd') || binary.toLowerCase().endsWith('.bat')) {
      return { command: 'cmd.exe', args: windowsCmdShimArgs(binary, args), windowsVerbatimArguments: true }
    }
    if (binary.toLowerCase().endsWith('.js') || binary.toLowerCase().endsWith('.mjs') || binary.toLowerCase().endsWith('.cjs')) {
      return { command: process.execPath, args: [binary, ...args] }
    }
  }
  return { command: binary, args: [...args] }
}

/** Spawn the official DSH CLI, including the Windows .cmd shim path. */
export function spawnDsh(binary: string, args: readonly string[], options: Pick<SpawnOptions, 'env' | 'stdio'>, platform: NodeJS.Platform = process.platform) {
  const spec = dshSpawnSpec(binary, args, platform)
  return spawn(spec.command, spec.args, {
    ...options,
    ...(spec.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
  })
}
