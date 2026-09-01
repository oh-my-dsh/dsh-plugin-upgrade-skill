import { DOCTOR_PROTOCOL_VERSION } from '../core/protocol.ts'
import type { SupervisorClient } from './client.ts'
export interface HeartbeatOptions { client: SupervisorClient; profileId: string; runId: string; pid?: number; intervalMs?: number; phase?: () => 'booting' | 'ready' | 'degraded'; webUrl?: () => string | undefined }
export function startHeartbeat(options: HeartbeatOptions): () => void {
  const send = (): void => { void options.client.call({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'heartbeat', profileId: options.profileId, runId: options.runId, pid: options.pid ?? process.pid, phase: options.phase?.() ?? 'ready', at: new Date().toISOString(), webUrl: options.webUrl?.() }).catch(() => undefined) }
  send(); const timer = setInterval(send, options.intervalMs ?? 5000); timer.unref?.(); return () => clearInterval(timer)
}
