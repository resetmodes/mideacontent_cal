/* 내 일정 순수 계산 ('26.8.8) — 화면과 분리해 테스트가 직접 부를 수 있게.
   MyTaskPage.jsx는 JSX라 node에서 import할 수 없으므로, 회귀 감시가 필요한
   판정 로직은 전부 여기에 둔다 (test-data.mjs 20번이 이 파일을 부른다) */
import { toISO, fromISO, parseQuick } from './parse.js'

export const SNAP = 30                     // 드롭과 길이 조절의 스냅 단위 (분)
export const SLOT = 46                     // 주간 격자 한 시간 높이 (px)
export const H0 = 8, H1 = 20               // 주간 기본 표시 범위

export const hourOf = t => (t ? +t.slice(0, 2) : null)
export const minOf = t => (t ? +t.slice(3, 5) : 0)
export const mins = t => (t ? hourOf(t) * 60 + minOf(t) : null)
export const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const fmtK = s => (s ? `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '')
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const fmtDur = m => (m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`)

/* 시간 겹침 판정 — 양쪽 모두 시각이 있어야 겹친 것이다.
   ★ 예전에는 한쪽이라도 시각이 없으면 true를 돌려줬는데, 배경 일정(팀·매체·촬영)은
   구조상 항상 시각이 없어서 "그날 매체 일정이 하나라도 있으면 무조건 충돌"이 됐다.
   매체 캘린더는 거의 매일 일정이 있으므로 사실상 모든 개인 일정에 경고가 붙었다 */
export function overlaps(a, b) {
  if (!a.time || !b.time) return false
  const a0 = mins(a.time), a1 = a0 + Math.max(SNAP, a.dur || 60)
  const b0 = mins(b.time), b1 = b0 + Math.max(SNAP, b.dur || 60)
  return a0 < b1 && b0 < a1
}

/* 충돌 목록 — 내 일정이 걸린 것만. 내 일정끼리의 이중 예약도 잡는다
   (예전에는 kind !== 'mine' 조건이 있어 같은 시각에 회의 두 건을 잡아도 조용했다) */
