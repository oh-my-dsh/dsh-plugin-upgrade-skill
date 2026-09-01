/**
 * Delete-task use case: drop a task from the ledger and clear the selection
 * when it pointed at the removed task. Pure ledger transition (no persistence
 * or notify — the controller orchestrates those).
 */
import type { TaskRecord } from '../tasks.ts'

/** Result of a delete transition. */
export interface DeleteTaskResult {
  /** The next ledger (the removed task absent). */
  tasks: readonly TaskRecord[]
  /** Whether the previous selection referenced the removed task. */
  selectionCleared: boolean
}

/**
 * Apply a delete across the ledger. The selection (a task id) is cleared when
 * it matches the removed task, so the UI never lingers on a vanished detail.
 * @param tasks - current ledger.
 * @param selectedTaskId - the currently selected task id (may be undefined).
 * @param id - the task to remove.
 */
export function applyDeleteTask(
  tasks: readonly TaskRecord[],
  selectedTaskId: string | undefined,
  id: string,
): DeleteTaskResult {
  const next = tasks.filter(task => task.id !== id)
  return {
    tasks: next,
    selectionCleared: selectedTaskId === id,
  }
}
