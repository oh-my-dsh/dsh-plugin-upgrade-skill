/**
 * Renderer switch — the client dispatch seam of the pet center (issue #623,
 * milestone M2 P5 / M3). The pet's manifest picks the renderer: sprite2d
 * hands straight through to the sprite; live2d injects its visual INTO the
 * sprite chrome (the dock, bubbles and panel belong to the pet center, not
 * the renderer); a renderer this build cannot serve renders a clear
 * diagnostic card instead of blanking.
 * @module @linxin666/dsh-pet/client/renderers/PetRendererSwitch
 */

import { cloneElement, isValidElement, useRef, type ReactElement, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetDefinition } from '../../registry.ts'
import type { ActivityPhase } from '../../state.ts'
import type { PetSpriteProps } from '../PetSprite.tsx'
import { createDragStream, type DragStream } from '../drag-stream.ts'
import type { GameplayBus } from '../gameplay-hud.tsx'
import { defaultPetRendererRegistry } from './registry.ts'
import { Live2dVisualMount } from './live2d/Live2dVisualMount.tsx'
import { Frames2dVisualMount } from './Frames2dVisualMount.tsx'
import type { NS } from '../locales.ts'

/** Dispatch one pet definition to its renderer; unknown kinds get a card. */
export function PetRendererSwitch(props: {
  definition: PetDefinition
  /** Current activity phase (fed to renderer visuals). */
  phase: ActivityPhase
  /** The chrome's pet interaction (affinity write-back owner). */
  onPet: () => void
  /** External drag stream (gameplay HUD shares it); created locally otherwise. */
  drag?: DragStream
  /** Gameplay coordination bus forwarded to the frames2d visual mount. */
  bus?: GameplayBus
  t: PropsLocale<typeof NS>['t']
  children?: ReactNode
}): ReactElement {
  const renderer = props.definition.renderer ?? 'sprite2d'
  // The frames2d drag stream lives one level up: the chrome (PetSprite)
  // reports the gesture through onDraggingChange, the visual subscribes.
  const dragRef = useRef<{ id: string; stream: ReturnType<typeof createDragStream> } | null>(null)
  if (dragRef.current === null || dragRef.current.id !== props.definition.id) {
    dragRef.current = { id: props.definition.id, stream: createDragStream() }
  }
  const drag = props.drag ?? dragRef.current.stream
  if (renderer === 'sprite2d') return <>{props.children}</>
  if (renderer === 'frames2d' && defaultPetRendererRegistry.has('frames2d') && isValidElement<PetSpriteProps>(props.children)) {
    const visual = (
      <Frames2dVisualMount
        definition={props.definition}
        phase={props.phase}
        onPet={props.onPet}
        drag={drag}
        {...(props.bus === undefined ? {} : { bus: props.bus })}
        t={props.t}
      />
    )
    return cloneElement(props.children, { visual, onDraggingChange: (dragging: boolean) => drag.push(dragging) })
  }
  if (renderer === 'live2d' && defaultPetRendererRegistry.has('live2d') && isValidElement<PetSpriteProps>(props.children)) {
    const visual = (
      <Live2dVisualMount
        definition={props.definition}
        phase={props.phase}
        onPet={props.onPet}
        t={props.t}
      />
    )
    return cloneElement(props.children, { visual })
  }
  return (
    <span data-dsh-pet-renderer-fallback={renderer}>
      {props.t('pet.renderer.unavailable', { renderer })}
    </span>
  )
}
