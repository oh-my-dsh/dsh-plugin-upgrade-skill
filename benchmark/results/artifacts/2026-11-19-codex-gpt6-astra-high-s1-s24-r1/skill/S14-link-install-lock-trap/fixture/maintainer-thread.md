# Maintainer thread — @org/dsh-attach-input v0.2.11 verification

I maintain a lib-only Web plugin (no build step; `lib/client.js` + `lib/index.js` are the
shipped files). Today I:

1. Edited `lib/client.js` and `lib/index.js` directly in the repo at `E:\dev\dsh-attach-input`
   (a hover-preview feature for image attachments, plus a new read-only host route).
2. Told the user "restart dsh web and hard-refresh the browser to verify".
3. The user refreshed the browser tab only — nothing changed (old behavior, no preview).
4. I assumed the profile must be running an installed COPY of the plugin, so I tried to
   Copy-Item the new lib files into the profile's node_modules (see copy-session.txt) —
   EBUSY on every attempt, even after the browser tab was closed.
5. I tried renaming the locked files aside and copying replacements in; the copy failed
   with "source does not exist" and BOTH directories ended up with only the renamed
   .old2 files (the plugin is now completely broken — no entry files at all).
6. profile-introspection.txt shows what I found when I finally looked at what the profile
   entry actually IS.

Questions I need answered in the report:

- Why did the browser refresh show nothing new, and why were the lib files "in use" even
  with no browser tab open?
- What does the Junction + Target actually mean for "deploying" my repo edits to the
  profile — was step 4 (Copy-Item into node_modules) ever necessary for THIS install?
- Why did the rename-aside trick in step 5 make the SOURCE directory lose its files too,
  and what is the correct recovery from the current broken state (only .old2 files exist)?
- What is the correct, complete activation procedure for a link-installed lib-only Web
  plugin after editing its repo files — which processes must restart, in what order, and
  what does the browser need (and why can it still show stale code after the host
  restarted)?
- How should I have determined the install mode BEFORE touching any files?
