# @demo/dsh-bench-status (exam material only, do not publish)

A small npm **bundle plugin** sample whose Node half (the packed `lib/index.mjs`,
the `main` entry) is written against the pre-0812 host service names: `inject` is
`['tasks', 'httpServer']`, the task registry is read through `ctx.tasks`, the
`/bench-status/status` route is registered through `ctx.httpServer.register`, and
job completion is subscribed through the `onTaskDone` listener.

The host in this container is dsh **0.1.2-alpha.2**.

This fixture is exam material only — never publish it to npm.