# S14 · Link-Install File-Lock Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the task: complete the
necessary analysis and planning on your own, and keep executing as soon as the plan is
formed — do not pause to wait for "confirmation", and do not ask the user follow-up
questions. That confirmation continues to apply to the concrete plans you produce under the
applicable skill, but only within this scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain the community Web plugin `@org/dsh-attach-input` (lib-only bundle, no build
step). I just edited the repo's `lib/client.js` / `lib/index.js` to ship a hover-preview
feature, and the verification went wrong in every direction: a browser refresh showed
nothing new, copying the files into the profile's node_modules hit EBUSY, and a
rename-aside recovery left BOTH my repo and the profile with no entry files at all. The
evidence pack in `/app/fixture/` (read-only — do not modify it) has my full PowerShell
session, the filesystem introspection, and my own write-up of what happened.

**Your report** (write to `/app/agent-output/S14-link-install-lock-trap/`, any filename):

1. What the profile entry actually is (cite the introspection): what a Junction install
   means for deployment, and whether copying repo files into the profile's node_modules
   was EVER the right move for this install mode;
2. The two locks and their owners: why a browser refresh shows stale code (which process
   serves the client bundle, what holds the lib files open), and why closing the browser
   tab did not release the EBUSY;
3. Why the rename-aside trick destroyed the SOURCE directory too (both paths are the same
   directory through the junction), and the exact recovery from the current broken state
   (only `client.js.old2` / `index.js.old2` exist — restore the original names, verify
   syntax, then activate);
4. The complete, ordered activation procedure for a link-installed lib-only Web plugin
   after repo edits: which processes must fully stop and restart (host vs browser), why a
   hard refresh (cache bypass) is needed for `client.js`, and how to verify the new code
   actually loaded;
5. The pre-flight check that should come before touching any file: how to determine the
   install mode (link vs copied dependency) from the profile (LinkType/Target,
   cordis.patch.yml install marker), and why the generic "copy into node_modules" advice
   is actively harmful for link installs.

What is tested: recognizing a link/junction install and its deploy semantics (repo tree IS
the installed copy), attributing both locks to the right processes (running dsh host, not
the browser), recovering a rename-aside accident safely, and not applying copied-install
advice to a linked install.
