// Browser half (0.1.1-era repository-plugin shape): a self-executing page script.
// Before the repository mechanism was removed, this file was served by the entry's
// /pet/ui.js route, injected into index.html via httpServer.tapIndex, and executed
// directly by the page (no __ModuleLoader__, no module exports).
//
// NOTE: the repository-plugin mechanism handles loading this script — the layout is
// final, do not change it.
const pet = document.createElement('div')
pet.id = 'bench-pet'
pet.textContent = '🐋'
document.body.appendChild(pet)