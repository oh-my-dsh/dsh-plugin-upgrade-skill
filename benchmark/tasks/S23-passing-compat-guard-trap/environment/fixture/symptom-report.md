# Bug report: input recall dead after host upgrade (no errors anywhere)

**Environment**: dsh web, Windows, npm global. Upgraded in place
`@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2 this morning, restarted the host,
hard-refreshed the browser. Six external plugins, all junction-linked, all show up in
the boot combo and keep working — file-trace panel opens, progress strip renders,
whale title bar is there.

**What broke**: the input-history plugin's Ctrl+Up / Ctrl+Down recall. Before the
upgrade: Ctrl+Up filled the composer with the last sent message, Ctrl+Down walked back.
After the upgrade: pressing the chords does literally nothing. No text appears, no
toast, the chord is not swallowed either — the composer's own multi-line cursor
movement still works, so the capture listener is either not firing or firing and
bailing out.

**What I checked**:

1. F12 console across several minutes of pressing the chords: zero errors, zero
   warnings from the plugin. Nothing.
2. The plugin ships a compatibility guard — it renders a remediation banner when the
   host lacks the APIs it needs. No banner is showing.
3. Re-pasted the junction and hard-refreshed: no change.
4. Disabled every OTHER plugin: no change.
5. The plugin's update chip says it is on the latest version.

The plugin worked perfectly on alpha.1 this morning. I don't even know where to start
because nothing reports failure.
