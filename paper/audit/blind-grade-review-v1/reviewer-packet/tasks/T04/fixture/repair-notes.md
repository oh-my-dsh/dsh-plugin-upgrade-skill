# External repair session notes (a different agent CLI, run outside dsh)

## What we found
- The npm global package directory held rc.1 package content, but the install was
  NON-STANDARD: the directory had been replaced/manually swapped, and the dsh / dsh.cmd
  shims were never generated — so the dsh command was actually dead.

## What we did
1. Repaired the shims by RE-RUNNING the formal install from the registry:
   npm install -g @deepseek-ai/dsh@0.1.2-rc.1
   -> dsh / dsh.cmd / dsh.ps1 all regenerated; dsh --version -> 0.1.2-rc.1
2. Aligned the source checkout (the workspace used for host-source reference) from the
   alpha.5 tag to the dsh-v0.1.2-rc.1 tag; no local-modification conflicts.

## Key finding
- Diff dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1: 252 files, ALL of them package.json version
  bumps. Zero API/feature changes. Plugins migrated for 0.1.2-alpha.x need no re-migration.

## Left for the user
- Real-machine verification: start dsh --profile web, hard-refresh the browser, confirm
  plugins load (whale / progress / etc.).
- Optional cleanup of the dsh-old-* backup directories once rc.1 is confirmed.
