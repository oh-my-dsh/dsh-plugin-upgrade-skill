# H8 Fire Drill — Release Checklist

- Versions bumped: `drill-host`, `drill-web`, `drill-tools` → `0.2.0-alpha.1`
  (prerelease).
- Pre-publish semantic gate: run
  `node skills/plugin-release/scripts/verify-release.mjs` with the version, release
  tag, prerelease state, dist-tag, and current-latest inputs; stop on any failure.
- Dist-tag routing: `0.2.0-alpha.1` is a prerelease, so it must go to a
  project-declared non-latest tag (`next`), never `latest`.
- No forced publish: a failed gate means stop and fix — force-publishing over a
  failing gate is not an option.
- In-container constraint: no publishing was performed here (no credentials;
  publishing is outside the authorized scope).
