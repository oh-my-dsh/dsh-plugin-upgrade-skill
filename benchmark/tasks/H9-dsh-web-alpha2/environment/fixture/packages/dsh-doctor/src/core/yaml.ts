/**
 * YAML engine wrapper for the DSH patch-list dialect.
 *
 * The DSH entry-list dialect is YAML with a custom '!!js' scalar type whose
 * scalars round-trip as unevaluated expression nodes. This module provides a
 * load/stringify pair with that exact dialect so parsing, fingerprints, and
 * plan rewrites never drift from what the DSH loader accepts.
 *
 * js-yaml is resolved lazily through an injectable loader so tests and other
 * embedding environments can supply any module with a compatible interface.
 */
import { createRequire } from 'node:module'

/** Minimal js-yaml surface the engine needs. */
export interface YamlModule {
  load(text: string, options?: Record<string, unknown>): unknown
  dump(value: unknown, options?: Record<string, unknown>): string
}

/** The engine's parse/stringify contract. */
export interface YamlEngine {
  parse(text: string): unknown
  stringify(value: unknown): string
  source: string
}

export class YamlEngineError extends Error {
  readonly path: string
  constructor(message: string, path = '<text>') {
    super(message)
    this.name = 'YamlEngineError'
    this.path = path
  }
}

const DEFAULT_LOADER: (id: string) => YamlModule = (id) => {
  const require = createRequire(import.meta.url)
  return require(id as never) as YamlModule
}

/** Build a YamlEngine over a js-yaml-compatible module. */
export function createYamlEngine(loader: (id: string) => YamlModule = DEFAULT_LOADER, source = 'js-yaml'): YamlEngine {
  let module: YamlModule | undefined
  const getModule = (): YamlModule => {
    if (module !== undefined) return module
    try {
      module = loader('js-yaml')
    } catch (error) {
      throw new YamlEngineError('cannot load js-yaml: ' + String(error))
    }
    return module
  }

  return {
    source,
    parse(text: string): unknown {
      const yaml = getModule()
      try {
        return yaml.load(text, { schema: entryListSchemaOf(yaml) })
      } catch (error) {
        throw new YamlEngineError('failed to parse YAML: ' + String(error))
      }
    },
    stringify(value: unknown): string {
      const yaml = getModule()
      try {
        return yaml.dump(value, {
          schema: entryListSchemaOf(yaml),
          sortKeys: true,
          noRefs: true,
          lineWidth: -1,
        })
      } catch (error) {
        throw new YamlEngineError('failed to dump YAML: ' + String(error))
      }
    },
  }
}

/** The JsExpr tag singleton per loaded module. */
let jsExprTagOf: WeakMap<YamlModule, unknown> | undefined

function entryListSchemaOf(yaml: YamlModule): unknown {
  if (jsExprTagOf === undefined) jsExprTagOf = new WeakMap()
  const cached = jsExprTagOf.get(yaml)
  if (cached !== undefined) return cached
  const yamlAny = yaml as unknown as Record<string, unknown>
  const typeCtor = yamlAny.Type as unknown as new (tag: string, options: Record<string, unknown>) => unknown
  const jsExpr = new typeCtor('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: (data: unknown) => typeof data === 'string',
    construct: (data: unknown) => ({ __jsExpr: data }),
    represent: (node: unknown) => (node as { __jsExpr?: unknown }).__jsExpr,
  })
  const schema = (yamlAny.JSON_SCHEMA as { extend?: (type: unknown) => unknown }).extend?.(jsExpr)
  if (schema === undefined) throw new YamlEngineError('js-yaml JSON_SCHEMA.extend is unavailable')
  jsExprTagOf.set(yaml, schema as never)
  return schema
}

/** Parse a patch-list document (top-level YAML array of patch entries). */
export function parseEntryList(text: string, engine: YamlEngine, label: string): unknown[] {
  let parsed: unknown
  try {
    parsed = engine.parse(text)
  } catch (error) {
    throw new YamlEngineError('failed to parse ' + label + ': ' + String(error))
  }
  if (parsed === null) return []
  if (!Array.isArray(parsed)) throw new YamlEngineError(label + ' must be a top-level YAML array', label)
  return parsed
}

