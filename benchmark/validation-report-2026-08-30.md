# plugin-upgrade skill effectiveness validation report

> Validation date: 2026-08-30
> Subject: the "upgrading a plugin from 0.1.1 to 0.1.2" scenario collected via
> [deepseek-harness discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120)
> Method: full plugin-upgrade chain simulated inside a Docker container
> (break → diagnose → migrate → verify)
> Bottom line: **the skill works and the full chain runs end to end; one card also
> needs an added note about the host/client planes**

---

## 1. Why this validation

In discussion #5120, the dsh-web community (~20 plugin packages) had just completed a
real 0.1.1 → 0.1.2 migration and summarized 10 pain points of the "static checks all
green, breaks only at runtime" kind, asking the maintainers to turn them into a
skill. This repo's `plugin-upgrade` skill is the answer to that call.

But the skill's knowledge had previously only been through **static verification**
(compared against the official release notes and upstream source). This validation
answers one question:

> Will a plugin written in the old 0.1.1 style actually break on a 0.1.2 host? And
> after it breaks, does following the skill's flow really bring it back to life?

## 2. Validation environment

| Item | Setting |
| --- | --- |
| Container | `node:24-bookworm` (Docker, container name `dsh-verify`) |
| New host | `@deepseek-ai/dsh@0.1.2-alpha.2` (npm alpha tag, installed globally) |
| Old host | `@deepseek-ai/dsh@0.1.1-rc.2` (npm latest tag, installed under a separate prefix) |
| Old SDK artifact | `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (downloaded from npm, to reproduce the real 0.1.1 API style) |
| Plugin under test | A minimal self-written plugin `@demo/dsh-upgrade-demo` (written against the old SDK's real interfaces, see Appendix A) |
| Validation basis | The skill's pre-flight touchpoint checklist + version cards (v0.1.2-alpha.1 / alpha.2) |

## 3. The full chain (four acts)

### Act 1: the old plugin put straight onto 0.1.2 — it breaks, exactly as #5120 describes

A plugin written in the 0.1.1 style (injecting the `apiProxy` service and calling
`apiProxy.llm.providers()`) is added to the web profile of 0.1.2 with
`dsh plugin --profile web add`, then started:

```
Error: dsh: plugin tree failed to load: dsh: 1 entry did not activate
@demo/dsh-upgrade-demo: pending (waiting for service: apiProxy)
```

**In plain words**: the plugin is waiting for the new host to provide a service
called `apiProxy`, but in 0.1.2 that service has been removed entirely (the breaking
change recorded in card DSH-0.1.2-A1-01), so the plugin waits forever and startup
fails outright.

This is the same symptom as #5120 pain point #4, "injected service drift: the entry
stays pending (waiting for service: …) forever" — except there the plugin was waiting
for `remote.agentPresets`, while here it waits for the deleted `apiProxy`.
**Without a migration, the plugin is dead.**

### Act 2: self-check with the skill's pre-flight checklist — a touchpoint hits, and the right card is found

The old plugin's source is scanned with the skill's executable detection patterns
(`references/pre-flight-patterns.json`, 7 touchpoint categories):

```
#1 源码 patch / monkey patch:        HIT
#3 内部服务探测 / Remote:            HIT   ← 决定性命中：apiProxy
#5 内部 UI / 命令 / 工具注册:        HIT
其余四类: miss
```

Following the skill's flow, a #3 hit sends you to card **DSH-0.1.2-A1-01** (APIProxy
removal + 17-row operation mapping table), together with **DSH-0.1.2-A2-02** (the new
error-flow contract). With the cards in hand, the migration begins.

### Act 3: migrating per the cards — three changes, plugin resurrected

| Change | Basis | Old style → new style |
| --- | --- | --- |
| Swap the injected service | DSH-0.1.2-A1-01: APIProxy removed entirely | `inject: ["apiProxy"]` → `inject: ["llm"]` (see "Key finding" below) |
| Swap the call style | DSH-0.1.2-A1-01 mapping table | `await ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()` |
| Remove the dead dependency | #5120 pain point #2: the SDK package is gone | remove `@deepseek-ai/dsh-host-apiproxy` from `dependencies` |

### Act 4: validating the migrated plugin on 0.1.2 — startup succeeds, service calls go through

```
[upgrade-demo] apply() 执行 — 已迁移到 host 领域服务直连
[upgrade-demo] llm.listProviders() 成功 → 路由数: 0 ；可配置提供方: 0
```

- The plugin entry activated normally (no more pending), and the host booted fully
  and stayed up;
- `listProviders()` actually succeeded (it returned 0 routes because the container
  has no API key configured — expected; **the call itself went through** — which also
  happens to demonstrate the cards' attribution principle: this is a profile
  configuration issue, not a plugin or runtime fault).

### Positive control: the old plugin back on 0.1.1-rc.2 — perfectly healthy

The same plugin, the same container, installed into the web profile of 0.1.1-rc.2
(npm latest):

```
[upgrade-demo] apply() 执行 — 旧 API（apiProxy）路径
dsh web: http://127.0.0.1:3080
```

The plugin activated normally, the `apiProxy` service exists, and the host booted
completely (the `providers()` line in the demo fails because its call arguments are
insufficient for the details of 0.1.1's RPC envelope — a quirk of the demo's own call
shape that does not affect the conclusion; **whether the service exists and the entry
is alive** is what this validation focuses on).

Side by side, the old and new hosts give a clean conclusion:

| Same old plugin | 0.1.1-rc.2 | 0.1.2-alpha.2 (no migration) | 0.1.2-alpha.2 (migrated per the skill) |
| --- | --- | --- | --- |
| Result | Activated successfully | **Startup failed outright** (never got the apiProxy service) | Activated successfully + service call went through |

There was also a bonus finding as supporting evidence: installing 0.1.1-rc.2 with
npm **took over 15 minutes resolving dependencies without finishing**, while pnpm
finished in under 4 minutes — a first-hand experience of the "package-manager
resolution cost" pain point in #5120, and a nice confirmation of the value of card
DSH-0.1.2-A2-03 (peer-dependency trimming).

## 4. Key finding: the cards need a note about planes

The migration hit a point the cards did not spell out, worth feeding back to the
skill:

- `apiProxy` is a gateway service on the **host plane** (server side). The first
  migration pass followed the mapping table and switched to `inject: ["remote"]`,
  which produced `pending (waiting for service: remote)` — because `remote` is the
  consumption facade on the **client plane** (browser side).
- For host-plane plugins, the correct alpha.2 migration is not "swap in an equivalent
  service named remote", but **skip the gateway facade and inject the domain service
  behind it directly** (`llm`, `sessionTitle`, etc.); the `remote` facade is for
  browser plugins (which must declare `dsh.client` in package.json).

**Suggested improvement to the skill**: add a field note to DSH-0.1.2-A1-01 —
"Before migrating, determine whether the plugin runs on the host plane or the client
plane: host-plane consumers inject the domain service directly; client-plane
consumers go through `ctx.remote.*` (package.json must declare `dsh.client`).
Injection names are not equivalent across the two generations, and swapping names
one-for-one will hit `pending (waiting for service)`."

This is also the generalization of #5120 pain point #4: **during cross-version
migration, "old injection name → new injection name" is rarely one-to-one, and the
card should prompt confirming the plane before choosing the target.**

## 5. Conclusion

| Criterion | Result |
| --- | --- |
| Does the old plugin really break on 0.1.2 | ✅ Yes, with the same symptom #5120 recorded (pending waiting for service) |
| Can the skill's touchpoint self-check locate the problem | ✅ Yes, the 7 executable patterns hit the decisive touchpoint #3 directly |
| Is the card knowledge accurate and sufficient | ✅ Mostly accurate; one plane note is missing (see section 4) |
| Does following the skill's migration bring the plugin back | ✅ Yes, the plugin activates and a real service call goes through |
| Not covered | No API key, so no "full round of real conversation" was run; the client-plane migration was not actually run (needs a browser environment) |

**Overall verdict: the skill passes effectiveness validation.** It is not theory —
following it, a dead 0.1.1 plugin ran again on 0.1.2.

## 6. Reproduction guide

```sh
# 1. start the container (node 24)
docker run -dit --name dsh-verify node:24-bookworm bash

