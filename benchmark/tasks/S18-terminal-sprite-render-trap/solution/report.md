# S18 report — The terminal sprite render trap

## 1. Phantom pixels: the SGR background persists into the empty half of a half-filled cell

The renderer draws each sprite pixel-pair as one half-block glyph. When only ONE half of
the pair is colored (the usual case at the sprite's right/bottom edges: outline, Z
symbols, heart), the code emits the foreground sequence alone (`ESC[38;2;…m`) — it
never touches the background plane. SGR state persists across cells until explicitly
reset, so whatever background color the PREVIOUS cell set (a body or belly pixel) is
still active; the terminal fills the glyph's empty half with that stale background,
painting a phantom pixel just outside the artwork. That is why the noise hugs the right
edges of the outline, the Z symbols, and the heart: those are exactly the boundary cells
with one transparent half.

Fix: on every half-filled cell, reset the background plane explicitly —
`fg(up) + "\x1b[49m"` (or `fg(lo) + "\x1b[49m"` for the lower half) — so the empty
half renders in the terminal's default background.

## 2. Ghost frames: trailing-trim + text-pipeline whitespace handling

The renderer dropped each row's trailing transparent cells (`out.replace(/[ ]+$/,
"")`) so a row's visible width matched its bounding box. But the terminal keeps
whatever was last painted in those columns: when the animation switches from a WIDE
pose (tail swung out) to a NARROWER one, the surplus columns still show the previous
frame's tail pixels — the narrow frame never repaints them. Worse, the text pipeline
may trim trailing whitespace itself, so even "spaces" are not guaranteed to overwrite.

Fix (two halves): emit EVERY row across the full sprite width (transparent cells as
plain spaces — blank cells are re-output and overwrite whatever the previous frame
painted there), and close each row with an erase-to-EOL (`ESC[K`) so the terminal
itself clears every cell past the row's last glyph. Frame switches are then clean by
construction.

## 3. Frame data drift: pin every frame with digests, not just the excerpt

The digest report shows exactly one mismatched frame — the hand-ported `tail2`, with
23 differing cells concentrated in a 6-pixel tail-tip cluster drawn one column off. Two
process failures combined: the hand-copy drifted during conversion, and the regression
added afterwards only covered an excerpt of a DIFFERENT frame, so the drift passed every
check. Fix: digest ALL frames (sha256 of each frame's rows) against the source art and
assert the digests in the regression — any future hand-edit or re-port that drifts a
single cell fails the suite.

## 4. The hang: a rescheduling timer chain pinned the event loop

The CI job finished all its checks and then sat idle until killed (19 minutes observed
locally; the runner timeout is the backstop). At kill time the event loop had live
handles of kind Timeout — one per animation tick, each re-arming the next: the planner
reschedules a `setTimeout` for as long as its component stays mounted. The newly
default-on feature made probe hosts (which mount the header and finish WITHOUT
unmounting it) acquire this evergreen chain, and the chain pins Node's event loop — the
process cannot exit. The interactive terminal is unaffected because its process is kept
alive by the TTY/stdin handles regardless.

Fix: `timer.unref()` on the planner's rescheduling timeout — the chain keeps animating
a live session but never holds a probe process open by itself.

## 5. Prevention

Renderer contract checklist for any terminal half-block sprite implementation:

- half-filled cells reset the background plane explicitly (`ESC[49m`);
- every row spans the full sprite width (blank cells re-output as spaces) and closes
  with `ESC[K`;
- rows close the SGR state they open;
- frame DATA is pinned: per-frame digests against the source art, asserted in the
  regression (hand-ported frames drift a few cells at a time, and excerpt-based
  regressions miss exactly that).

Rollout audit before flipping an animation feature default-on: audit every host that
mounts the component for timer hygiene (does the feature introduce an ever-rescheduling
timer? unref it or prove unmount), and run the probe/test hosts that mount-without-
unmount — they are the first to hang. The flip and the timer audit belong in the same
change: the hang appeared in the exact push that flipped the default.
