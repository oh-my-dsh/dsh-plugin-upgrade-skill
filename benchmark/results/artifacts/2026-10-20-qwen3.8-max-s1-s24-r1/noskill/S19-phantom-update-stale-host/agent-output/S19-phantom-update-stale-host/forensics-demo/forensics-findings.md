# Forensics demo — concatenated-zstd session-log decode (synthetic replica)

Purpose: validate the frame-by-frame forensic method of report §5 on a synthetic
replica built to the EXACT corruption shape documented in fixture/session-log-excerpt.txt
(the fixture ships the decoded excerpt only — no real .zst generation file — so the
method is demonstrated on a replica). All artifacts here are synthetic evidence-method
demonstration material, written under agent-output only; the fixture was not touched.

## What was built
- `source-daigo-bicycle.svg` — 250-line well-formed SVG; lines 232/233/247 verbatim from the fixture.
- `session-gen-demo.zst` — concatenated-zstd generation file: 3 independently compressed frames
  (144 + 989 + 1062 bytes = 2195 total), each starting with magic `28 B5 2F FD` (0xFD2FB52F):
  - frame 0 (gen 1): session_start + tool_call events
  - frame 1 (gen 2): the tool_result whose stored text is the CORRUPTED payload
    (payload line 232 = source line 232 up to `...stroke="#dde6ea" stro` + source line 247's tail
    from `0,1 821,730` at col 35; source lines 233-247 absent; 235 lines total)
  - frame 2 (gen 3): clean re-read tool_result (byte-identical to disk source)

## Decode procedure (as executed)
1. Scanned raw bytes for frame magic → offsets 0, 144, 1133.
2. Sliced at boundaries, decompressed each slice independently → 3 JSONL frames recovered.
3. One-shot decode pitfall CONFIRMED: `zlib.zstdDecompressSync(wholeBuffer)` returned only
   frame 0 (206 bytes) — library decoders may stop at the first frame boundary even though
   `zstdcat` continues across frames. Frame-by-frame slicing is mandatory.
4. Extracted stored read-result texts per frame →
   `decoded-frame1-gen2-read-result.txt` (corrupted), `decoded-frame2-gen3-read-result.txt` (clean).
5. Hashes: gen-3 re-read sha256 == disk source sha256 (4ac6188a...62ad); gen-2 payload differs (f2ce0920...e70e).
6. XML verdicts (System.Xml.XmlDocument, same method as the fixture's verdict):
   - source file  : well-formed
   - gen-2 payload: NOT well-formed — line 232 col 54: "',' is an unexpected token. The expected token is '='."
     (parser tokenizes attribute name `stro0` — comma is not an XML NameChar — then demands `=`;
     fixture's libxml verdict: "Specification mandates value for attribute stro0", line 233 col 54: same column, same defect)
   - gen-3 re-read: well-formed
7. Splice analysis: longest common prefix of payload line vs source line 232 = 52 chars ending
   exactly at `...stroke="#dde6ea" stro`; the remainder is a verbatim tail of source line 247 (from col 35).

## What this proves for the report
- Frame-by-frame decode recovers the EXACT stored bytes and attributes the corrupted block to a
  specific generation (frame 1 / gen 2), while the later frame (gen 3) carries the clean re-read —
  evidence that the corruption is in the persisted result-text assembly, non-deterministic, upstream of the plugin.
