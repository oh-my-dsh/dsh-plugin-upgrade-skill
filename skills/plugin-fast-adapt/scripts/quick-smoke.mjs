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
//
// 契约校验（2026-10-25 实测复盘）：Mock 此前对任何未知属性都返回兜底代理，
// 于是插件访问未声明 inject 的宿主服务（真 Cordis 直接抛
// `cannot get property "X" without inject`，装载即崩）时冒烟静默通过——
// 这正是历史 startup 日志里 `failed to register /llm-verifier rpc fallback:
// cannot get property "webServer" without inject` 那一类事故。现在按真契约判：
//   声明了 inject 的服务 Mock 没提供 → 兜底并披露（Mock 缺口，不是插件的错）
//   未声明的非内建属性         → 抛契约错（与真宿主同形，不再静默）

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { printJson } from './lib/scanner.mjs'

// Cordis 内建 mixin 属性（ReflectService 构造时混入 ctx，无需 inject）：
// reflect.get/set/provide/accessor/mixin、fiber.runtime/effect、registry.inject/plugin、
// events.on/once/parallel/emit/serial/bail/waterfall，外加 logger 与宿主注入的 scope。
// 判据取自 cordis/lib/index.js 的 ReflectService 构造与 LoggerService 装配（非臆造）。
// 这些面 Mock 未全真实现，但绝不能因「未声明 inject」误伤——它们本来就不需要 inject。
const BUILTIN_PROPS = new Set([
  'logger', 'scope',
  'get', 'set', 'provide', 'accessor', 'mixin',
  'runtime', 'inject', 'plugin',
  'on', 'once', 'emit',
  'reflect', 'fiber', 'registry', 'events',
])

class MockContext {
  constructor() {
    this.services = new Map()
    this.tools = new Map()
    this.events = new Map()
    this.injectedList = []
    // 走 Proxy 兜底的属性名：插件摸到了 Mock 没有的宿主面，结果可信度要打折
    this.fallbackProps = new Set()
    this._injectCache = null

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
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
        // effect 与事件方法：内建 mixin，无需 inject（target 上没有真身，按需造）
        if (prop === 'effect') {
          target.fallbackProps.add(String(prop))
          return (cb) => {
            if (typeof cb === 'function') {
              try { return cb() } catch {}
            }
          }
        }
        if (['bail', 'waterfall', 'serial', 'parallel'].includes(prop)) {
          target.fallbackProps.add(String(prop))
          return (event, ...args) => target.emit(event, ...args)
        }
        // 内建 mixin 面：真 Cordis 无需 inject 即可访问。Mock 未全真实现的面照旧兜底，
        // 不在这里造契约错（否则 dsh-ops 的 ctx.inject(...) 会以 not a function 假失败）。
        if (BUILTIN_PROPS.has(prop)) {
          if (prop in target) return Reflect.get(target, prop, receiver)
          target.fallbackProps.add(String(prop))
          return makeFallback()
        }
        // 宿主服务：真 Cordis 下未声明 inject 就是不可捕获的装载崩溃
        if (target.services.has(prop)) {
          if (!target.declaredInjects().has(prop)) {
            throw new Error(`cannot get property "${prop}" without inject (Cordis contract violation)`)
          }
          return target.services.get(prop)
        }
        if (prop in target) return Reflect.get(target, prop, receiver)
        // 声明了 inject 但 Mock 没提供 → 披露 Mock 缺口（插件声明是对的）
        if (target.declaredInjects().has(prop)) {
          target.fallbackProps.add(String(prop))
          return makeFallback()
        }
        // 未声明的非内建属性：真 Cordis 抛 "without inject"，Mock 不再静默兜底
        target.fallbackProps.add(String(prop))
        throw new Error(`cannot get property "${prop}" without inject (Cordis contract violation)`)
      },
    })
  }

  // 声明的 inject 名单（懒缓存，injectedList 在构造后才由入口模块填）
  declaredInjects() {
    const list = this.injectedList
    if (this._injectCache?.list !== list) {
      this._injectCache = { list, set: new Set(Array.isArray(list) ? list : []) }
    }
    return this._injectCache.set
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
    // cache-busting：同一进程内多次冒烟不读 ESM 缓存。
    // 入口 URL 走 pathToFileURL：手拼 `file://${path}` 在 Windows 盘符路径
    // （C:\...）下是非法 URL，动态 import 直接抛错。
    const entryUrl = `${pathToFileURL(entryPath).href}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`
    const mod = await import(entryUrl)
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
      // 未声明 inject 的宿主面访问：与真 Cordis 同形的契约错（为空即无此类问题）
      undeclaredInjectAccess: [],
      caveat: '冒烟通过 ≠ 宿主兼容；真冷启动验证用 plugin-upgrade 的 verify-runtime.mjs',
    }
  } catch (err) {
    const message = err?.message || String(err)
    const isInjectContract = /without inject/.test(message)
    return {
      success: false,
      stage: isInjectContract ? 'inject_contract' : 'runtime_execution',
      error: err.stack || message,
      pkgName: pkg.name,
      version: pkg.version,
      entry: entryFile,
      undeclaredInjectAccess: isInjectContract ? [message.match(/"([^"]+)" without inject/)?.[1]].filter(Boolean) : [],
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
