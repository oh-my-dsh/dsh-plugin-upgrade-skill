#!/usr/bin/env node
// quick-smoke.mjs —— 第 5 步（可选）：修完秒验。
//
// 纯内存模拟 Cordis 上下文，动态载入插件入口，验证模块能加载、
// apply 契约能执行、工具能注册。毫秒到秒级，不用真宿主。
//
// 诚实边界：冒烟通过 ≠ 宿主兼容。Mock 只覆盖 logger/tools/effect/on 等常见面，
// 真实 Cordis 的服务解析、依赖注入、生命周期全部不参与。
// 真冷启动验证用姊妹 skill 的 verify-runtime.mjs（隔离 profile 全链路）。
// 走 Proxy 兜底的属性会被记录进 mockFallbacks——它越多，本次结果可信度越低。

import fs from 'node:fs'
import path from 'node:path'
import { printJson } from './lib/scanner.mjs'

class MockContext {
  constructor() {
    this.services = new Map()
    this.tools = new Map()
    this.events = new Map()
    this.injectedList = []
    // 走 Proxy 兜底的属性名：插件摸到了 Mock 没有的宿主面，结果可信度要打折
    this.fallbackProps = new Set()

    this.provide('logger', {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    })

    const registeredTools = this.tools
    this.provide('tools', {
      register: (toolDef) => {
        if (toolDef && toolDef.name) registeredTools.set(toolDef.name, toolDef)
      },
      add: (toolDef) => {
        if (toolDef && toolDef.name) registeredTools.set(toolDef.name, toolDef)
      },
      get: (name) => registeredTools.get(name),
      list: () => Array.from(registeredTools.values()),
    })

    this.scope = {
      disposables: [],
      isActive: true,
      update: () => {},
      dispose: () => {},
    }

    // 兜底代理：未知属性给安全空函数，但记录下来，不假装宿主真的提供了它
    const makeFallback = () =>
      new Proxy(function () {}, {
        get: (target, prop) => {
          // await 会探测 then；返回 undefined 避免被当 thenable 挂起
          if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
          if (prop === Symbol.toPrimitive) return () => ''
          return makeFallback()
        },
        apply: () => makeFallback(),
      })

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target) return Reflect.get(target, prop, receiver)
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
        if (target.services.has(prop)) return target.services.get(prop)
        if (target.fallbackProps) target.fallbackProps.add(String(prop))
        if (prop === 'effect') {
          return (cb) => {
            if (typeof cb === 'function') {
              try { return cb() } catch {}
            }
          }
        }
        if (['bail', 'waterfall', 'serial', 'parallel'].includes(prop)) {
          return (event, ...args) => target.emit(event, ...args)
        }
        return makeFallback()
      },
    })
  }

  provide(name, value) {
    this.services.set(name, value)
    this[name] = value
  }

  get(name) {
    return this.services.get(name) || null
  }

  on(event, handler) {
    if (!this.events.has(event)) this.events.set(event, [])
    this.events.get(event).push(handler)
    return () => {
      const list = this.events.get(event)
      if (list) {
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      }
    }
  }

  emit(event, ...args) {
    const list = this.events.get(event)
    if (list) for (const h of list) h(...args)
  }
}

export async function runQuickSmoke(pluginRoot) {
  const root = path.resolve(pluginRoot)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`找不到 package.json: ${pkgPath}`)
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const entryFile = pkg.main || 'lib/index.js'
  const entryPath = path.join(root, entryFile)

  if (!fs.existsSync(entryPath)) {
    return {
      success: false,
      stage: 'entry_resolution',
      error: `入口文件不存在: ${entryFile}。请先构建 (pnpm run build)`,
    }
  }

  const ctx = new MockContext()
  const startTime = Date.now()

  try {
    // cache-busting：同一进程内多次冒烟不读 ESM 缓存
    const mod = await import(`file://${entryPath}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`)
    const pluginTarget = mod.default || mod

    if (pluginTarget.inject) {
      ctx.injectedList = Array.isArray(pluginTarget.inject) ? pluginTarget.inject : Object.keys(pluginTarget.inject)
    }

    if (typeof pluginTarget.apply === 'function') {
      await pluginTarget.apply(ctx, {})
    } else if (typeof pluginTarget === 'function') {
      await pluginTarget(ctx, {})
    } else {
      return {
        success: false,
        stage: 'activation',
        error: `入口模块既未导出 apply 函数，也非函数式插件。导出类型: ${typeof pluginTarget}`,
        pkgName: pkg.name,
        version: pkg.version,
        entry: entryFile,
      }
    }

    // ctx.tools 在 provide() 后是服务对象不是 Map；真身是闭包里的 Map，经 list() 读
    const registered = ctx.services.get('tools')?.list() || []
    return {
      success: true,
      durationMs: Date.now() - startTime,
      pkgName: pkg.name,
      version: pkg.version,
      entry: entryFile,
      injectedServices: ctx.injectedList,
      registeredToolsCount: registered.length,
      registeredTools: registered.map((t) => t.name).filter(Boolean),
      // 兜底属性越多，Mock 与真实宿主的差距越大，结果越只能当「不崩」证据
      mockFallbacks: Array.from(ctx.fallbackProps).sort(),
      caveat: '冒烟通过 ≠ 宿主兼容；真冷启动验证用 plugin-upgrade 的 verify-runtime.mjs',
    }
  } catch (err) {
    return {
      success: false,
      stage: 'runtime_execution',
      error: err.stack || err.message,
      pkgName: pkg.name,
      version: pkg.version,
      entry: entryFile,
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const targetDir = process.argv[2] || process.cwd()

  runQuickSmoke(targetDir)
    .then((result) => {
      printJson(result)
      if (result.success) {
        process.stderr.write(
          `\n[冒烟通过] ${result.pkgName}@${result.version} 耗时 ${result.durationMs}ms\n` +
          `  注册工具: ${result.registeredToolsCount} 个${result.registeredTools.length ? ` (${result.registeredTools.join(', ')})` : ''}\n` +
          `  声明注入: [${result.injectedServices.join(', ')}]\n` +
          (result.mockFallbacks.length ? `  Mock 兜底属性: ${result.mockFallbacks.join(', ')}（这些面未被验证）\n` : '') +
          `  边界: ${result.caveat}\n`
        )
        process.exit(0)
      }
      process.stderr.write(`\n[冒烟失败] 阶段: ${result.stage}\n  ${result.error}\n`)
      process.exit(1)
    })
    .catch((err) => {
      process.stderr.write(`执行异常: ${err.message}\n`)
      process.exit(1)
    })
}
