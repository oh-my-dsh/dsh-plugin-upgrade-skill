# H7-locale-trap reference solution

## Reference files

See [solution/plugin/](plugin/) — the fix anchors the host UI by the stable
`data-slot` attribute, drops the display-text regex, and asserts the injection
rendered. Expected judge score 100.

## What it tests (one line)

rollup R-13: display-text anchoring breaks silently once the host copy is
localized — anchor by stable slots and make the silent absence observable.
