// Browser half (0.1.2-alpha.2 bundle shape): a client module registered through
// __ModuleLoader__ and mounted by client-modules (DSH-0.1.1-R1-01) — no longer a
// self-executing page script injected via httpServer.tapIndex.
export const name = 'bench-repo'

export function apply(ctx) {
  const pet = document.createElement('div')
  pet.id = 'bench-pet'
  pet.textContent = '🐋'
  document.body.appendChild(pet)
}