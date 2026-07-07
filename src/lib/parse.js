import { KEYWORDS, TITLE_ALIASES, TITLE_STRIP } from '../data/channels.js'

/* 제목 표기 통일 — 긴 표현부터 치환하고, 치환된 결과는 뒤의 규칙이 다시 건드리지 못하게 보호.
   (예: '아파트 LCD'→'APT LCD' 후 'LCD'→'APT LCD' 규칙이 그 안의 LCD를 또 바꾸는 사고 방지) */
const ALIASES_SORTED = [...TITLE_ALIASES].sort((a, b) => b[0].length - a[0].length)
function normalizeTitle(title) {
  let parts = [title]   // 문자열 = 아직 치환 가능, {t} = 확정(보호)된 조각
  for (const [from, to] of ALIASES_SORTED) {
    const next = []
    for (const seg of parts) {
      if (typeof seg !== 'string') { next.push(seg); continue }
      const pieces = seg.split(from)
      pieces.forEach((p, i) => {
        next.push(p)
        if (i < pieces.length - 1) next.push({ t: to })
      })
    }
    parts = next
  }
  return parts.map(p => (typeof p === 'string' ? p : p.t)).join('')
    .replace(/\s+/g, ' ').trim()
}

/* 채널 인식 후 칩과 중복되는 범용 채널 지칭을 제목에서 제거 ('26.7)
   — "인스타 여름테마" + 인스타 칩 → 제목은 "여름테마"만.
   독립 토큰(공백 경계)만 제거, 전부 지워지면 원제목 유지 (빈 제목 방지) */
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function stripChannelTokens(title, chList) {
  let out = title
  for (const { channel } of chList) {
    for (const tok of TITLE_STRIP[channel] || []) {
      out = out.replace(new RegExp(`(^|\\s)${escRe(tok)}(?=\\s|$)`, 'g'), '$1')
    }
  }
  out = out.replace(/\s+/g, ' ').trim()
  return out || title
}

/* 표시용 제목 ('26.7) — 렌더링 시점에 그 일정의 채널과 중복되는 지칭 제거.
   기존 등록분(제목에 채널명이 저장된 데이터)도 화면에서는 정리돼 보임 — 원본은 불변.
   수정 폼에서는 이 함수를 쓰지 말 것 (실제 저장값을 보여줘야 함) */
export const displayTitle = (title, channel) =>
  stripChannelTokens(title || '', channel ? [{ channel }] : [])

const pad = n => String(n).padStart(2, '0')
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = s => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/* 연도 추정: 입력엔 월/일만 있음. 6개월 이상 지난 날짜면 내년으로 해석 */
function resolveDate(mm, dd, today) {
  const y = today.getFullYear()
  const d = new Date(y, mm - 1, dd)
  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  floor.setDate(floor.getDate() - 180)
  if (d < floor) return new Date(y + 1, mm - 1, dd)
  return d
}

/* 다중 매체: "인스타+유튜브+카톡"처럼 +로 이은 그룹 → 매체 배열 ('26.7)
   모든 조각이 매체로 인식될 때만 다중 처리 (1+1 행사 같은 표현은 그대로 제목 유지).
   담당자가 매체별로 달라도 등록은 한 줄 — 등록 건은 매체 수만큼 생성됨 */
function extractChannels(text) {
  for (const g of text.matchAll(/\S+(?:\s*\+\s*\S+)+/g)) {
    const parts = g[0].split('+').map(s => s.trim()).filter(Boolean)
    if (parts.length < 2) continue
    const resolved = parts.map(part => {
      for (const [kw, ch, s] of KEYWORDS)
        if (part.toLowerCase().includes(kw.toLowerCase())) return { channel: ch, sub: s }
      return null
    })
    if (!resolved.every(Boolean)) continue
    const uniq = []
    for (const r of resolved)
      if (!uniq.some(u => u.channel === r.channel && u.sub === r.sub)) uniq.push(r)
    if (uniq.length < 2) continue
    return { channels: uniq, text: text.slice(0, g.index) + text.slice(g.index + g[0].length) }
  }
  return null
}

/* 촬영/업로드 병기 추출 ('26.7) — "7/10 촬영 7/15 업로드", "촬영 7월 10일 업로드 7/15"
   라벨이 날짜 바로 앞이나 뒤에 붙은 경우만 인식 (라벨: 촬영 / 업로드·발행·게시 = 업로드).
   결과: { shootDate, uploadDate, text(라벨·날짜 제거본) } — 라벨 없으면 null */
