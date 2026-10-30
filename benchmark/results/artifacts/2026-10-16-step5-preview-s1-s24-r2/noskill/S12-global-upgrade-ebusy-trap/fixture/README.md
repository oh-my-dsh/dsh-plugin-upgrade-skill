# S12 fixture - Global upgrade evidence pack (static)

Evidence for the S12-global-upgrade-ebusy-trap task. **Read-only fixture - do not execute or publish
anything here**; the task grading requires this directory to be unchanged relative to git HEAD.

- `attempt1-ebusy.log` - npm install -g output while dsh is running
- `attempt2-downgrade.log` - npm install + version check after the EBUSY fix
- `npm-dist-tags.txt` - the @deepseek-ai/dsh dist-tags listing at the time
- `running-processes.txt` - what was running during attempt 1