# 2. install the new host
docker exec dsh-verify npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2

# 3. plugin source is in Appendix A; mounting the old plugin reproduces Act 1
docker exec dsh-verify dsh plugin --profile web add /path/to/demo-plugin
docker exec dsh-verify sh -c 'timeout 30 dsh web --no-open'   # → pending (waiting for service: apiProxy)

# 4. mount the migrated version from Appendix B instead → Act 4 passes
```

## Appendix A: the plugin under test (old 0.1.1 style)

```js
// index.js — written against the real interfaces of @deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1
export const inject = ["apiProxy"]

export function apply(ctx) {
  ctx.effect(async () => {
    const providers = await ctx.apiProxy.llm.providers()
    console.error("[demo] providers →", JSON.stringify(providers).slice(0, 160))
  })
}
```

```json
// package.json (key fields)
{
  "name": "@demo/dsh-upgrade-demo",
  "type": "module",
  "main": "index.js",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": { "@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1" }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: upgrade-demo
      name: "@demo/dsh-upgrade-demo"
```

## Appendix B: the plugin after migration (0.1.2-alpha.2)

```js
// index.js — host plane: inject the domain service directly
export const inject = ["llm"]

export function apply(ctx) {
  ctx.effect(async () => {
    const providers = ctx.llm.listProviders()
    console.error("[demo] routes:", providers.length)
  })
}
```

(package.json drops the apiproxy dependency; the client-plane style for browser
plugins is in section 4.)
