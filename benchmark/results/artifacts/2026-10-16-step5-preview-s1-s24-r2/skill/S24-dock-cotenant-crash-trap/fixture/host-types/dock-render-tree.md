# How the shell renders the composer slots (alpha.2 conversation package)

The 'conversation.input.dock' slot is a list slot (scope: session). Simplified
mount tree of the composer area as rendered by the alpha.2 conversation package
(React DevTools component view, both plugins enabled):

```
<Composer>
  <InputLeft>
    <DrawerErrorBoundary name="input.left">
      <SlotEntry id="dsh-paste-input-button" />   (plugin B, order -100)
    </DrawerErrorBoundary>
  </InputLeft>
  <InputDock>
    <DrawerErrorBoundary name="input.dock">
      <DockEntry id="dsh-paste-input-dock" />     (plugin B, order 5)
      <DockEntry id="progress" />                 (plugin A, order 20)
      ...
    </DrawerErrorBoundary>
  </InputDock>
  <Textarea />
</Composer>
```

`DrawerErrorBoundary` is a standard React class boundary
(`getDerivedStateFromError` → renders `null` as its fallback, resets on the next
session switch). `DockEntry` itself adds no boundary of its own.
