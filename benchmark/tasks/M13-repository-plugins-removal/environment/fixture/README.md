# @demo/dsh-bench-repo (exam material only, do not publish)

A small 0.1.1-era **repository-plugin** sample: the Node half lives under
`.dsh-plugin/`, the manifest `.dsh-plugin/package.json` declares `dsh.entry →
./index.js`, and the browser half is a self-executing script that the entry serves
at `/pet/ui.js` and injects into the page.

The host in this container is dsh **0.1.2-alpha.2**.

This fixture is exam material only — never publish it to npm.