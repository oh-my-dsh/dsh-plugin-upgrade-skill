// Appendix to the S10 report — runnable sketch of the regression tests for follow-up A
// (paste renaming) and follow-up B (version chip).
//
// This file is SELF-CONTAINED ON PURPOSE: it reproduces the two pieces of v0.2.10 logic
// from the read-only fixture (plugin-version-chip.js / plugin-attachment-flow.js) as small
// pure functions plus a stub composer, so the tests can run with plain Node on a lib-only
// plugin that has no build/test toolchain:
//
//     node --test appendix-regression-tests.node-test.mjs
//
// The fixture itself is an excerpt (it references inputFor, h, records, ...), so it cannot
// be imported. Port these cases onto the real module boundaries; the assertions, not this
// scaffolding, are the deliverable.

import test from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ *
 * semver helpers (the chip already owns a semverCmp; kept here so the
 * sketch runs standalone)
 * ------------------------------------------------------------------ */
function semverCmp(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}
const latestFromTags = (tags) => {
  const stable = tags.map((t) => t.name).filter((n) => /^v\d+\.\d+\.\d+$/.test(n));
  if (stable.length === 0) return undefined; // mirrors the v0.2.10 `stable.length > 0` guard
  return stable.reduce((a, b) => (semverCmp(b, a) > 0 ? b : a));
};

/* ================================================================== *
 * FOLLOW-UP B — the version chip
 * ================================================================== */

// ---- v0.2.10 as shipped (reproduced from plugin-version-chip.js) ----
// renderCurrentChip(tag) prints the FETCHED tag.
function chipText_v0210(PLUGIN_VERSION, tags) {
  const tag = latestFromTags(tags);
  if (!tag) return 'offline';
  if (semverCmp(tag, PLUGIN_VERSION) <= 0) {
    return 'OK attach-input already the latest version ' + tag; // <- shows the fetched tag
  }
  return 'update available: ' + tag;
}

// ---- the fix ----
// 1. compare the fetched best tag against the RUNNING version;
// 2. the green "already latest" chip always names the RUNNING version;
// 3. a list that omits the running version's own tag is provably stale and may not
//    produce any "latest" claim at all.
function listIsSelfConsistent(tags, PLUGIN_VERSION) {
  return tags.some((t) => semverCmp(t.name, PLUGIN_VERSION) === 0);
}
function chipText_fixed(PLUGIN_VERSION, tags) {
  const tag = latestFromTags(tags);
  if (!tag) return 'offline/unknown';
  if (!listIsSelfConsistent(tags, PLUGIN_VERSION)) {
    return 'attach-input v' + PLUGIN_VERSION + ' (update check inconclusive: stale tag list)';
  }
  if (semverCmp(tag, PLUGIN_VERSION) <= 0) {
    return 'OK attach-input already the latest version v' + PLUGIN_VERSION; // <- running version
  }
  return 'update available: ' + tag;
}

// The captured response ~90s after pushing v0.2.11 (fixture: tags-api-response.txt).
const STALE_LIST = [{ name: 'v0.2.9' }, { name: 'v0.2.8' }, { name: 'v0.2.7' }];
const FRESH_LIST = [{ name: 'v0.2.11' }, { name: 'v0.2.10' }, { name: 'v0.2.9' }];

test('B1 · stale tag list must not be reported as "latest v0.2.9" (the filed bug)', () => {
  // v0.2.10 behaviour — this is exactly what user rho_9 saw.
  assert.match(chipText_v0210('0.2.10', STALE_LIST), /already the latest version v0\.2\.9/);
  // fixed behaviour — names the running version, and never the fetched stale tag.
  const fixed = chipText_fixed('0.2.10', STALE_LIST);
  assert.match(fixed, /v0\.2\.10/);
  assert.doesNotMatch(fixed, /v0\.2\.9/);
});

test('B2 · the running tag being absent proves the list is stale', () => {
  assert.equal(listIsSelfConsistent(STALE_LIST, '0.2.10'), false);
  assert.equal(listIsSelfConsistent(FRESH_LIST, '0.2.10'), true);
});

