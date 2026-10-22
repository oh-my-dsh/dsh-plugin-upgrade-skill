
// Local, read-only re-mount of the two AttachmentChips variants from the evidence pack.
// Purpose: prove which expression throws, and prove the || short-circuit latency.
const h = (type, props, ...kids) => ({ type, props: props || {}, children: kids.flat(Infinity) });
const SOURCE = 'attach';
const records = new Map([
  ['ref-1', { status: 'ready', label: 'shot.png', items: [{ path: '/tmp/shot.png', file: { id: 'f1' } }] }],
]);
const isImagePath = (p) => /\.(png|jpe?g|webp)$/i.test(String(p));
const openImageViewer = () => {};
const objectUrlOf = () => 'blob:fake';

// ---- v0.2.10 as shipped (fixture plugin-dock-chips.js) ----
function AttachmentChips_v0210(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter((item) => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  return h('div', { className }, ...occurrences.map((occurrence) => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    return h('div', { className: 'chip', 'data-status': status, key: occurrence.occurrenceId },
      h('span', { className: 'name' }, record?.label ?? occurrence.label),
      h('button', {
        type: 'button', className: 'remove',
        'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}

// ---- v0.2.11 (fixture feature.diff applied) ----
function AttachmentChips_v0211(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter((item) => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  const imageItem = status !== 'missing'
    ? record?.items.find((item) => isImagePath(item.path))
    : undefined;
  return h('div', { className }, ...occurrences.map((occurrence) => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    return h('div', {
      className: 'chip', 'data-status': status,
      'data-image': imageItem === undefined ? undefined : '1',
      key: occurrence.occurrenceId,
      onClick: imageItem === undefined ? undefined : (event) => {
        if (event.target.closest('.remove') !== null) return;
        openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
      },
    },
      h('span', { className: 'name' }, record?.label ?? occurrence.label),
      imageItem !== undefined && h('div', { className: 'hover-card' },
        h('img', { src: objectUrlOf(imageItem.file), alt: imageItem.path })),
      h('button', {
        type: 'button', className: 'remove',
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}

const occ = (id) => ({ source: SOURCE, ref: 'ref-' + id, occurrenceId: 'o' + id, label: 'shot' + id + '.png' });
const base = (phase, n) => ({ input: { phase, occurrences: n ? [occ(1)] : [] }, remove: () => {} });

function probe(label, fn) {
  try { const out = fn(); console.log('  ' + label + ' -> OK ' + (out === null ? 'null (renders nothing)' : 'chip tree')); }
  catch (e) { console.log('  ' + label + ' -> THROW ' + e.constructor.name + ': ' + e.message); }
}

console.log('v0.2.10 AttachmentChips:');
probe('0 occurrences, phase=plain ', () => AttachmentChips_v0210(base('plain', 0), 'dock'));
probe('0 occurrences, phase=locked', () => AttachmentChips_v0210(base('locked', 0), 'dock'));
probe('1 occurrence,  phase=locked', () => AttachmentChips_v0210(base('locked', 1), 'dock'));
probe('1 occurrence,  phase=plain ', () => AttachmentChips_v0210(base('plain', 1), 'dock'));
probe('1 occurrence,  phase absent', () => AttachmentChips_v0210({ input: { occurrences: [occ(1)] }, remove: () => {} }, 'dock'));

console.log('v0.2.11 AttachmentChips (hover preview):');
probe('0 occurrences, phase=plain ', () => AttachmentChips_v0211(base('plain', 0), 'dock'));
probe('1 occurrence,  phase=locked', () => AttachmentChips_v0211(base('locked', 1), 'dock'));
probe('1 occurrence,  phase=plain ', () => AttachmentChips_v0211(base('plain', 1), 'dock'));

console.log('After removing only "|| busy" (naive one-line fix), v0.2.11 with chip present:');
try {
  const src = AttachmentChips_v0211.toString().replace('|| busy', '');
  const f = new Function('h', 'SOURCE', 'records', 'isImagePath', 'openImageViewer', 'objectUrlOf', 'return (' + src + ')');
  const fn = f(h, SOURCE, records, isImagePath, openImageViewer, objectUrlOf);
  fn(base('plain', 1), 'dock');
  console.log('  -> OK');
} catch (e) { console.log('  -> THROW ' + e.constructor.name + ': ' + e.message); }

console.log('After also hoisting record/status out of the map callback (correct fix), v0.2.11 chip present:');
try {
  const src = AttachmentChips_v0211.toString()
    .replace('|| busy', '')
    .replace("const imageItem = status !== 'missing'", "const rec0 = records.get(occurrences[0].ref); const st0 = rec0?.status ?? 'missing'; const imageItem = st0 !== 'missing'")
    .replace('record?.items.find(', '(rec0?.items ?? []).find(');
  const f = new Function('h', 'SOURCE', 'records', 'isImagePath', 'openImageViewer', 'objectUrlOf', 'return (' + src + ')');
  const fn = f(h, SOURCE, records, isImagePath, openImageViewer, objectUrlOf);
  fn(base('plain', 1), 'dock');
  console.log('  -> OK');
} catch (e) { console.log('  -> THROW ' + e.constructor.name + ': ' + e.message); }
