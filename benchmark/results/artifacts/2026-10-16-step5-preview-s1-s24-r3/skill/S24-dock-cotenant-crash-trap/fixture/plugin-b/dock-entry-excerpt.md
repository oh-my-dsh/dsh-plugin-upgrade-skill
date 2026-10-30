# Plugin B - paste/attachment plugin: dock registration (excerpt)

Plugin B registers two surfaces:

```js
// 1. The attach button - a DIFFERENT slot (composer left controls):
scope.slots.inject('conversation.input.left', () => scope.slots.register({
  name: 'conversation.input.left',
  id: 'dsh-paste-input-button',
  order: -100,
}, AttachButton))

// 2. The attachment chips rail - a 'conversation.input.dock' entry (the SAME
//    slot plugin A's progress strip uses):
scope.slots.inject('conversation.input.dock', () => scope.slots.register({
  name: 'conversation.input.dock',
  id: 'dsh-paste-input-dock',
  order: 5,
}, AttachmentChips))
```

`AttachmentChips` renders the chips for pasted/dropped files. It reads only
its own injected state (`inject: sessionId => ({ remove, add })`) - it uses NO
standard-kit hooks at all. Its render path contains no thrown error (its own
try/catch around the fold scan logged nothing).
