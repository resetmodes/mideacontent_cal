/* 무압축(store) ZIP 생성기 ('26.7 정산 증빙 일괄 다운로드용) — 의존성 0.
   증빙 파일은 이미 JPEG 압축이라 재압축 이득이 없어 store 방식으로 충분.
   한글 파일명은 UTF-8 플래그(bit 11)로 표기 — 윈도우 탐색기·맥 기본 압축 앱 모두 정상.
   검증: scripts/test-data.mjs 8b (생성 ZIP을 unzip이 읽는지) */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

const enc = new TextEncoder()
const u16 = n => new Uint8Array([n & 0xFF, (n >> 8) & 0xFF])
const u32 = n => new Uint8Array([n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF])

/* DOS 날짜/시간 (ZIP 헤더 형식) */
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/* entries: [{ path: '2026-07/0715_제목/영수증.jpg', data: Uint8Array }] → ZIP Blob */
export function buildZip(entries) {
  const parts = []
  const central = []
  let offset = 0
  const { time, date } = dosDateTime()

  for (const e of entries) {
    const nameBytes = enc.encode(e.path)
    const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data)
    const crc = crc32(data)
    /* 로컬 파일 헤더: PK\x03\x04 · v2.0 · UTF-8 플래그 · store(0) */
    const local = [
      u32(0x04034B50), u16(20), u16(0x0800), u16(0),
      u16(time), u16(date), u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0),
    ]
    parts.push(...local, nameBytes, data)
    central.push({ nameBytes, crc, size: data.length, offset, time, date })
    offset += local.reduce((a, b) => a + b.length, 0) + nameBytes.length + data.length
  }

  const cdStart = offset
  for (const c of central) {
    parts.push(
      u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(c.time), u16(c.date), u32(c.crc), u32(c.size), u32(c.size),
      u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset),
      c.nameBytes,
    )
    offset += 46 + c.nameBytes.length
  }
  /* End of central directory */
  parts.push(
    u32(0x06054B50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(offset - cdStart), u32(cdStart), u16(0),
  )
  return new Blob(parts, { type: 'application/zip' })
}
