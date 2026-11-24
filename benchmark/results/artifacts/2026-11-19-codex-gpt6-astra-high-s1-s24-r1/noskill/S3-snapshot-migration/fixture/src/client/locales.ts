/** Dictionary keys owned by the pet plugin (zh/en par in a real plugin). */
export type PetKey = 'idle' | 'thinking' | 'working'
export const zh: Record<PetKey, string> = { idle: '发呆', thinking: '思考中', working: '干活中' }
export const en: Record<PetKey, string> = { idle: 'idle', thinking: 'thinking', working: 'working' }