test('B3 · a genuinely newer tag still produces an update chip (no false negative)', () => {
  assert.match(chipText_fixed('0.2.10', FRESH_LIST), /update available: v0\.2\.11/);
});

test('B4 · empty/failed fetch never claims "latest"', () => {
  assert.equal(chipText_fixed('0.2.10', []), 'offline/unknown');
  assert.doesNotMatch(chipText_fixed('0.2.10', []), /latest/);
});

test('B5 · numeric semver ordering (0.2.10 > 0.2.9), not lexicographic', () => {
  assert.ok(semverCmp('v0.2.10', 'v0.2.9') > 0);
  assert.ok('v0.2.10' < 'v0.2.9'); // the string comparison the fix must not rely on
});

/* ================================================================== *
 * FOLLOW-UP A — unified renaming on the paste path only
 * ================================================================== */

// A stub composer standing in for the DSH composer state object. 'flap' reproduces the
// fixture's alive-subscription hazard: one snapshot momentarily reports no occurrences.
function makeComposer({ flap = false } = {}) {
  const occurrences = [];
  let n = 0;
  let flapped = false;
  return {
    occurrences,
    getSnapshot() {
      if (flap && !flapped && occurrences.length > 0) { flapped = true; return { occurrences: [] }; }
      return { occurrences: occurrences.map((o) => ({ ...o })) };
    },
    insertReference(source, label) {
      n += 1;
      occurrences.push({ source, ref: 'ref-' + n, label });
      return { accepted: true, ref: 'ref-' + n };
    },
  };
}
const SOURCE = 'attach-input';

// v0.2.10: no renaming at all, and the only duplicate check is inside one batch.
function add_v0210(composer, records, items) {
  const paths = new Set();
  for (const item of items) {
    if (paths.has(item.path)) throw new Error('Duplicate attachment path: ' + item.path);
    paths.add(item.path);
  }
  for (const item of items) {
    const ref = 'ref-' + (records.size + 1);
    records.set(ref, { ref, label: item.path, items: [item] });
    composer.insertReference(SOURCE, item.path);
  }
  return records;
}

// The fix. opts.origin decides whether the paste naming scheme applies; the default is
// "keep the real name", so a new acquisition path can never start renaming by accident.
function nextName(base, ext, taken) {
  let candidate = base + ext;
  for (let i = 2; taken.has(candidate.toLowerCase()); i += 1) {
    candidate = base + '(' + i + ')' + ext;
  }
  return candidate;
}
function pasteBaseName(file) {
  return file.type && file.type.startsWith('image/') ? 'paste_image' : 'paste_file';
}
function add_fixed(composer, records, items, opts = {}) {
  const rename = opts.origin === 'paste'; // drop / picker / unknown => untouched
  const taken = new Set(
    composer.getSnapshot().occurrences.map((o) => String(o.label).toLowerCase()),
  );
  const finalItems = [];
  for (const item of items) {
    let path = item.path;
    if (rename) {
      const m = /\.([^.]+)$/.exec(item.path);
      const ext = m ? '.' + m[1] : '';
      path = nextName(pasteBaseName(item.file), ext, taken);
    } else if (taken.has(path.toLowerCase())) {
      throw new Error('Duplicate attachment path: ' + path);
    }
    taken.add(path.toLowerCase());
    finalItems.push({ ...item, path, file: new File([item.file], path, { type: item.file.type }) });
  }
  for (const item of finalItems) {
    const ref = 'ref-' + (records.size + 1);
    records.set(ref, { ref, label: item.path, items: [item] });
    composer.insertReference(SOURCE, item.path);
  }
  return finalItems;
}

const mk = (name, type) => ({ path: name, file: new File([new Uint8Array([1])], name, { type }) });
const img = (name = 'image.png') => mk(name, 'image/png');
const pdf = (name = 'report.pdf') => mk(name, 'application/pdf');

test('A1 · three pasted screenshots get paste_image / (2) / (3)', () => {
  const composer = makeComposer();
  const out = add_fixed(composer, new Map(), [img(), img(), img()], { origin: 'paste' });
  assert.deepEqual(out.map((i) => i.path), ['paste_image.png', 'paste_image(2).png', 'paste_image(3).png']);
  // the dock chip and the upload body must never disagree
  for (const i of out) assert.equal(i.path, i.file.name);
});

