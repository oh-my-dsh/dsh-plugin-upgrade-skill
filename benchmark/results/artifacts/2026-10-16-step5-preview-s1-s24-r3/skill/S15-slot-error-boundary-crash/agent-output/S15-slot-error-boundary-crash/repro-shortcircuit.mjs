// Repro of the S15 short-circuit latency (read-only experiment, mirrors
// fixture/plugin-dock-chips.js:21-37 exactly for the `disabled` expression).
// Purpose: prove (a) the throw is render-time, not load-time; (b) it is gated by
// BOTH "an occurrence exists" and "phase === 'plain'"; (c) `||` short-circuit
// hides it in the locked phase.
const h = (tag, props, ...children) => ({ tag, props, children });
const SOURCE = 'attach';
const records = new Map();

function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    return h('div', { className: 'chip', 'data-status': status, key: occurrence.occurrenceId },
      h('span', { className: 'name' }, record?.label ?? occurrence.label),
      h('button', {
        type: 'button',
        className: 'remove',
        'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy, // <-- ???
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}

const occurrence = { ref: 'r1', occurrenceId: 'o1', label: 'shot.png', source: SOURCE };
const cases = [
  ['A empty dock (no occurrence)',            { input: { phase: 'plain', occurrences: [] } }],
  ['B chip present, phase plain (idle)',      { input: { phase: 'plain', occurrences: [occurrence] } }],
  ['C chip present, phase busy (locked)',     { input: { phase: 'busy', occurrences: [occurrence] } }],
  ['D chip present, input has no phase key',  { input: { occurrences: [occurrence] } }],
  ['E chip present, props.input missing',     {}],
];
for (const [name, props] of cases) {
  try {
    const out = AttachmentChips(props, 'dock');
    console.log(name.padEnd(40), '=> rendered OK:', out === null ? 'null (early return)' : 'chip tree built');
  } catch (err) {
    console.log(name.padEnd(40), '=> THROWS', err.constructor.name + ': ' + err.message);
  }
}
