# Upstream provenance

- Repository: [`omdsh-dev/dsh-data-agent`](https://github.com/omdsh-dev/dsh-data-agent)
- License: MIT; the unchanged upstream `LICENSE` is present in the fixture.
- Source: tag `v0.1.3`, commit `8e3ab6a3560733c11417bdf2912c9db4f09a6974`,
  tree `bb08c66de2f0712501d0aa74e51223b7c7f98889`.
- Target: tag `v0.1.4`, commit `d1bd4381ed771d505db69f2a9065379f7d3165a0`,
  tree `c905a4422bd825a0bb6c4c2408ef2dc3fffdc2f6`.

The source fixture is the complete tracked v0.1.3 tree. Nothing is curated out:
Markdown, committed build output, source maps, declarations, tests, lockfile, and
binary assets are all copied byte for byte. The Oracle target is the exact set of
34 paths that differ in the complete v0.1.4 tree; there are no deleted paths.

Three documentation-only commits sit between the tags before the compatibility
commit. They are retained because the benchmark compares the two published tags,
not a hand-picked parent commit. The final compatibility commit is
`d1bd4381ed771d505db69f2a9065379f7d3165a0`; it touches the same 34-path set, while
the final README bytes also include the intervening badge edits.

## Rebuild

Create clean worktrees or extract both tags, then run:

```sh
node benchmark/tasks/H22-dsh-data-agent-alpha2/provenance/refresh-from-upstream.mjs \
  /path/to/dsh-data-agent-v0.1.3 \
  /path/to/dsh-data-agent-v0.1.4
```

The script independently walks both full release trees and fails unless their
byte/mode/presence diff is exactly the locked 34 paths. It then regenerates:

- `environment/fixture/` from every v0.1.3 tracked file;
- `solution/target/` from every changed v0.1.4 path;
- `v0.1.3-source-manifest.json`, `v0.1.4-target-manifest.json`, and the sealed
  verifier copy `tests/target-manifest.json`, each with SHA-256 and mode evidence.
