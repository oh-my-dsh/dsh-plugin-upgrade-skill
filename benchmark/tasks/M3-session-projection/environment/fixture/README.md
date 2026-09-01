# M3 fixture · session-projection pending

A **self-assembled profile spec** (package.json bundles + cordis.patch.yml): it
mounts `@deepseek-ai/dsh-tool-todo` on a base that lacks the
`sessionProjections` service, so the entry stays
`pending (waiting for services: tools, sessionProjections)` and the plugin tree
fails to load (DSH-0.1.2-A2-08). The trap comment suggests editing the shipped
package's inject — impossible from here. **Test material only — do not execute
or publish** (`"private": true`). The judge constructs a profile from these two
files and cold-boots it.
