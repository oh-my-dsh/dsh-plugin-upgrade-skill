/**
 * LAN address derivation for the pairing URLs. Mirrors the dsh CLI's
 * boot-time sampling (apps/cli/src/app-cli-entry.ts `resolveLanTrust`): the
 * pairing links may only name addresses the /api trust fence was configured
 * with, so the same non-internal IPv4 derivation applies here — an external
 * plugin cannot read the CLI's sampled snapshot, but the fence accepts
 * exactly these literals, which is the property that matters.
 */

import { networkInterfaces } from 'node:os'

/**
 * Non-internal IPv4 interface addresses of this machine — the IP-literal
 * authorities an all-interfaces bind is reachable by on the LAN.
 * @returns the addresses in interface order (possibly empty).
 */
export function lanIPv4Addresses(): string[] {
  return Object.values(networkInterfaces()).flat()
    .filter((iface): iface is NonNullable<typeof iface> => { return iface !== undefined && iface.family === 'IPv4' && !iface.internal })
    .map(iface => iface.address)
}
