# Bug report: progress strip AND paste chips both gone after host upgrade

**Environment**: dsh web, Windows, npm global. Upgraded in place
`@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2, restarted the host,
hard-refreshed. Six external plugins, junction-linked.

**What broke — two things at once**:

1. The session-progress strip (the resident bar above the composer that shows
   running state, todos percent, token usage) is completely gone. Not collapsed,
   not errored — the whole strip is absent from the dock area.
2. Pasting a file no longer shows its chip rail above the composer: the paste
   itself is intercepted (a toast appeared once), the attach button on the left
   of the composer is still there, but the chips row never renders.

**What still works**: whale title bar, file-trace panel, input recall chords,
everything else.

**Console** (F12, after a paste attempt): exactly one error — see
`console-excerpt.txt`.

Everything worked on alpha.1 this morning.
