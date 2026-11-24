# Release log — v0.3.7 (reconstructed from the session, timestamps local)

1. 16:20 edit `src/client/markdown.tsx` (frontmatter fix) and add regression tests
2. 16:21 `pnpm run typecheck` — green; `npx vitest run` — 104 passed
3. 16:22 `pnpm run build` — client bundle emitted           ← build ran here
4. 16:23 bump `package.json` version 0.3.6 → 0.3.7          ← version bumped AFTER the build
5. 16:23 README install refs updated to `#v0.3.7`
6. 16:24 `git commit` (includes the already-built `lib/client.js`) and `git tag v0.3.7`
7. 16:25 pushed `main` + tag to the three mirrors (origin / public / omdsh);
   `git ls-remote` verified the tag SHA on all three

Post-release symptom: the plugin's own drawer shows the update badge
"新版本 v0.3.7 可用" on the freshly released v0.3.7 — the plugin reports an update
to itself. A re-release (amend + rebuild + force-move the tag on all mirrors) was
required; the rebuild order was corrected for v0.3.8 (bump FIRST, then build).

# Release log — v0.3.8 (same session, later)

Same session also shipped an SVG render preview feature. After the v0.3.8 push the
client UI showed the new render toggle, but:

- clicking Render produced a broken image for one traced SVG;
- probing the host asset route: a PNG probe returned 200 `image/png`, an SVG probe
  returned 404 "unsupported image type" — while the shipped `lib/index.js` DOES
  contain `svg: 'image/svg+xml'`;
- a host restart had NOT been performed in this session (the client half was
  confirmed refreshed: the new toggle button was rendered by the browser).
