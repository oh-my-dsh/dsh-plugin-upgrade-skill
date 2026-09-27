# Browser forensics: reproducing and instrumenting the real GUI

When a DSH Web failure is invisible to logs — a generic fallback string, a
silent no-op, or behavior that differs between browser engines — the only
decisive evidence comes from the running page. This reference gives the
toolchain: authenticated headless-browser control over the real GUI,
temporary instrumentation of served bundles, and the discipline for
reverting both. It was extracted from a real 2026-09 incident (the case
study at the end).

## Why a driven browser, not a user with DevTools

A user-reported screenshot documents the symptom, not the cause. The
failure classes that need this toolchain:

- Fallback copy that names the feature, not the failing layer (「文件资源服务
  不可用。」 says "file resources"; the break was URL parsing).
- Silent no-ops where nothing throws and no request leaves the page.
- Engine-dependent behavior: the code path runs correctly under Node, under
  jsdom, and under most browsers, and fails only on the user's engine
  version.

In all three, the decisive line of evidence comes from a log statement that
does not exist in the shipped bundle — you add it, load the page, and read
it.

## Accessing the authenticated GUI from a script

`dsh web` guards the index behind a browser-session cookie minted from a
per-launch token. The durable signing secret lives in the credential store
(`$DSH_HOME/.credentials.yaml`, record `client-connection/browser-session`),
and the cookie is a fixed format, so a forensics script can mint its own
session:

- cookie name: `dsh-auth-<base64url(sha256(authority))>` where authority is
  the `Host` header value (e.g. `127.0.0.1:3080`);
- value: `v1.<base64url(payload)>.<base64url(hmacSHA256(secret, payload))>`
  with payload `{version: 1, authority, issuedAt, expiresAt}` and the
  window kept inside the deployment's `cookieMaxAgeDays`;
- implementation detail that bites: createHmac's key is the **decoded
  32-byte secret**, not the base64url string.

Read `BrowserAuth` in `@deepseek-ai/dsh-client-connection` once and mirror
it.

> **Warning — the minted cookie and the signing secret are live
> credentials.** Anyone holding the cookie has a full authenticated session
> on that `dsh web` instance until it expires, and anyone holding the
> secret can mint more. Never paste the cookie, the secret, or the
> `.credentials.yaml` record into a chat, issue, PR, log excerpt, screenshot
> or bug report; redact them from CDP traces before sharing. Keep the
> minting script local and read the secret at run time instead of
> hard-coding it. To revoke, delete the `client-connection/browser-session`
> record.

## Driving the page (Node + CDP, no extra dependencies)

Node >= 22 ships a global `WebSocket`, which is all Chrome DevTools Protocol
needs:

1. Launch a headless browser with a debug port and a throwaway profile:
   `msedge --headless=new --remote-debugging-port=<port>
   --user-data-dir=<tmp> about:blank`.
2. `fetch('http://127.0.0.1:<port>/json/list')` -> grab the page target's
   `webSocketDebuggerUrl`, connect.
3. `Network.setCookie` the minted cookie for the GUI origin, then
   `Page.navigate`.
4. Subscribe to `Runtime.consoleAPICalled` and
   `Runtime.exceptionThrown` — collect everything; filter later. Console
   capture is the whole point.
5. `Runtime.evaluate` for DOM survey and clicks (find the button by
   `title`/`aria-label` text, `.click()` it, sleep, read the resulting
   pane text). This gives UI-level E2E: the click, the network requests it
   triggers (`Network.requestWillBeSent`), and the rendered outcome in
   one trace.

Two verification rules:

- A "works in my headless browser" result is only meaningful if the
  headless engine matches the failing one. Pin the executable you launch;
  when reproducing an engine-specific bug, launch the user's engine binary.
- Assertions should check all three: the failure string is gone AND the
  expected request was sent AND the expected content rendered. Any one
  alone has produced false "fixed" verdicts.

## Temporary bundle instrumentation, safely

The served client bundles are plain files under the installed tree
(`…/@deepseek-ai/dsh/node_modules/@deepseek-ai/<pkg>/lib/client.js`).
The combo URL embeds a rev the host computed at boot, so editing a file
changes served bytes on the next page load without any host restart.

Discipline that keeps this reversible:

1. Back up before every patch round — `cp <file> <file>.bak` (POSIX
   shells) or `Copy-Item <file> <file>.bak` (PowerShell); one patch round
   adds exactly one decisive log line (e.g. the inputs AND the branch
   result of the suspect function), not a scatter of traces.
2. Reload the driven browser, read the line, restore from `.bak`
   immediately — do not iterate with instrumentation accumulating.
3. At the end, grep every touched file for the debug marker to prove the
   tree is clean, and delete the backups.
4. Never leave an instrumentation patch in place as a "fix"; and
   conversely, a real hot-fix patched into the install tree is lost on the
   next `dsh` upgrade — record it for reapplication (an upstream issue
   comment outlives the patch).

One caution on evidence quality: a single instrumented line that prints
input, parsed intermediate, and decision together (`addr=… parsedHost=…
protocolOf=…`) is worth ten lines that each print one value — correlation
in one record is what rules out race-based explanations.

## Case study: 「文件资源服务不可用。」 on 0.1.6-alpha.2 (2026-09)

Symptom: on the maintainer's Edge, clicking any file in the right-sidebar
file tree opened a preview tab showing the fallback string; Network showed
no `workspaceFiles/stat` at all. A file-trace plugin reading the same file
via its own RPC worked.

Dead ends, all verified clean (and all reported by earlier forensics as the
suspected cause): `__DSH_BOOT__` complete, combo bytes correct, module
activation fine, provider registered (`providerOf('file')` returned the
provider), zero `client-modules` reconcile failures. A first conclusion —
"the file provider is silently unregistered" — was wrong.

The decisive instrument: one log in `ResourceRegistry.create()` printing
address, parsed protocol, and the provider table:

```
[res-debug] create record addr="dsh-resource://file/session/<id>/AGENTS.md"
parsedProto=dsh-resource: parsedHost="" protocolOf=undefined
providers=["subagentchat","plan","file"]
```

Root cause: `protocolOf()` in `dsh-client-resources` read the protocol from
`new URL(address).hostname`. `dsh-resource:` is a non-special scheme. The
WHATWG URL Standard is not ambiguous here: a non-special URL written with
`//` has an (opaque) host, so `new URL('dsh-resource://file/…').hostname`
must be `"file"` — which is what Node 24 and Chrome 153 return. Chromium
before its standards-compliant non-special URL parsing change (the
`StandardCompliantNonSpecialSchemeURLParsing` work, shipped around
Chrome 130) treated everything after the scheme as an opaque path and
returned `""`. An Edge that returns `""` therefore implies an older
Chromium-based Edge build (or one where that change is not yet enabled),
not a legitimate spec variant. Record the exact Edge version
(`edge://version`, or `navigator.userAgent` / `Browser.getVersion` over CDP)
in the report so the divergence can be matched to the Chromium base. The
router then asked for a provider by `undefined` forever; the store stayed
at `status:'none'`, which is exactly what the fallback string renders.

Cross-engine confirmation (same address, driven headless browsers): Node
`hostname="file"`, Chrome 153 `hostname="file"`, Edge `hostname=""`. That
table — not the symptom — is what made the diagnosis defensible; add the
Edge version string to it when you reproduce this, because it is what ties
the `""` to an older Chromium base. Hand parsing (below) is still the right
fix: the plugin cannot choose which Edge build its users run.

Fix (hot-patched into the install tree, reported upstream): parse the
protocol by hand —

```js
function protocolOf(address) {
  const prefix = 'dsh-resource://';
  if (!address.startsWith(prefix)) return undefined;
  const rest = address.slice(prefix.length);
  const end = rest.search(/[/?#]/);
  const host = (end === -1 ? rest : rest.slice(0, end)).toLowerCase();
  return host === '' ? undefined : host;
}
```

— and sweep for the same pattern: `dsh-client-ui-subagent`'s
`parseSubagentChatAddress()` routed `dsh-resource://subagentchat/…` by
`url.hostname` too and failed on the same engines.

Verification in the failing engine: click a file -> `workspaceFiles/stat`
and `read` fire -> content renders -> fallback string gone. Lesson kept in
`SKILL.md` as standing question 4: **which engine evaluates this line** — a
URL property on a custom scheme is not a contract until the target browser
engine has honored it.