function extractLabeledDates(text, today) {
  const D = '(?:(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일?|(\\d{1,2})[/.](\\d{1,2}))'
  const L = '(촬영|업로드|발행|게시)'
  const re = new RegExp(`${L}\\s*${D}|${D}\\s*${L}`, 'g')
  let shootDate = null, uploadDate = null, found = false
  const out = text.replace(re, (m, l1, a1, a2, a3, a4, b1, b2, b3, b4, l2) => {
    const label = l1 || l2
    const mm = +(a1 ?? a3 ?? b1 ?? b3), dd = +(a2 ?? a4 ?? b2 ?? b4)
    if (!mm || !dd) return m
    const iso = toISO(resolveDate(mm, dd, today))
    if (label === '촬영') {
      if (shootDate) return m
      shootDate = iso; found = true; return ''
    }
    if (uploadDate) return m
    uploadDate = iso; found = true; return ''
  })
  return found ? { shootDate, uploadDate, text: out } : null
}

/* 빠른 입력 한 줄 → 일정 필드
   예: "12/20 크리스마스 인스타 릴스 현장 스케치 #크리스마스"
   → { date:"2026-12-20", endDate:null, title:"크리스마스 인스타 릴스 현장 스케치",
       channel:"인스타", sub:"공식", campaign:"크리스마스" }
   날짜 지원: 12/20 · 12.20 · 7월 10일 · 범위(12/20~25, 7월 10일~15일, 7월 10일~8월 2일)
             · 오늘/내일/모레
   그 외: 캠페인 #태그 · 매체 키워드 자동 인식 · 다중 매체(인스타+유튜브 → channels 배열)
        · 촬영/업로드 병기("7/10 촬영 7/15 업로드" → shootDate + date) */
export function parseQuick(input, today = new Date()) {
  const raw = input.trim()
  if (!raw) return null

  let campaign = null
  let text = raw.replace(/#([^\s#]+)/g, (_, c) => { campaign = c; return '' })

  let date = null, endDate = null, shootDate = null
  const cut = m => { text = text.slice(0, m.index) + text.slice(m.index + m[0].length) }
  const rangeEnd = (start, endMM, endDD) => {
    let end = new Date(start.getFullYear(), endMM - 1, endDD)
    if (end < start) end = new Date(start.getFullYear() + 1, endMM - 1, endDD)
    return toISO(end)
  }

  /* 0) 촬영/업로드 라벨 날짜 — 라벨 붙은 날짜가 있으면 우선 소비 */
  const labeled = extractLabeledDates(text, today)
  if (labeled) {
    shootDate = labeled.shootDate
    if (labeled.uploadDate) date = labeled.uploadDate
    text = labeled.text
  }

  if (!date && !shootDate) {
    /* 1) 한국어: "7월 10일", "7월 10일~15일", "7월 10일 ~ 8월 2일" */
    const km = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?(?:\s*[~-]\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일?)?/)
    /* 2) 숫자: "12/20", "12.20", 범위 "12/20~12/25", "12/20~25" */
    const nm = text.match(/(\d{1,2})[/.](\d{1,2})(?:\s*[~-]\s*(?:(\d{1,2})[/.])?(\d{1,2}))?/)
    /* 3) 상대: 오늘/내일/모레 */
    const rm = text.match(/오늘|내일|모레/)

    const m = km || nm
    if (m) {
      const start = resolveDate(+m[1], +m[2], today)
      date = toISO(start)
      if (m[4]) endDate = rangeEnd(start, m[3] ? +m[3] : +m[1], +m[4])
      cut(m)
    } else if (rm) {
      const offset = { 오늘: 0, 내일: 1, 모레: 2 }[rm[0]]
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
      date = toISO(d)
      cut(rm)
    }
  }

  /* 다중 매체 그룹(인스타+유튜브 …) — 그룹은 제목에서 제거, channels 배열로 반환 */
  let channels = null
  const multi = extractChannels(text)
  if (multi) { channels = multi.channels; text = multi.text }

  let channel = null, sub = null
  if (channels) {
    channel = channels[0].channel; sub = channels[0].sub
  } else {
    for (const [kw, ch, s] of KEYWORDS) {
      if (raw.toLowerCase().includes(kw.toLowerCase())) { channel = ch; sub = s; break }
    }
  }

  const chList = channels || (channel ? [{ channel }] : [])
  const title = stripChannelTokens(normalizeTitle(text), chList)

  return { title, date, endDate, shootDate, channel, sub, campaign, channels }
}
