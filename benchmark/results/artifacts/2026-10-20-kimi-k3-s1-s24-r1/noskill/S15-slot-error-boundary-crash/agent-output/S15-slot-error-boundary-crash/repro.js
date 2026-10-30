// S15 repro — AttachmentChips copied VERBATIM from fixture/plugin-dock-chips.js (v0.2.10 as-shipped),
// with minimal stubs for the host runtime (h, records, SOURCE, React).
// Purpose: demonstrate (a) node --check passes, (b) the empty state never reaches the throwing line,
// (c) the || short-circuit keeps 'busy' unread while the phase guard is truthy,
// (d) one chip + falsy guard (phase 'plain' or absent) throws ReferenceError: busy is not defined.

const React = { useState: (v) => [v, () => {}], useCallback: (f) => f };
const SOURCE = 'org.dsh-attach-input';
const records = new Map([['ref-1', { status: 'ok', label: 'shot.png', items: [] }]]);
const h = (type, props, ...children) => ({ type, props, children });
const useRevision = () => {};

// ---- begin verbatim copy of fixture/plugin-dock-chips.js lines 21-38 ----
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
        // v0.2.10 hardening pass added the phase guard — and this busy reference:
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}
// ---- end verbatim copy ----

// Simulate the host slot runtime: each slot entry is wrapped in an error boundary
// that UNMOUNTS the whole entry on a render throw and only logs to console.
function renderSlotEntry(name, fn) {
  try {
    return { entry: name, mounted: true, tree: fn() };
  } catch (e) {
    return { entry: name, mounted: false, consoleOnly: e.name + ': ' + e.message };
  }
}

const occ = [{ source: SOURCE, ref: 'ref-1', occurrenceId: 'o1', label: 'shot.png' }];
const render = (input) => renderSlotEntry('InputZone:AttachmentDock', () => AttachmentChips({ input, remove() {} }, 'dock'));

console.log('case 1 (empty dock, no occurrences):');
console.log('  ', JSON.stringify(render({ occurrences: [], phase: 'plain' })));
console.log('case 2 (one chip, phase "compose" -> guard truthy, || short-circuits):');
const c2 = render({ occurrences: occ, phase: 'compose' });
console.log('   mounted=' + c2.mounted, 'remove.disabled=' + JSON.stringify(c2.tree?.children?.[0]?.children?.[1]?.props?.disabled));
console.log('case 3 (one chip, phase "plain" -> guard falsy, busy is evaluated):');
console.log('  ', JSON.stringify(render({ occurrences: occ, phase: 'plain' })));
console.log('case 4 (one chip, phase absent -> ?? plain -> falsy guard):');
console.log('  ', JSON.stringify(render({ occurrences: occ })));
