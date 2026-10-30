#!/usr/bin/env node
// frame-by-frame decoder for a CONCATENATED-Zstandard session-log generation file.
// WHY: a whole-file zlib.zstdDecompressSync() returns ONLY THE FIRST frame and
// silently drops later generations (measured on a 3-generation file: 129 chars
// returned, generations 2 and 3 lost, no error). Forensics must walk frames.
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]) // 0xFD2FB528, little-endian

function frameHeader (buf, off) {
  const fhd = buf[off + 4]
  const fcsFlag = fhd >> 6
  const singleSegment = (fhd >> 5) & 1
  const checksum = (fhd >> 2) & 1
  const didFlag = fhd & 3
  let p = off + 5
  if (!singleSegment) p += 1                       // Window_Descriptor
  p += [0, 1, 2, 4][didFlag]                       // Dictionary_ID
  p += fcsFlag === 0 ? (singleSegment ? 1 : 0) : fcsFlag === 1 ? 2 : fcsFlag === 2 ? 4 : 8
  return { dataStart: p, endSize: checksum ? 4 : 0 }
}

function frameLength (buf, off) {
  const { dataStart, endSize } = frameHeader(buf, off)
  let p = dataStart
  for (;;) {
    if (p + 3 > buf.length) throw new Error('truncated block header at ' + p)
    const hdr = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)
    const last = hdr & 1
    const type = (hdr >> 1) & 3
    const size = hdr >> 3
    p += 3
    if (type === 0) p += size                       // Raw
    else if (type === 1) p += 1                    // RLE
    else if (type === 2) p += size                  // Compressed
    else throw new Error('reserved block type')
    if (last) break
  }
  return p + endSize - off
}

export function decodeFrames (buf) {
  const frames = []
  let off = 0
  while (off < buf.length) {
    if (!buf.subarray(off, off + 4).equals(MAGIC)) throw new Error('no frame magic at offset ' + off)
    const len = frameLength(buf, off)
    const slice = buf.subarray(off, off + len)
    frames.push({
      offset: off,
      compressedBytes: len,
      text: zstdDecompressSync(slice).toString('utf8')
    })
    off += len
  }
  return frames
}

if (process.argv[1] && process.argv[1].endsWith('zstd-frames.mjs')) {
  const file = process.argv[2]
  const frames = decodeFrames(readFileSync(file))
  console.log('frames:', frames.length)
  frames.forEach((f, i) => {
    console.log('\n--- frame ' + (i + 1) + ' @ offset ' + f.offset + ' (' + f.compressedBytes + ' compressed bytes) ---')
    console.log(f.text.trim())
  })
}
