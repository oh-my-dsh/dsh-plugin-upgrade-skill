// lib/client.js (excerpt) — @org/dsh-attach-input v0.2.10
// records: module-level Map<ref, record>. changed() re-renders the dock.
// The paste path, the drop path, and the file/folder picker all funnel into add().

function validateItems(items) {
  if (items.length === 0) throw new Error('No files were selected');
  let total = 0;
  const paths = new Set();
  for (const item of items) {
    total += item.file.size;
    if (paths.has(item.path)) throw new Error(`Duplicate attachment path: ${item.path}`);
    paths.add(item.path);
  }
  return total;
}

const add = async (sessionId, items) => {
  validateItems(items);
  const input = inputFor(sessionId);
  let snapshot = input.state.getSnapshot();
  // ... (coordinate handling fixed in v0.2.10; omitted here) ...
  for (const item of items) {
    const ref = id();
    const label = item.path;                       // ← pasted "image.png" stays "image.png"
    const record = { ref, sessionId, items: [item], total: item.file.size, label, status: 'ready' };
    records.set(ref, record);
    const accepted = input.insertReference({ /* ... */ }, { /* ... */ });
    if (!accepted) { records.delete(ref); throw new Error('The DSH composer changed'); }
    snapshot = input.state.getSnapshot();
    if (typeof input.state.subscribe === 'function') {
      const unsubscribe = input.state.subscribe(() => {
        const current = input.state.getSnapshot();
        const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref);
        if (alive || record.inflight !== undefined) return;
        unsubscribe();
        records.delete(ref);                        // ← fires on ANY momentary empty snapshot
        changed();
      });
    }
  }
  changed();
};

// dock chip: h('span', { className: 'dshca-name' }, record?.label ?? occurrence.label)
// upload body: files: record.items.map(item => ({ path: item.path, ... }))
