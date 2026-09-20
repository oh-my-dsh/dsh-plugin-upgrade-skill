# How the shell renders the input dock (alpha.2 conversation package)

The 'conversation.input.dock' slot is a list slot (scope: session). The shell
mounts every registered entry as children of ONE shared error boundary:

```
<DrawerErrorBoundary>          <- nearest boundary for EVERY dock entry
  <DockEntry id="dsh-paste-input-dock" />   (plugin B, order 5)
  <DockEntry id="progress" />               (plugin A, order 20)
  ...
</DrawerErrorBoundary>
```

React error-boundary semantics: a render throw from ANY child unmounts the
entire subtree under the nearest boundary. The boundary here wraps the whole
entry list, so one crashing entry removes every co-tenant entry from the
screen until the boundary resets. There is no per-entry boundary in alpha.2.

Slots other than the dock (e.g. 'conversation.input.left', where plugin B's
attach button lives) are mounted under DIFFERENT boundaries - a dock crash
cannot touch them.
