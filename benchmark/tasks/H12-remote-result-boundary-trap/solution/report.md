# H12 Diagnostic Report (Reference Answer)

## Root Cause

In dsh 0.1.2-alpha.2 an ordinary unary Remote call **resolves** to a
`RemoteResult<T>`: business, carrier, and cancellation failures surface as the
`{ ok: false, error }` branch of the resolved result — the Promise does **not**
reject, so an ordinary failure never enters `catch`. The current code never
checks `result.ok` and reads `result.value` as if every resolved result were a
success. Note for precision: the `RemoteResult<T>` shape itself is not new to
alpha.2 — it already resolved to `{ ok: true, value } | { ok: false, error }`
since the earlier rc.2 boundary; the alpha.2 change this task relies on is the
unified failure vocabulary and the runtime boundary, not the result shape.

## Problems in the Current Code

1. `result.value` is read before `result.ok` is checked, so a failure branch is
   consumed as a success;
2. the `catch` can only see genuine rejects (assembly/programming faults) — it
   never receives an ordinary `ok: false` business failure, yet it is written as
   the business-failure path;
3. `instanceof RemoteError` is used as the primary discriminator, which misses
   across bundles, workers, and realms;
4. the trailing `return retry(...)` converts genuine assembly/programming
   rejects into retryable business failures instead of letting them propagate.

## Corrected Implementation

```ts
const result = await ctx.remote.session.rename({ sessionId, title })

if (!result.ok) {
  handleRemoteFailure(result.error)
  return
}

return result.value
```

## RemoteResult Control Flow

- success: `ok: true` carries `result.value`;
- ordinary failure: `ok: false` carries `result.error`;
- the Promise stays resolved for ordinary unary failures — it does not reject,
  so `catch` is not the ordinary business-failure path.

## Reject Boundary

- assembly/programming faults — wrong argument count, an unmounted method, a
  missing Context adapter — can still reject;
- a genuine reject must propagate and be exposed for fixing; it must not be
  swallowed, retried, or converted into an ordinary business failure.

## Error Boundary

- never discriminate failures with `instanceof RemoteError`; branch on
  `error.code` (structural discrimination survives bundles, workers, and realms);
- `isRemoteFailure` (from `@deepseek-ai/dsh-api-gateway/client`) belongs only at
  a real throw/catch boundary — e.g. an explicitly thrown `result.error` or a
  stream terminal failure — it is not a replacement for the ordinary
  `RemoteResult.ok: false` branch.
