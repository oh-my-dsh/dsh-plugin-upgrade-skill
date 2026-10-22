// temp/short-circuit-demo.js — read-only demonstration helper (does not touch the fixture).
// Reproduces the exact expressions from fixture/plugin-dock-chips.js in two scopes.

// 1) AttachButton's scope: `busy` IS declared here (const [busy, setBusy] = React.useState(false), line 7).
function attachButtonScope(phase) {
  const busy = false;                            // useState local of AttachButton
  const locked = (phase ?? 'plain') !== 'plain'; // line 9
  return { disabled: locked || busy };           // line 17 — works
}

// 2) AttachmentChips' scope: `busy` is a FREE identifier (no binding anywhere).
function attachmentChipsScope(phase) {
  // there is NO `busy` in this scope — it lives inside AttachButton
  const disabled = (phase ?? 'plain') !== 'plain' || busy; // plugin-dock-chips.js:34
  return { disabled };
}

// 3) Empty state: the throwing line is inside occurrences.map(...) and never runs.
function emptyState() {
  const occurrences = [];                 // props.input?.occurrences ?? [] filtered by source
  if (occurrences.length === 0) return null;  // line 23 — early return
  return occurrences.map(o => o);             // line 24 — never reached
}

function tryCall(label, fn) {
  try { console.log(label, '=>', JSON.stringify(fn())); }
  catch (e) { console.log(label, '=> THROWS', e.constructor.name + ': ' + e.message); }
}

tryCall('AttachButton scope,      phase=plain  ', () => attachButtonScope('plain'));
tryCall('AttachmentChips scope,   phase=sending', () => attachmentChipsScope('sending'));
tryCall('AttachmentChips scope,   phase=plain  ', () => attachmentChipsScope('plain'));
tryCall('AttachmentChips empty state         ', () => emptyState());
