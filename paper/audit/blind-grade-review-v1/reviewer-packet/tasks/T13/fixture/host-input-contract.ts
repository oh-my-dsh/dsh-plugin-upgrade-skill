// Excerpt from the DSH host source: the published input contract and the
// editor projection (packages/client/ui-conversation/src/client/contract/input.ts
// and src/client/input/editor/projection.ts). Trimmed to the fields the
// plugin reads.

/** One reference occurrence in the composer document. */
export interface Occurrence {
  /** Shell-assigned stable identity (monotonic per shell, keyed by NodeKey). */
  readonly occurrenceId: number
  /** Owning source name (serializer routing key). */
  readonly source: string
  /** Owner-scoped reference id. */
  readonly ref: string
  /** Offset in the clipboard-text projection. */
  readonly offset: number
  /** Length in the clipboard-text projection; the occurrence occupies exactly [offset, offset+length). */
  readonly length: number
  /** Inline display label (insert-time cache). */
  readonly label: string
  /** Clipboard / persistence projection, e.g. `/name` (insert-time cache, never the model form). */
  readonly clipboardText: string
}

/** Published input state (the currency; per-session). */
export interface InputState {
  /** Clipboard-text projection of the editor document (chips expanded to their clipboard form). */
  readonly draft: string
  /** Monotonic editor revision (span CAS compares against this). */
  readonly draftRev: number
  /** Reference occurrence view of the editor's chips, sorted by offset. */
  readonly occurrences: readonly Occurrence[]
}

/** The published projection product consumed by the shell every update. */
export interface EditorProjection {
  /** Trigger/TokenSpan coordinate text (chip = one U+FFFC). */
  readonly detectText: string
  /** Persistence/InputState draft text (chip = clipboardText). */
  readonly clipboardText: string
  /** InputState-compatible occurrence view (clipboardText coordinates). */
  readonly occurrences: readonly Occurrence[]
}
