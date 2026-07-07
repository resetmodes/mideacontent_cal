import { KEYWORDS, TITLE_ALIASES } from '../data/channels.js'

/* 제목 표기 통일 — 긴 표현부터 치환해 부분 매칭 오류 방지 */
const ALIASES_SORTED = [...TITLE_ALIASES].sort((a, b) => b[0].length - a[0].length)
function normalizeTitle(title) {
  let t = title
  for (const [from, to] of ALIASES_SORTED) t = t.split(from).join(to)
  return t.replace(/\s+/g, ' ').trim()
}

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

/* 빠른 입력 한 줄 → 일정 필드
   예: "12/20 크리스마스 인스타 릴스 현장 스케치 #크리스마스"
   → { date:"2026-12-20", endDate:null, title:"크리스마스 인스타 릴스 현장 스케치",
       channel:"인스타", sub:"공식", campaign:"크리스마스" }
   날짜 지원: 12/20 · 12.20 · 7월 10일 · 범위(12/20~25, 7월 10일~15일, 7월 10일~8월 2일)
             · 오늘/내일/모레
   그 외: 캠페인 #태그 · 매체 키워드 자동 인식 */
export function parseQuick(input, today = new Date()) {
  const raw = input.trim()
  if (!raw) return null

  let campaign = null
  let text = raw.replace(/#([^\s#]+)/g, (_, c) => { campaign = c; return '' })

  let date = null, endDate = null
  const cut = m => { text = text.slice(0, m.index) + text.slice(m.index + m[0].length) }
  const rangeEnd = (start, endMM, endDD) => {
    let end = new Date(start.getFullYear(), endMM - 1, endDD)
    if (end < start) end = new Date(start.getFullYear() + 1, endMM - 1, endDD)
    return toISO(end)
  }

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

  let channel = null, sub = null
  for (const [kw, ch, s] of KEYWORDS) {
    if (raw.toLowerCase().includes(kw.toLowerCase())) { channel = ch; sub = s; break }
  }

  return { title: normalizeTitle(text), date, endDate, channel, sub, campaign }
}
