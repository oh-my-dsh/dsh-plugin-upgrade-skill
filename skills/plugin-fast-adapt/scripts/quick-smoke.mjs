#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';

// quick-smoke.mjs
// 轻量级秒级沙箱冒烟测试：模拟 Cordis / DSH 运行时上下文，
// 快速加载并激活插件，验证 apply 契约、工具注册与容错机制。

class MockContext {
  constructor() {
    this.services = new Map();
    this.tools = new Map();
    this.commands = new Map();
    this.events = new Map();
    this.injectedList = [];

    // 默认内置的模拟宿主核心服务
    this.provide('logger', {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    });

    const registeredTools = this.tools;
    this.provide('tools', {
      register: (toolDef) => {
        if (toolDef && toolDef.name) {
          registeredTools.set(toolDef.name, toolDef);
        }
      },
      add: (toolDef) => {
        if (toolDef && toolDef.name) {
          registeredTools.set(toolDef.name, toolDef);
        }
      },
      get: (name) => registeredTools.get(name),
      list: () => Array.from(registeredTools.values()),
    });

    this.scope = {
      disposables: [],
      isActive: true,
      update: () => {},
      dispose: () => {},
    };

    // 优雅代理兜底：对于 Cordis 的扩展属性，自动提供安全空函数
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        if (target.services.has(prop)) {
          return target.services.get(prop);
        }
        // Cordis 常见辅助机制
        if (prop === 'effect') {
          return (cb) => {
            if (typeof cb === 'function') {
              try { return cb(); } catch {}
            }
          };
        }
        if (['bail', 'waterfall', 'serial', 'parallel'].includes(prop)) {
          return (event, ...args) => target.emit(event, ...args);
        }
        // 默认返回一个记录式空函数
        return () => {};
      },
    });
  }

  provide(name, value) {
    this.services.set(name, value);
    this[name] = value;
  }

  get(name) {
    return this.services.get(name) || null;
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(handler);
    return () => {
      const list = this.events.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
    };
  }

  emit(event, ...args) {
    const list = this.events.get(event);
    if (list) {
      for (const h of list) h(...args);
    }
  }

  plugin(pluginModule, config = {}) {
    if (typeof pluginModule === 'function') {
      return pluginModule(this, config);
    }
    if (pluginModule && typeof pluginModule.apply === 'function') {
      return pluginModule.apply(this, config);
    }
    return null;
  }

  // DSH 工具注册仿真
  registerTool(toolDef) {
    if (toolDef && toolDef.name) {
      this.tools.set(toolDef.name, toolDef);
    }
  }
}

export async function runQuickSmoke(pluginRoot) {
  const root = path.resolve(pluginRoot);
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`找不到 package.json: ${pkgPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const entryFile = pkg.main || 'lib/index.js';
  const entryPath = path.join(root, entryFile);

  if (!fs.existsSync(entryPath)) {
    return {
      success: false,
      stage: 'entry_resolution',
      error: `入口文件不存在: ${entryPath}。请先执行构建 (pnpm run build)`,
    };
  }

  const ctx = new MockContext();
  const startTime = Date.now();

  try {
    // 动态载入插件模块
    const mod = await import(`file://${entryPath}?t=${Date.now()}`);
    const pluginTarget = mod.default || mod;

    // 检查 inject 声明
    if (pluginTarget.inject) {
      ctx.injectedList = Array.isArray(pluginTarget.inject) ? pluginTarget.inject : Object.keys(pluginTarget.inject);
    }

    // 执行插件挂载 apply(ctx, config)
    if (typeof pluginTarget.apply === 'function') {
      await pluginTarget.apply(ctx, {});
    } else if (typeof pluginTarget === 'function') {
      await pluginTarget(ctx, {});
    } else {
      return {
        success: false,
        stage: 'activation',
        error: `入口模块既未导出 apply 函数，也非函数式插件。导出类型: ${typeof pluginTarget}`,
      };
    }

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      durationMs,
      pkgName: pkg.name,
      version: pkg.version,
      entry: entryFile,
      injectedServices: ctx.injectedList,
      registeredToolsCount: ctx.tools.size || ctx.services.get('tools')?.list().length || 0,
      registeredTools: ctx.services.get('tools') ? ctx.services.get('tools').list().map(t => t.name) : [],
    };
  } catch (err) {
    return {
      success: false,
      stage: 'runtime_execution',
      error: err.stack || err.message,
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const targetDir = process.argv[2] || process.cwd();
  console.log(`\n=== DSH 插件轻量沙箱冒烟测试 (Quick-Smoke) ===`);
  console.log(`目标路径: ${path.resolve(targetDir)}`);

  runQuickSmoke(targetDir)
    .then((result) => {
      if (result.success) {
        console.log(`\n[冒烟通过] 耗时 ${result.durationMs}ms`);
        console.log(`  插件包名: ${result.pkgName}@${result.version}`);
        console.log(`  执行入口: ${result.entry}`);
        console.log(`  声明注入服务: [${result.injectedServices.join(', ')}]`);
        console.log(`  注册工具数量: ${result.registeredToolsCount}`);
        if (result.registeredTools.length > 0) {
          console.log(`  注册工具列表: ${result.registeredTools.join(', ')}`);
        }
        process.exit(0);
      } else {
        console.log(`\n[冒烟失败] 阶段: ${result.stage}`);
        console.log(`  错误详情: ${result.error}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(`测试执行异常:`, err);
      process.exit(1);
    });
}
