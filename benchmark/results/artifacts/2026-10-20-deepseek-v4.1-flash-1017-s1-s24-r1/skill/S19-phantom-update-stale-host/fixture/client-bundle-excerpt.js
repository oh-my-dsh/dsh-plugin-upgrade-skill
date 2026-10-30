// Verbatim excerpt of the SHIPPED lib/client.js for the v0.3.7 tag
// (the file actually served to the browser after the release).
// The self-update check compares its own baked version against the newest
// mirror tag and shows an update badge when latest > PLUGIN_VERSION.

/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT —
// it is not read dynamically at runtime.

function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag
    : undefined;
}
// newerTag("v0.3.7") with PLUGIN_VERSION "0.3.6" -> "v0.3.7"  → badge shows
// "新版本 v0.3.7 可用" on the just-released v0.3.7 itself.
