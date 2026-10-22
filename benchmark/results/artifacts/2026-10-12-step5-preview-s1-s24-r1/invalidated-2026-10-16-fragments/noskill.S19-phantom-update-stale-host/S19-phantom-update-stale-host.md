
---

## 3. Broken-image attribution

### 3.1 Which layer produced the text

The corruption is in the **session-payload text layer** — the read tool's *result assembly*, i.e.
the model-visible result block that was persisted into the session log. It is **upstream of the
plugin**, and upstream of the plugin's render call.

The fixture states it directly (`session-log-excerpt.txt:31-33`):

> The read tool's TYPE result delivered to the caller was clean; the corrupted text is the
> model-visible result block persisted into the session log, i.e. the corruption happened in the
> result-text assembly, upstream of the plugin.

So the tool's structured result was fine; the **rendered text of that result** is what got
corrupted. The plugin never mishandled the file — it was handed text that was already damaged.

### 3.2 The evidence chain

1. **Source file on disk: well-formed.** `System.Xml XmlDocument load: no error`
   (`session-log-excerpt.txt:21`).
2. **Stored session-log payload: NOT well-formed** — `error on line 233 at column 54:
   Specification mandates value for attribute stro0` (`session-log-excerpt.txt:22-23`).
3. **A re-read of the same region afterwards came back clean** (`session-log-excerpt.txt:34`) —
   non-deterministic, therefore not a persistent on-disk defect.
4. **The splice is mechanical and reproducible.** Payload line 232 is source line 232's head glued
   to source line 247's tail at a shared 4-character prefix:

```
source 232:  <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>
                                                                     ^^^^ "stro" (head, cut inside "stroke-width")
payload 232: <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none"
             stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>
source 247:  <path d="M 587,730 A 122,122 0 0,1 821,730" fill="none" stroke="#ffffff" .../>
                                      ^^^^^^^^^^^^ "0 0,1 821,730" (arc flags / tail anchor)
```

My probe (`tmp-probe/forensics_probe.py`) derives the stored line from those two source lines and
the result is **byte-identical to the payload stored in the session log** (`derived == stored:
True`). That is decisive: a random file corruption cannot be re-derived exactly from two lines
fifteen positions apart, and a truncated read would not fuse two distant lines.

**The splice's fingerprint.** Payload line 232 = source line 232 (up to and including the shared
prefix `stro`) + source line 247's tail (from `0,1 821,730"` onward). Source lines **233-247 vanish
entirely** — 15 lines collapse into the tail of one line. This is the signature of a
**chunk-boundary / streaming assembly bug** in result-text assembly: a contiguous window was lost and
the two surviving edges were stitched at their longest common boundary (`stro`, inside
`stroke-width` for line 232 and inside the arc flags of line 247). It is not the signature of disk
corruption (which would hit arbitrary bytes, would be persistent, and would not land on a shared
prefix).

### 3.3 Why the plugin must treat the session payload as untrusted rendering input

- The plugin does not control the machinery that produced the text. It consumed a read result whose
  *structured* form was clean and whose *text* form was silently mangled — the plugin cannot
  distinguish those two from the inside.
- The failure is **demonstrated, lossy, and non-deterministic**: 15 lines of a ~250-line document
  gone in one read, correct in the next.
- The consequence is not cosmetic: a malformed attribute list fails to parse, so the *whole
  document* is unusable, so the `<image>` element paints a broken image. An upstream
  presentation-layer bug surfaces inside the host app as if it were the user's asset.

Therefore the render path must treat the session payload as **untrusted input** and validate it
before it is allowed to become pixels — and it must never assume "the text I was handed equals the
bytes on disk."

### 3.4 Why editing or "repairing" the traced file would have been the wrong move

- **The file is not broken.** It parses. Rewriting a correct asset to accommodate a presentation
  bug is treating the symptom at the wrong layer.
- **It destroys the reproducer.** The exact stored payload text, the splice geometry, and the two
  XML verdicts are what make this a reportable upstream defect rather than a shrug. "Fixing" the file
  to make the preview work erases the only artefact that lets the bug be demonstrated on demand.
- **It does not fix the recurrence.** The bug is in result assembly, keyed to chunk boundaries and
  shared prefixes. Any other sufficiently long SVG would be spliced again. Only the upstream fix
  changes that.
- **It corrupts the tool's own invariant.** This is a *file-trace* plugin whose entire purpose is
  fidelity to the original. Silently rewriting a traced asset to work around a transient display
  bug converts a correct record into a falsified one — the worst possible outcome for this class of
  product.
- **It is based on a transient symptom.** The re-read came back clean, so the "repair" would be
  justified by a one-off observation, with no stable definition of what is wrong.

The correct move: leave the file untouched, record the incident, and report upstream.
