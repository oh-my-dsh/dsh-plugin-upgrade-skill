
const EMPTY_PENDING_MAP = new Map();
function pendingKindOf(entry) {
  if (entry === undefined || entry === null) return null;
  const direct = entry.kind;
  if (typeof direct === 'string') return direct;
  const nested = entry.pendingInteraction;
  const kind = nested && nested.kind;
  return typeof kind === 'string' ? kind : null;
}
function selectPendingKit(kit) {
  if (typeof kit.useSessionPendingInteraction === 'function')
    return kit.useSessionPendingInteraction(m => m);
  if (typeof kit.useSessionStatus === 'function')
    return kit.useSessionStatus(m => m);
  return EMPTY_PENDING_MAP;
}
// --- fixtures for the three host shapes ---
const alpha1 = { useSessionPendingInteraction: m => new Map([['s-7f3a', { kind: 'approval' }]]) };
const alpha2 = { useSessionStatus: m => new Map([['s-7f3a', { running: false, completionUnread: false, pendingInteraction: { kind: 'question' } }]]) };
const neither = {};
const a1 = selectPendingKit(alpha1), a2 = selectPendingKit(alpha2), none = selectPendingKit(neither);
console.log('alpha1  ownPending:', pendingKindOf(a1.get('s-7f3a')));
console.log('alpha2  ownPending:', pendingKindOf(a2.get('s-7f3a')));
console.log('neither ownPending:', pendingKindOf(none.get('s-7f3a')), '| map size:', none.size);
console.log('missing key      :', pendingKindOf(a2.get('nope')));
console.log('old code on a2   :', (() => { try { return alpha2.useSessionPendingInteraction(m => m); } catch (e) { return e.constructor.name + ': ' + e.message; } })());
