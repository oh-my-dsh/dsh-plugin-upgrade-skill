# H22-dsh-data-agent-alpha2 reference solution

The Oracle applies the exact 34-path `v0.1.3..v0.1.4` upstream delta. It does not
reimplement or shorten the migration.

The compatibility chain includes all of these coupled surfaces:

1. bump package/community-manifest versions, declare `dsh >=0.1.2-alpha.2`, replace
   the rc.7 SDK/Cordis graph with the alpha.2 cohort, remove the retired client-runtime
   edge, add the provider packages actually used by the client, and regenerate the
   workspace policy plus lockfile;
2. use Cordis `Context` and explicit alpha.2 client service/type owners, move
   `JsonValue` to `dsh-util-values`, move `ToolCallBlock` to conversation UI, and
   remove the retired Modal prop;
3. read `projectionValues.agentPreset`, retain the session-scoped composer entry,
   and support both Lexical's editor/visible-placeholder pair and the older textarea;
4. shadow the root-scoped `conversation.hero.agentPreset` seat additively, preserving
   the host component and raw inject face while tracking slot replacement and cleanup;
5. hand a Hero request to `uiWorkspace.startSession()`, wait for the new Session's
   data-agent projection, deduplicate pending clicks, publish a revisioned request,
   acknowledge delivery, roll back throws, and unsubscribe on disposal;
6. synchronize CSS, generated client bundle/source map/declarations, conformance
   inventory, bilingual docs, and every upstream regression test changed by v0.1.4.

`provenance/refresh-from-upstream.mjs` proves that this list is not curated: it
computes both complete release trees and fails unless their differing path set is
exactly the locked 34-path set used by the fixture, Oracle target, and verifier.
