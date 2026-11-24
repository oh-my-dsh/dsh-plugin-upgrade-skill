# S13 fixture - Peer range vs runtime evidence pack (static)

Evidence for the S13-peer-range-vs-runtime task. **Read-only fixture - do not execute or publish
anything here**; the task grading requires this directory to be unchanged relative to git HEAD.

- `npm-install-output.txt` - npm install succeeded, no peer warnings
- `crash-stack.txt` - the startup crash stack trace
- `plugin-source-excerpt.js` - where the plugin reads the removed API
- `dsh-changelog-excerpt.md` - the relevant dsh release notes