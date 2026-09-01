import { readFile } from 'node:fs/promises'
import { DOCTOR_PROTOCOL_VERSION, type SupervisorRequest, type SupervisorResponse } from '../core/protocol.ts'
import { callSupervisor } from '../agent/ipc.ts'
import type { DoctorPaths } from '../agent/paths.ts'

export class SupervisorClient {
  constructor(private readonly paths: DoctorPaths, private readonly endpoint = process.env.DSH_DOCTOR_ENDPOINT || paths.socket, private readonly explicitToken = process.env.DSH_DOCTOR_TOKEN) {}
  private async token(): Promise<string> { return this.explicitToken || (await readFile(this.paths.token, 'utf8')).trim() }
  async call(request: SupervisorRequest): Promise<SupervisorResponse> { return callSupervisor(this.endpoint, await this.token(), request) }
  async status(): Promise<SupervisorResponse> { return this.call({ protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' }) }
}
