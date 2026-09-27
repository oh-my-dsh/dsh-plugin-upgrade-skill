// lib/client.js (excerpt) — the self-update version chip, @org/dsh-attach-input v0.2.10
// The bundle is lib-only (no build step); the running version is hand-inlined here and
// must be kept in sync with package.json at every release.

const PLUGIN_VERSION = '0.2.10';

async function latestFromTags() {
  const res = await fetch('https://api.github.com/repos/org/dsh-attach-input/tags?per_page=10',
    { signal: AbortSignal.timeout(8000) });
  if (res.ok) {
    const tags = await res.json();
    const stable = tags.map(t => t.name).filter(n => /^v\d+\.\d+\.\d+$/.test(n));
    if (stable.length > 0) return stable.reduce((a, b) => (semverCmp(b, a) > 0 ? b : a));
  }
  return undefined;
}

async function startUpdateChip() {
  const tag = await latestFromTags();
  if (!tag) { renderOfflineChip(); return; }
  if (semverCmp(tag, PLUGIN_VERSION) <= 0) { renderCurrentChip(tag); return; }
  renderUpdateChip(tag);
}

function renderCurrentChip(tag) {
  // green chip, auto-dismisses after 4s
  lbl.textContent = '✓ attach-input already the latest version ' + tag;   // ← shows the FETCHED tag
}
