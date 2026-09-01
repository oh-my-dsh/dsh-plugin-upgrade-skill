# H7 fixture · locale trap

A web plugin whose browser half locates the host session-header button by
matching the display text `/session\s*log/i`. The host client copy has been
fully localized (rollup R-13), so the selector silently stops matching on
non-English locales — the injected badge disappears with no error and no
console exception. The trap comment suggests adding a second regex. **Test
material only — do not execute or publish** (`"private": true`).
