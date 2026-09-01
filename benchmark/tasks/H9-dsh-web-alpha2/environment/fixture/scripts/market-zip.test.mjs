/**
 * market-zip: verify the zipStore() function used by market-build produces
 * standard-compliant ZIP archives that can be parsed by any spec-conforming
 * extractor. This catches the offset misalignment that previously broke
 * 360 Zip, WinRAR, 7-Zip, and Windows Explorer (#1050).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc32 } from 'node:zlib'
import { Buffer } from 'node:buffer'

// Inline the same zipStore implementation from scripts/market-build so the
// test validates the exact same code path without needing dynamic import of
// a non-module script.
function zipStore(files) {
  const chunks = []
  const central = []
  let offset = 0
  const DOS_TIME = 0x0000
  const DOS_DATE = 0x0021
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data) >>> 0
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(DOS_TIME, 10)
    header.writeUInt16LE(DOS_DATE, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28)
    chunks.push(header, nameBytes, data)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(0x0314, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt16LE(0, 10)
    cen.writeUInt16LE(DOS_TIME, 12)
    cen.writeUInt16LE(DOS_DATE, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(data.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBytes.length, 28)
    cen.writeUInt16LE(0, 30)
    cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34)
    cen.writeUInt16LE(0, 36)
    cen.writeUInt32LE(((0o100644 << 16) | 0x20) >>> 0, 38)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  let cenSize = 0
  for (const c of central) cenSize += c.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cenSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, ...central, eocd])
}

// --- Minimal ZIP parser for structural verification ---

function parseLFH(buf, offset) {
  assert.equal(buf.readUInt32LE(offset), 0x04034b50, 'LFH signature')
  return {
    versionNeeded: buf.readUInt16LE(offset + 4),
    flags: buf.readUInt16LE(offset + 6),
    compression: buf.readUInt16LE(offset + 8),
    modTime: buf.readUInt16LE(offset + 10),
    modDate: buf.readUInt16LE(offset + 12),
    crc32: buf.readUInt32LE(offset + 14),
    compressedSize: buf.readUInt32LE(offset + 18),
    uncompressedSize: buf.readUInt32LE(offset + 22),
    fileNameLength: buf.readUInt16LE(offset + 26),
    extraFieldLength: buf.readUInt16LE(offset + 28),
  }
}

function parseCDE(buf, offset) {
  assert.equal(buf.readUInt32LE(offset), 0x02014b50, 'CDE signature')
  return {
    versionMadeBy: buf.readUInt16LE(offset + 4),
    versionNeeded: buf.readUInt16LE(offset + 6),
    flags: buf.readUInt16LE(offset + 8),
    compression: buf.readUInt16LE(offset + 10),
    modTime: buf.readUInt16LE(offset + 12),
    modDate: buf.readUInt16LE(offset + 14),
    crc32: buf.readUInt32LE(offset + 16),
    compressedSize: buf.readUInt32LE(offset + 20),
    uncompressedSize: buf.readUInt32LE(offset + 24),
    fileNameLength: buf.readUInt16LE(offset + 28),
    extraFieldLength: buf.readUInt16LE(offset + 30),
    commentLength: buf.readUInt16LE(offset + 32),
    diskStart: buf.readUInt16LE(offset + 34),
    internalAttrs: buf.readUInt16LE(offset + 36),
    externalAttrs: buf.readUInt32LE(offset + 38),
    localHeaderOffset: buf.readUInt32LE(offset + 42),
  }
}

function parseEOCD(buf) {
  // Scan backwards for EOCD signature
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return {
        offset: i,
        diskNumber: buf.readUInt16LE(i + 4),
        cdDisk: buf.readUInt16LE(i + 6),
        recordsOnDisk: buf.readUInt16LE(i + 8),
        totalRecords: buf.readUInt16LE(i + 10),
        cdSize: buf.readUInt32LE(i + 12),
        cdOffset: buf.readUInt32LE(i + 16),
        commentLength: buf.readUInt16LE(i + 20),
      }
    }
  }
  throw new Error('EOCD not found')
}

// --- Tests ---

const testFiles = [
  { name: 'hello.txt', data: Buffer.from('Hello, World!') },
  { name: 'subdir/binary.bin', data: Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]) },
  { name: 'empty.dat', data: Buffer.alloc(0) },
]

test('zipStore produces valid ZIP with correct EOCD', () => {
  const zip = zipStore(testFiles)
  const eocd = parseEOCD(zip)
  assert.equal(eocd.totalRecords, 3, 'total file count')
  assert.equal(eocd.recordsOnDisk, 3, 'records on disk')
  assert.equal(eocd.diskNumber, 0)
  assert.equal(eocd.cdDisk, 0)
  assert.ok(eocd.cdOffset > 0, 'CD offset must be positive')
  assert.ok(eocd.cdSize > 0, 'CD size must be positive')
})

test('Local File Headers have correct field offsets and values', () => {
  const zip = zipStore(testFiles)
  let offset = 0
  for (const file of testFiles) {
    const lfh = parseLFH(zip, offset)
    const expectedCrc = crc32(file.data) >>> 0
    assert.equal(lfh.compression, 0, `${file.name}: store method`)
    assert.equal(lfh.crc32, expectedCrc, `${file.name}: CRC-32`)
    assert.equal(lfh.compressedSize, file.data.length, `${file.name}: compressed size`)
    assert.equal(lfh.uncompressedSize, file.data.length, `${file.name}: uncompressed size`)
    assert.equal(lfh.fileNameLength, Buffer.byteLength(file.name), `${file.name}: name length`)
    assert.equal(lfh.extraFieldLength, 0, `${file.name}: no extra field`)
    assert.equal(lfh.flags & 0x0800, 0x0800, `${file.name}: UTF-8 flag`)
    // Verify file name
    const nameStart = offset + 30
    const nameStr = zip.subarray(nameStart, nameStart + lfh.fileNameLength).toString('utf8')
    assert.equal(nameStr, file.name, `${file.name}: name matches`)
    // Verify data content
    const dataStart = nameStart + lfh.fileNameLength
    const dataSlice = zip.subarray(dataStart, dataStart + lfh.compressedSize)
    assert.deepEqual(dataSlice, file.data, `${file.name}: data intact`)
    offset = dataStart + lfh.compressedSize
  }
})

test('Central Directory entries have correct field offsets and values', () => {
  const zip = zipStore(testFiles)
  const eocd = parseEOCD(zip)
  let cdOffset = eocd.cdOffset
  let expectedLfhOffset = 0
  for (const file of testFiles) {
    const cde = parseCDE(zip, cdOffset)
    const expectedCrc = crc32(file.data) >>> 0
    assert.equal(cde.compression, 0, `${file.name}: store method`)
    assert.equal(cde.crc32, expectedCrc, `${file.name}: CRC-32`)
    assert.equal(cde.compressedSize, file.data.length, `${file.name}: compressed size`)
    assert.equal(cde.uncompressedSize, file.data.length, `${file.name}: uncompressed size`)
    assert.equal(cde.fileNameLength, Buffer.byteLength(file.name), `${file.name}: name length`)
    assert.equal(cde.extraFieldLength, 0, `${file.name}: no extra field`)
    assert.equal(cde.commentLength, 0, `${file.name}: no comment`)
    assert.equal(cde.localHeaderOffset, expectedLfhOffset, `${file.name}: LFH offset`)
    assert.equal(cde.versionMadeBy, 0x0314, `${file.name}: UNIX 2.0`)
    // External attrs: POSIX file mode rw-r--r-- (0o100644 << 16) | DOS archive (0x20)
    assert.equal(cde.externalAttrs, ((0o100644 << 16) | 0x20) >>> 0, `${file.name}: POSIX attrs`)
    // Verify file name
    const nameStart = cdOffset + 46
    const nameStr = zip.subarray(nameStart, nameStart + cde.fileNameLength).toString('utf8')
    assert.equal(nameStr, file.name, `${file.name}: name matches`)
    cdOffset = nameStart + cde.fileNameLength
    expectedLfhOffset += 30 + Buffer.byteLength(file.name) + file.data.length
  }
})

test('DOS timestamps are legal (1980-01-01)', () => {
  const zip = zipStore(testFiles)
  const lfh = parseLFH(zip, 0)
  // dosDate 0x0021 = (0 << 9) | (1 << 5) | 1 = 1980-01-01
  assert.equal(lfh.modDate, 0x0021, 'LFH DOS date is 1980-01-01')
  assert.equal(lfh.modTime, 0x0000, 'LFH DOS time is 00:00:00')
  const eocd = parseEOCD(zip)
  const cde = parseCDE(zip, eocd.cdOffset)
  assert.equal(cde.modDate, 0x0021, 'CDE DOS date is 1980-01-01')
  assert.equal(cde.modTime, 0x0000, 'CDE DOS time is 00:00:00')
})

test('roundtrip: extracted data matches original input', () => {
  const zip = zipStore(testFiles)
  const eocd = parseEOCD(zip)
  let cdOffset = eocd.cdOffset
  const extracted = []
  for (let i = 0; i < eocd.totalRecords; i++) {
    const cde = parseCDE(zip, cdOffset)
    const nameStart = cdOffset + 46
    const name = zip.subarray(nameStart, nameStart + cde.fileNameLength).toString('utf8')
    // Read data from LFH
    const lfh = parseLFH(zip, cde.localHeaderOffset)
    const dataStart = cde.localHeaderOffset + 30 + lfh.fileNameLength + lfh.extraFieldLength
    const data = zip.subarray(dataStart, dataStart + lfh.uncompressedSize)
    extracted.push({ name, data: Buffer.from(data) })
    cdOffset = nameStart + cde.fileNameLength + cde.extraFieldLength + cde.commentLength
  }
  assert.equal(extracted.length, testFiles.length, 'same number of files')
  for (let i = 0; i < testFiles.length; i++) {
    assert.equal(extracted[i].name, testFiles[i].name, `file ${i} name`)
    assert.deepEqual(extracted[i].data, testFiles[i].data, `file ${i} data`)
  }
})

test('single empty file ZIP is valid', () => {
  const zip = zipStore([{ name: 'a.txt', data: Buffer.alloc(0) }])
  const eocd = parseEOCD(zip)
  assert.equal(eocd.totalRecords, 1)
  const cde = parseCDE(zip, eocd.cdOffset)
  assert.equal(cde.compressedSize, 0)
  assert.equal(cde.uncompressedSize, 0)
})

test('large file roundtrip (64 KB)', () => {
  const bigData = Buffer.alloc(65536)
  for (let i = 0; i < bigData.length; i++) bigData[i] = i & 0xff
  const zip = zipStore([{ name: 'big.bin', data: bigData }])
  const eocd = parseEOCD(zip)
  const cde = parseCDE(zip, eocd.cdOffset)
  assert.equal(cde.compressedSize, 65536)
  assert.equal(cde.uncompressedSize, 65536)
  assert.equal(cde.crc32, crc32(bigData) >>> 0)
})
