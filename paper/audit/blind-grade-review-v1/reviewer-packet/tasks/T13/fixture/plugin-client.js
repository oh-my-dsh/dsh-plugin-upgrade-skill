// lib/client.js (excerpt) — @org/dsh-attach-input v0.2.3
// The plugin's attachment flow against the host input machine. Only the
// paths relevant to the reported bugs are kept; records is a module-level
// Map<ref, record>, `changed()` re-renders the dock, SOURCE is the plugin's
// trigger source name.

// ── add: one paste → one record + one composer chip ──────────────────────
const add = async (sessionId, items) => {
  validateItems(items);
  const input = inputFor(sessionId);
  let snapshot = input.state.getSnapshot();
  if (snapshot.phase !== 'plain') throw new Error('Wait for the current input operation to finish');
  if (snapshot.draft !== '' && !/\s$/u.test(snapshot.draft)) {
    input.setDraft(`${snapshot.draft} `);
    snapshot = input.state.getSnapshot();
  }
  for (const item of items) {
    const ref = id();
    const record = { ref, sessionId, items: [item], total: item.file.size, label: item.path, status: 'ready' };
    records.set(ref, record);
    const accepted = input.insertReference({
      source: SOURCE,
      ref,
      label: item.path,
      appearance: 'file',
      clipboardText: `[attachment: ${item.path}]`,
    }, {
      // insert at the end of the draft
      start: snapshot.draft.length,
      end: snapshot.draft.length,
      draftRev: snapshot.draftRev,
    });
    if (!accepted) {
      records.delete(ref);
      throw new Error('The DSH composer changed before the attachment could be inserted');
    }
    snapshot = input.state.getSnapshot();
  }
  changed();
};

// ── remove: the dock chip's × ────────────────────────────────────────────
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId);
  const snapshot = input.state.getSnapshot();
  if (snapshot.phase !== 'plain') return;
  // The occurrence owns its whole inline range, so the removal must span
  // occurrence.length, not one character.
  const end = occurrence.offset + (occurrence.length ?? 1);
  if (typeof input.consumeToken === 'function') {
    input.consumeToken({
      kind: 'span',
      span: { start: occurrence.offset, end, draftRev: snapshot.draftRev },
    });
  } else {
    input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(end));
  }
  records.delete(occurrence.ref);
  changed();
};

// ── dock chip rendering (excerpt) ────────────────────────────────────────
// const record = records.get(occurrence.ref);
// const meta = status === 'uploading' ? `${record.uploaded}/${record.items.length}`
//   : status === 'uploaded' ? 'copied' : record === undefined ? 'unavailable' : humanBytes(record.total);