export function findClashes(byDay) {
  const out = []
  for (const [date, list] of Object.entries(byDay)) {
    const timed = list.filter(e => e.time)
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        if (timed[i].kind !== 'mine' && timed[j].kind !== 'mine') continue
        if (overlaps(timed[i], timed[j])) out.push({ date, a: timed[i], b: timed[j] })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/* 하루치 시간 일정의 자리 계산
   ① 분 단위 위치 — 10:30 일정이 10:00과 같은 자리에 그려지던 것을 바로잡는다
   ② 겹침은 "같은 시간대"가 아니라 실제로 시간이 겹치는 무리끼리만 폭을 나눈다
      (예전엔 같은 시(hour) 칸에 있기만 하면 10:00과 10:45가 서로 폭을 반씩 가져갔고,
       반대로 09:00~11:00과 10:00은 칸이 달라 둘 다 전체 폭이라 아래 것이 덮였다) */
export function layoutDay(list) {
  const timed = list.filter(e => e.time)
    .map(e => {
      const s = mins(e.time)
      return { e, s, t: s + Math.max(SNAP, e.dur || 60) }
    })
    .sort((a, b) => a.s - b.s || a.t - b.t)

  const out = []
  let group = [], groupEnd = -1
  const flush = () => {
    if (!group.length) return
    const cols = []            // 열마다 마지막 종료 시각
    for (const it of group) {
      let c = cols.findIndex(end => end <= it.s)
      if (c === -1) { c = cols.length; cols.push(0) }
      cols[c] = it.t
      it.col = c
    }
    for (const it of group) out.push({ ...it, n: cols.length })
    group = []; groupEnd = -1
  }
  for (const it of timed) {
    if (group.length && it.s >= groupEnd) flush()
    group.push(it)
    groupEnd = Math.max(groupEnd, it.t)
  }
  flush()
  return out
}

/* 팀 일정을 내 일정과 같은 모양으로 — 겹쳐보기 배경용.
   기간 일정은 걸치는 날짜마다 한 칸씩 (예전엔 시작일 하루만 떠서, 8/1~8/20 매체 집행이
   8/2에는 안 보였다 — "겹치는지 확인"이라는 이 탭의 목적 자체가 성립하지 않았다).
   보고 있는 기간 밖은 잘라낸다 — 전 기간을 펼치면 칩이 수천 개가 된다 */
export function expandBg(list, from, to) {
  const out = []
  for (const e of list) {
    const kind = e.kind || '매체'
    if (kind === '휴점') continue
    const s = e.date < from ? from : e.date
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date
    const t = end > to ? to : end
    if (s > t) continue
    let d = fromISO(s)
    for (let i = 0; i < 400; i++) {
      const iso = toISO(d)
      if (iso > t) break
      out.push({
        id: `bg-${e.id}-${iso}`, title: e.title, date: iso,
        time: null, dur: 0, kind, bg: true,
        span: end !== e.date ? (iso === e.date ? 'start' : iso === end ? 'end' : 'mid') : null,
      })
      d = addDays(d, 1)
    }
  }
  return out
}

/* 주간 표시 시간 범위 — 기본은 업무 시간이지만 그 밖 시간에 일정이 있으면 넓힌다.
   예전엔 8~20시로 고정이라 07시나 21시 일정이 주간 화면에서 통째로 사라졌다
   (종일 줄 필터에도, 시각 줄 필터에도 안 걸려 어디에도 안 그려졌다) */
export function hoursFor(events) {
  let lo = H0, hi = H1
  for (const e of events) {
    if (!e.time) continue
    const s = hourOf(e.time)
    const endM = mins(e.time) + Math.max(SNAP, e.dur || 60)
    if (s < lo) lo = Math.max(0, s)
    const t = Math.min(23, Math.ceil(endM / 60) - 1)
    if (t > hi) hi = t
  }
  const out = []
  for (let h = lo; h <= hi; h++) out.push(h)
  return out
}

/* 한 줄 입력 해석 — 날짜가 잡히면 할 일이 아니라 일정으로 만든다.
   날짜 해석은 parse.js 파서를 그대로 쓴다 (12/20, 7월 10일, 내일, 다음주 목요일 …).
   매체 키워드는 개인 일정과 무관하므로 끈다 */
export function parseLine(input, today = new Date()) {
  const raw = (input || '').trim()
  if (!raw) return null

  let tag = null
  let text = raw.replace(/#([^\s#]+)/, (_, t) => { tag = t; return ' ' })

  const q = parseQuick(text, today, { keywords: [], normalize: false, labels: false })
  const date = q?.date || null
  text = (q?.title || text).trim()

  /* 소요 시간 — "1시간", "1시간 30분", "90분". 시각보다 먼저 걷어내야
     "1시간"의 1을 시각으로 오인하지 않는다 */
  let dur = null
  const dm = text.match(/(\d{1,2})\s*시간(?:\s*(\d{1,2})\s*분)?|(\d{2,3})\s*분간?(?![가-힣])/)
  if (dm) {
    const v = dm[3] ? +dm[3] : +dm[1] * 60 + (dm[2] ? +dm[2] : 0)
    if (v >= SNAP && v <= 720) {
      dur = v
      text = (text.slice(0, dm.index) + text.slice(dm.index + dm[0].length)).trim()
    }
  }

  /* 시각 — "15:30", "15시", "3시 30분", "오후 3시". 콜론이나 '시'가 있을 때만 잡는다
     (맨숫자를 시각으로 보면 "2안 검토"의 2가 걸린다) */
  let time = null
  const tm = text.match(/(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*(?::(\d{2})|시\s*(?:(\d{1,2})\s*분|(반))?)/)
  if (tm) {
    let h = +tm[2]
    const m = tm[3] ? +tm[3] : tm[4] ? +tm[4] : tm[5] ? 30 : 0
    if (/오후|저녁|밤/.test(tm[1] || '') && h < 12) h += 12
    if (/오전|아침/.test(tm[1] || '') && h === 12) h = 0
    if (h <= 23 && m <= 59) {
      time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      text = (text.slice(0, tm.index) + text.slice(tm.index + tm[0].length)).trim()
    }
  }

  text = text.replace(/\s{2,}/g, ' ').trim()
  return { title: text, date, time, dur, tag }
}
