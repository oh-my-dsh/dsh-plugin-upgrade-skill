# S18 · Terminal Sprite Render Trap

Static, read-only. A terminal pixel sprite (the dsh-TUI whale, 25x40 cells rendered with
half-block glyphs) shows phantom pixels along its right edges (outline, Z symbols,
hearts), ghost pixels surviving frame switches, and a drifted hand-ported frame; flipping
the animation feature default-on then hangs a channel-ui CI job until its timeout.

Derived from the real 2026-09-05 dsh-TUI whale follow-up session (tail-tip pixel drift,
half-block SGR background leak, trailing-trim ghosting, planner timer pinning a probe
host).

- Type: static / read-only report
- Score: 5 aspects × 20 points, fixture-modification gate → 0
- **Oracle**: `harbor run -p benchmark/tasks/S18-terminal-sprite-render-trap -a oracle`, expected 1.0.
- See `instruction.md` for the brief, `solution/SOLUTION.md` for the reference answer.
