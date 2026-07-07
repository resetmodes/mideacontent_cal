import { KEYWORDS } from '../data/channels.js'

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
   지원: 날짜 범위 12/20~12/25, 12/20~25 · 캠페인 #태그 · 매체 키워드 자동 인식 */
export function parseQuick(input, today = new Date()) {
  const raw = input.trim()
  if (!raw) return null

  let campaign = null
  let text = raw.replace(/#([^\s#]+)/g, (_, c) => { campaign = c; return '' })

  let date = null, endDate = null
  const m = text.match(/(\d{1,2})[/.](\d{1,2})(?:\s*[~-]\s*(?:(\d{1,2})[/.])?(\d{1,2}))?/)
  if (m) {
    const start = resolveDate(+m[1], +m[2], today)
    date = toISO(start)
    if (m[4]) {
      const endMM = m[3] ? +m[3] : +m[1]
      let end = new Date(start.getFullYear(), endMM - 1, +m[4])
      if (end < start) end = new Date(start.getFullYear() + 1, endMM - 1, +m[4])
      endDate = toISO(end)
    }
    text = text.slice(0, m.index) + text.slice(m.index + m[0].length)
  }

  let channel = null, sub = null
  for (const [kw, ch, s] of KEYWORDS) {
    if (raw.toLowerCase().includes(kw.toLowerCase())) { channel = ch; sub = s; break }
  }

  return { title: text.replace(/\s+/g, ' ').trim(), date, endDate, channel, sub, campaign }
}
