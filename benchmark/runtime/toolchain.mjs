// Keep the source-side migration control on its release-era Cordis contract.
// A fresh unqualified rc.2 install currently resolves incompatible newer vendor
// APIs; this is not evidence that such an install is healthy today.
// Versions: https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2/vendor
export const historicalVendorPins = {
  '0.1.1-rc.2': {
    '@deepseek-ai/cordis': '4.0.1',
    '@deepseek-ai/cosmokit': '1.8.2',
    '@deepseek-ai/cordis-plugin-group': '1.0.1',
    '@deepseek-ai/cordis-plugin-hmr': '1.0.16',
    '@deepseek-ai/cordis-plugin-include': '1.0.6',
    '@deepseek-ai/cordis-plugin-loader': '1.0.2',
    '@deepseek-ai/cordis-plugin-logger-console': '1.0.1',
    '@deepseek-ai/schemastery': '3.18.1',
    '@deepseek-ai/cordis-plugin-timer': '1.1.3',
    // Loader's optional peer must be visible beside its global installation.
    // This is the same resolver version used by the current rc.2 CLI install.
    'node-addon-require-builtin': '0.1.7',
  },
}

// Top-level pins alone are insufficient: npm may retain nested newer copies.
export function validatePinnedTree(tree, expected) {
  if (!tree || typeof tree !== 'object') throw new Error('toolchain dependency tree is missing')
  for (const [name, version] of Object.entries(expected)) {
    if (!Object.hasOwn(tree.dependencies ?? {}, name)) {
      throw new Error(`toolchain is missing top-level ${name}@${version}`)
    }
  }
  function visit(node, path) {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      const location = `${path} > ${name}`
      if (Object.hasOwn(expected, name)) {
        if (child.version !== expected[name]) {
          throw new Error(`${location}: resolved ${child.version ?? 'missing'}, expected ${expected[name]}`)
        }
      }
      visit(child, location)
    }
  }
  visit(tree, 'toolchain')
}
