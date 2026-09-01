import type { UserConfig } from 'tsdown'
import { clientBundle } from '../../shared/tsdown.client.ts'

const cli: UserConfig = {
  name: '@linxin666/dsh-doctor/cli',
  entry: { cli: 'src/cli.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  banner: '#!/usr/bin/env node',
}

export default clientBundle('@linxin666/dsh-doctor', ['src/index.ts'], {
  companions: [cli],
  libExternal: ['@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-host-webserver'],
})
