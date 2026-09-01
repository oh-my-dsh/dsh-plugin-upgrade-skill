# H10-browser-activation-trap · Browser Activation Trap

The agent repairs a renamed Web plugin whose bundle still registers its legacy
identity. The verifier runs Chromium: boot-manifest presence and HTTP 200 are
partial credit, while actual client activation is required for a full score.

- **Environment**: Node 24 + dsh 0.1.2-alpha.2 + system Chromium + Playwright Core.
- **Verifier**: fixture changed (else 0), plugin add (10), boot entry (15), bundle HTTP 200 (15), browser activation marker with no package activation failure (60).
- **Oracle**: `harbor run -p benchmark/tasks/H10-browser-activation-trap -a oracle`, expected reward 1.0.
