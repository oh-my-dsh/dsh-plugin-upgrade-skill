/**
 * Edit-task modal: title + description + the prompt the next execution will
 * send, pre-filled from the task. Shown only for tasks that have never
 * started executing (the detail view gates on canEditTaskContent); the Host
 * still re-checks at submit, so a task that started running while the modal
 * was open fails closed and the error surfaces here.
 */
import { useState } from 'react'
import type { BoardController } from '../../core/controller.ts'
import type { TaskRecord } from '../../core/tasks.ts'
import { t } from '../locales.ts'
import { ModalShell, TaskContentFields } from './TaskForm.tsx'

/** Edit-task form overlay. */
export function EditTaskModal({ controller, task, onClose }: { controller: BoardController; task: TaskRecord; onClose: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [prompt, setPrompt] = useState(task.prompt)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)

  const submit = async (): Promise<void> => {
    if (title.trim() === '') {
      setError(t('new.required'))
      return
    }
    setPending(true)
    // The Host confirms the mutation (and its fail-closed checks); only a
    // confirmed save closes the modal.
    if (await controller.updateTask(task.id, { title, description, prompt })) {
      onClose()
      return
    }
    setPending(false)
    setError(controller.getSnapshot().transportError ?? t('new.required'))
  }

  return (
    <ModalShell
      ariaLabel={t('edit.title')}
      title={t('edit.title')}
      error={error}
      pending={pending}
      submitLabel={t('edit.save')}
      onSubmit={() => { void submit() }}
      onClose={onClose}
    >
      <TaskContentFields
        title={title}
        description={description}
        prompt={prompt}
        onTitleChange={value => { setTitle(value); setError(undefined) }}
        onDescriptionChange={setDescription}
        onPromptChange={setPrompt}
      />
    </ModalShell>
  )
}
