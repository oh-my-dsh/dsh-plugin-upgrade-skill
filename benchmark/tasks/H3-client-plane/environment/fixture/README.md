# H3 fixture · Browser Plugin (Missing dsh.client Declaration Trap)

Test fixture — **do not publish**. A dual-plane plugin written in the `dsh-paste-input`
shape: the host half `index.js` has no coupling, and the browser half `client.js` goes
through `ctx.remote`.

The trap is in `package.json`: the browser plugin declaration sits in the **top-level
`client` field** (the 0.1.1 legacy convention, which the alpha host does not read), and
the **`dsh.client` declaration required by alpha is missing**. The symptom is silent:
`dsh plugin add` succeeds, the host half activates, but the plugin never appears in the
browser `__DSH_BOOT__.entries`. The comments in `client.js` even discourage you from
touching package.json.
