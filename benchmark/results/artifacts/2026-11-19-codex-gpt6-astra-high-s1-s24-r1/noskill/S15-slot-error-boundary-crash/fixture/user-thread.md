# Issue — "the chips above the input are GONE in v0.2.11" (user: mirren)

> Updated to v0.2.11 (the hover-preview release). I pasted a screenshot to try the new
> preview, and the little chip that used to appear above the input box — the one with the
> filename and the x button — never showed up. The paste itself worked (the message sent
> with the image attached). The attach button (the + on the left of the input) is still
> there. Nothing else looks broken, and I don't see any error banner in the UI.

Maintainer note (me): v0.2.11's diff touched AttachmentChips (the dock-chip component) to
add the hover preview — see feature.diff. In v0.2.10 the same component already had the
line `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy` (added in a hardening
pass), and v0.2.10 users used the x button fine. The plugin registers the dock through the
InputZone slot; a slot entry that throws during render is caught by the framework's error
boundary and unmounted (the error is only visible in the browser console, which users
never open). We shipped without a render smoke that mounts the dock with a chip present.
