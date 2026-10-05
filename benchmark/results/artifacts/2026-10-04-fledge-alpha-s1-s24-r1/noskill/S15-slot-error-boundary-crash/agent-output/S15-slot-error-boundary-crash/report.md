# S15 report — Vanishing Dock Chips: slot error-boundary crash

## 1. Exact root cause

The throwing expression is in `AttachmentChips`:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
```

`busy` is not in scope there. `busy` is local state inside `AttachButton` (`const [busy, setBusy] = React.useState(false)`), so `AttachmentChips` renders a free identifier. When evaluated, it throws `ReferenceError: busy is not defined`.

It throws only when a chip renders because of the early return:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;
```

The empty dock never reaches `occurrences.map(...)`, so the bad `disabled` expression is never evaluated. `AttachButton` itself is unaffected because its `busy` is in its own closure.

The `||` short-circuit explains the latency. `a || b` only evaluates `b` when `a` is falsy. So `busy` is reached only when `(props.input?.phase ?? 'plain') !== 'plain'` is false, i.e. usually when the phase is `'plain'`/missing. During paths where the phase guard was truthy, the left side made the button disabled and the undefined `busy` lookup was skipped. v0.2.11 made the first chip render hit the falsy-phase path, so the latent identifier was finally evaluated.

The symptom is "the whole dock vanished" because the dock is mounted through the InputZone slot. A throw during render of the slot component is caught by the framework error boundary, which unmounts that slot entry. The attach button is a different slot (`input.left`), so it remains. `props.add` may already have completed successfully, so paste/attach still works. The user gets no in-app banner; the failure is effectively console-only unless they open devtools.

## 2. Why the v0.2.11 hover-preview diff is the wrong first conclusion

The v0.2.11 diff touches `AttachmentChips`, so it looks guilty: it adds `imageItem`, `record?.items.find(...)`, `hover-card`, `onClick`, and `objectUrlOf(...)`. But the evidence separates "new feature crashed" from "old latent bug first exercised".

Correct bisection:

- Roll back only the hover-preview additions while keeping the v0.2.10 `disabled: ... || busy` line. If the crash persists, the hover code is not the cause.
- Keep the hover-preview lines but remove/fix only the free `busy` reference. If the crash disappears, `busy` was the trigger.
- Add a minimal mount: render `AttachmentChips`/`AttachmentDock` with `props.input.occurrences` containing one matching occurrence. Empty state passes; one present occurrence fails at render. That points before the feature UX and straight at the chip render path.
- A rollback/re-add matrix should show: v0.2.10 + no data-present render = looks OK; v0.2.10 + data-present mount = fails; v0.2.11 hover code + fixed `busy` = passes.

Evidence for "old latent bug exercised now": the invariant symptom aligns with the pre-existing line's scope (`busy` is an `AttachButton` local, not a chip prop), the failure disappears when that identifier is removed, and it is independent of hover. The hover lines may be fragile, but they are data/event-path errors; they do not explain a persistent console ReferenceError naming an undeclared local from the button.

## 3. Fix and hardening

Remove the dangling reference:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

Or, if remove must be disabled while attach is busy, pass a real busy signal explicitly, e.g. `props.input?.phase !== 'plain'`, a shared store value, or `props.busy` threaded from the parent. Do not close over `AttachButton` state.

The diff should also get two cheap defensive patterns:

```js
const items = record?.items ?? [];
const imageItem = items.find(item => isImagePath(item.path));
```

and:

```js
onClick: imageItem === undefined ? undefined : event => {
  const close = event.target?.closest?.('.remove');
  if (close) return;
  openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
},
```

These matter in slot components because host-provided records can be partial, occurrences can outlive records, and click targets can be SVG/text nodes or absent. Failing to "no preview" or "use occurrence.label" is much better than throwing inside a slot render and unmounting the whole entry.

## 4. Regression that would have caught it

Add a render smoke that mounts the dock/chip component with one occurrence present, not the empty state. Assert the chip element renders and the slot error boundary did not capture. Cover at least phase `'plain'` and phase not `'plain'`:

```js
const onError = vi.fn();
render(
  <SlotErrorBoundary onError={onError}>
    <AttachmentDock input={{ phase: 'plain', occurrences: [{ source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' }] }} />
  </SlotErrorBoundary>
);
expect(screen.getByText('shot.png')).toBeInTheDocument();
expect(onError).not.toHaveBeenCalled();
```

The existing empty-dock test is insufficient because `AttachmentChips` returns `null` before the throwing line when `occurrences.length === 0`.

## 5. Release-process lesson

`node --check` only proves the file parses. It does not prove identifiers resolve, props match the host shape, records exist, or the component can render with data. For a lib-only plugin, the dangerous bugs appear at mount time inside the host's slot renderer, often only when an occurrence is present.

Minimum viable pre-ship check: lint with scope rules (`no-undef`/TS noImplicitAny as applicable) plus a CI render smoke under jsdom for every slot component, mounting with representative data present and asserting no error-boundary capture. Syntax check alone is not a release gate.
