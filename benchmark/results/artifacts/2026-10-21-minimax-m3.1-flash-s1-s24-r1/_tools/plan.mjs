// The 48-cell sweep plan.
import { S_TASKS } from './common.mjs'

export const ARMS = ['noskill', 'skill']

// Cells are grouped into waves of 2: each wave holds one task's two arms so the
// noskill-then-skill order inside a task is preserved while two cells run at once.
export function buildPlan() {
  const plan = []
  for (let i = 0; i < S_TASKS.length; i += 2) {
    const pair = []
    for (const task of S_TASKS.slice(i, i + 2)) {
      for (const arm of ARMS) pair.push({ task, arm })
    }
    plan.push(pair)
  }
  return plan
}
