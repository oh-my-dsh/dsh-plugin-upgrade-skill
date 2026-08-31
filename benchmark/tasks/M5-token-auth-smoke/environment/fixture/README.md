# @demo/dsh-bench-ping (fixture)

DSH benchmark M5 fixture: a web plugin registering a self-built `/ping` HTTP
channel directly on the web server. The trap state is intentional — the raw
`webServer.register` prefix route answers `pong` with 200 and no host
authentication.

Exam material only, **do not publish** (`"private": true` in package.json).
