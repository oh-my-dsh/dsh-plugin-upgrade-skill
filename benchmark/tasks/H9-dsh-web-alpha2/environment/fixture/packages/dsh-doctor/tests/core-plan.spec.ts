/**
 * Deterministic repair planning.
 */
import { describe, expect, it } from 'vitest'
import { planHash, planRepair, samePlan } from '../src/core/plan.ts'
import type { PlanInput } from '../src/core/plan.ts'
import type { Diagnostic } from '../src/core/types.ts'

const BROKEN_PATCH = '- id: x\n  config: {a: [unclosed\n'

function diag(code: string, severity: Diagnostic['severity'], path: string): Diagnostic {
  return { code, severity, path, detail: 'detail for ' + code }
}

function input(diagnostics: Diagnostic[], files: Record<string, string> = {}, profile = 'web'): PlanInput {
  return { profile, diagnostics, files, patchPathByCode: {} }
}

describe('planRepair', () => {
  it('produces preserve-and-heal actions for a broken patch', () => {
    const plan = planRepair(
      input(
        [diag('D-040', 'critical', '/h/profiles/web/cordis.patch.yml')],
        { '/h/profiles/web/cordis.patch.yml': BROKEN_PATCH },
      ),
    )
    expect(plan.actions.length).toBe(2)
    expect(plan.actions[0]?.op).toBe('move-path')
    expect(plan.actions[0]?.target).toBe('/h/profiles/web/cordis.patch.yml')
    expect(plan.actions[0]?.to).toBe('/h/profiles/web/cordis.patch.yml.doctor-broken')
    const heal = plan.actions[1]
    expect(heal?.target).toBe('/h/profiles/web/cordis.patch.yml')
    expect(heal?.content).toContain('[]')
  })

  it('prunes an unresolvable bundle from the manifest (D-020/D-030)', () => {
    const manifest = JSON.stringify({ name: 'web', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@nope/missing'] } }, dependencies: {} })
    const withDetail = {
      ...diag('D-020', 'error', '/h/profiles/web/package.json'),
      detail: 'profile bundle "@nope/missing" is not resolvable from the dsh installation or the profile dir',
    }
    const plan = planRepair(input([withDetail], { '/h/profiles/web/package.json': manifest }))
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]?.target).toBe('/h/profiles/web/package.json')
    expect(JSON.parse(plan.actions[0]?.content ?? '{}').dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('rewrites an out-of-home settings path into a dshHomePath expression (D-080)', () => {
    const patch = '- id: settings\n  config:\n    path: /old/home/settings.yaml\n'
    const withEvidence = {
      ...diag('D-080', 'warn', '/h/profiles/web/cordis.patch.yml'),
      evidence: '/old/home/settings.yaml',
    }
    const plan = planRepair(input([withEvidence], { '/h/profiles/web/cordis.patch.yml': patch }, 'web'))
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]?.content).toContain("dshHomePath('profiles/web/settings.yaml')")
    expect(plan.actions[0]?.content).not.toContain('/old/home/settings.yaml')
  })

  it('planning is idempotent: identical inputs give identical hashes', () => {
    const a = planRepair(input([diag('D-040', 'critical', '/p')], { '/p': BROKEN_PATCH }))
    const b = planRepair(input([diag('D-040', 'critical', '/p')], { '/p': BROKEN_PATCH }))
    expect(a.hash).toBe(b.hash)
    expect(samePlan(a, b)).toBe(true)
    expect(planHash(a.actions)).toBe(a.hash)
  })

  it('returns an empty plan for no actionable diagnostics', () => {
    const plan = planRepair(input([diag('D-100', 'warn', 'package.json')]))
    expect(plan.actions).toEqual([])
    expect(plan.hash.length).toBeGreaterThan(0)
  })

  it('orders actions deterministically by target then op', () => {
    const plan = planRepair(
      input([
        { ...diag('D-040', 'critical', '/h/profiles/web/z.yml'), detail: 'x' },
        { ...diag('D-040', 'critical', '/h/profiles/web/a.yml'), detail: 'x' },
        { ...diag('D-080', 'warn', '/h/profiles/web/a.yml'), detail: 'x', evidence: '/x' },
      ], {
        '/h/profiles/web/a.yml': '- id: settings\n  config:\n    path: /x\n',
        '/h/profiles/web/z.yml': '- a\n',
      }),
    )
    const targets = plan.actions.map((action) => action.target)
    expect([...targets].sort()).toEqual(targets)
  })

  it('emits nothing when the broken file content is unavailable', () => {
    const plan = planRepair(input([diag('D-040', 'critical', '/missing')]))
    expect(plan.actions).toEqual([])
  })
})