test('A2 · non-image pasted files keep their own extension', () => {
  const composer = makeComposer();
  const out = add_fixed(composer, new Map(), [pdf(), mk('a.zip', 'application/zip')], { origin: 'paste' });
  assert.deepEqual(out.map((i) => i.path), ['paste_file.pdf', 'paste_file.zip']);
});

test('A3 · a second, later paste batch collides against the LIVE composer state', () => {
  const composer = makeComposer();
  const records = new Map();
  add_fixed(composer, records, [img()], { origin: 'paste' });
  const second = add_fixed(composer, records, [img(), img()], { origin: 'paste' });
  assert.deepEqual(second.map((i) => i.path), ['paste_image(2).png', 'paste_image(3).png']);
});

test('A4 · the records cache is NOT the authority: a flapping snapshot must not mis-number', () => {
  // The fixture's alive-subscription deletes a record whenever a snapshot momentarily shows
  // no occurrences. Simulate exactly that, then paste again.
  const composer = makeComposer({ flap: true });
  const records = new Map();
  add_fixed(composer, records, [img()], { origin: 'paste' });
  const snap = composer.getSnapshot();            // the flap: momentary empty snapshot
  assert.equal(snap.occurrences.length, 0);
  for (const [ref, rec] of records) {             // what the v0.2.10 subscription does
    const alive = snap.occurrences.some((o) => o.source === SOURCE && o.ref === ref);
    if (!alive) records.delete(ref);
  }
  assert.equal(records.size, 0);                  // cache now claims "nothing taken"
  const second = add_fixed(composer, records, [img()], { origin: 'paste' });
  // Composer state is still authoritative -> (2), not a duplicate paste_image.png.
  assert.deepEqual(second.map((i) => i.path), ['paste_image(2).png']);
  // A records-cache-driven implementation gets this wrong:
  const wrong = add_v0210(composer, new Map(), [img()]);
  assert.equal([...wrong.values()][0].label, 'image.png');
});

test('A5 · a leaked stale record must not burn a number', () => {
  const composer = makeComposer();
  const records = new Map();
  add_fixed(composer, records, [img()], { origin: 'paste' });
  records.set('ref-ghost', { ref: 'ref-ghost', label: 'paste_image.png', items: [] }); // leaked
  const out = add_fixed(composer, records, [img()], { origin: 'paste' });
  // The composer only holds one occurrence, so the next free index is (2) — and a ghost
  // record must not push it to (3).
  assert.deepEqual(out.map((i) => i.path), ['paste_image(2).png']);
});

test('A6 · drop and picker keep their real names; in-batch duplicates still rejected', () => {
  const composer = makeComposer();
  const dropped = add_fixed(composer, new Map(), [
    mk('C:\\shots\\photo.png', 'image/png'),
    mk('C:\\docs\\notes.txt', 'text/plain'),
  ], { origin: 'drop' });
  assert.deepEqual(dropped.map((i) => i.path), ['C:\\shots\\photo.png', 'C:\\docs\\notes.txt']);
  assert.throws(
    () => add_fixed(makeComposer(), new Map(), [img('photo.png'), img('photo.png')], { origin: 'drop' }),
    /Duplicate attachment path/,
  );
  // A dropped real name and a pasted name coexist without renumbering the dropped one.
  const composer2 = makeComposer();
  add_fixed(composer2, new Map(), [img('photo.png')], { origin: 'drop' });
  const pasted = add_fixed(composer2, new Map(), [img()], { origin: 'paste' });
  assert.deepEqual(pasted.map((i) => i.path), ['paste_image.png']);
});

test('A7 · smallest free index is reused after a deletion', () => {
  const composer = makeComposer();
  add_fixed(composer, new Map(), [img(), img(), img()], { origin: 'paste' });
  composer.occurrences.splice(1, 1); // the (2) chip was removed
  const out = add_fixed(composer, new Map(), [img()], { origin: 'paste' });
  assert.deepEqual(out.map((i) => i.path), ['paste_image(2).png']);
});
