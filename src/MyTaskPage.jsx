/* 내 일정 ('26.8) — 개인 투두와 개인 캘린더를 한 화면에서.
   시안 승인 후 실구축 ('26.8.7, config.js MYTASK_EMAILS 게이트로 1차는 노규빈만).
   전면 개선 '26.8.8 (ARCH Calendar 벤치마크 + 현행 감사 반영).

   설계 요지
   - 개인 데이터는 my_* 테이블에만 저장한다 (media_events는 미러가 열리면 무로그인 공개라
     개인 메모를 넣으면 샌다). data/mytask-setup.sql 주석 참조
   - 팀 캘린더 연동은 체크박스 — 켜면 media_events에 kind='팀'으로 한 건 더 만들고
     그 id를 linkedId에 물려둔다. 끄면 그 행만 지운다 (라운지 linked_events와 같은 패턴)
   - 팀·매체·촬영 일정은 읽기 전용 배경으로만 얹는다 (겹쳐보기 칩)

   일정을 만드는 길이 셋이다 ('26.8.8 — 예전엔 드래그 하나뿐이라 폰에서는 아예 막혔다)
   1. 빈 칸을 눌러 그 날짜와 시각으로 바로 만들기
   2. 한 줄에 날짜를 써서 만들기 ("내일 15시 임원 보고 1시간") — parse.js 파서 재사용
   3. 할 일을 캘린더로 끌어다 놓기 (데스크톱은 바로, 폰은 길게 누른 뒤)

   드래그 주의 ('26.8.7 시안에서 실측한 함정 3개)
   1. 드래그 끝에 브라우저가 click을 한 번 더 쏜다 → 억제하지 않으면 상세가 저절로 열린다
   2. 드래그가 텍스트 선택을 남기면 다음 드래그를 브라우저가 네이티브 드래그로 오인해
      pointercancel로 끊는다 → 칩에 user-select 해제 + pointerdown에서 preventDefault
   3. 같은 시간대 일정은 폭을 나눠야 한다 (겹쳐 쌓으면 아래 것이 클릭조차 안 됨)

   주간 격자 구조 주의 ('26.8.8 재작업)
   칩은 "시각 칸" 안이 아니라 **요일 열 전체** 위에 절대 배치한다. 예전처럼 시각 칸 안에
   두면 1시간을 넘는 칩이 아래 칸을 침범하는데, 아래 칸이 DOM 순서상 뒤라 위에 덮여
   길이 조절 그립을 잡을 수 없었다. 시각 칸은 이제 칩 뒤에 깔린 드롭 타깃 전용이다 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { HOLIDAYS, CLOSED_DAYS } from './data/holidays.js'
import { TEAM } from './data/team.js'
import { toISO, fromISO } from './lib/parse.js'
import {
  SNAP, SLOT, mins, hhmm, fmtK, addDays, fmtDur, tint, timeLabel,
  findClashes, layoutDay, expandBg, hoursFor, parseLine,
} from './lib/myTask.js'
import { listEvents, createEvent, deleteEvent } from './lib/store.js'
import { toast } from './lib/toast.js'
import ModalShell from './ModalShell.jsx'
import ImageAttach from './ImageAttach.jsx'
import { MY_IMAGE_API } from './lib/myTaskImages.js'
import {
  listSpaces, createSpace, deleteSpace,
  listTodos, createTodo, updateTodo, deleteTodo,
  listMyEvents, createMyEvent, updateMyEvent, deleteMyEvent,
  myEmail,
} from './lib/myTaskStore.js'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_MAX = 4                        // 월간 셀당 표시 상한
const DUR_STEPS = [30, 60, 90, 120, 180, 240, 360, 480]
const K = {                                // 브라우저에 기억하는 것들
  sort: 'mtTodoSort', fold: 'mtTodoFold', view: 'mtView', rail: 'mtRail', mview: 'mtMView',
  layers: 'mtLayers', wide: 'mtWide', done: 'mtHideDone', dur: 'mtLastDur',
}
const PALETTE = ['#0B4336', '#CFA3BD', '#7FA795', '#D9C6A5', '#9BA8C4', '#96637F']
/* 겹쳐보기 레이어 — 매체 캘린더는 뺐다 ('26.8.8 사용자 지시).
   매체 일정은 거의 매일 있어서 개인 캘린더를 덮어버리고, 내 시간과 겹치는지
   판단하는 데도 쓰이지 않는다 (시각이 없는 기간 일정이라) */
const LAYERS = [
  { id: 'mine', name: '내 일정', color: '#0B4336' },
  { id: '팀', name: '팀 일정', color: '#A9B5AD' },
  { id: '촬영', name: '촬영', color: '#E8730C' },
]
const BG_KINDS = new Set(['팀', '촬영'])

const LAYER_COLOR = Object.fromEntries(LAYERS.map(l => [l.id, l.color]))

/* 좁은 화면인지 — 폰에서는 월간 셀에 글자 대신 색점을 찍는다 (7열 × 47px에는
   제목이 두세 글자밖에 안 들어가 읽을 수 없다). 표준 모바일 월간 화면과 같은 방식 */
function useCompact() {
  const q = '(max-width: 700px)'
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = e => setV(e.matches)
    m.addEventListener('change', on)
    setV(m.matches)
    return () => m.removeEventListener('change', on)
  }, [])
  return v
}
const norm = s => (s || '').toLowerCase().replace(/\s+/g, '')

const read = (key, fb) => { try { const v = localStorage.getItem(key); return v === null ? fb : JSON.parse(v) } catch { return fb } }
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* 사파리 시크릿 모드 */ } }

export default function MyTaskPage() {
  const [spaces, setSpaces] = useState(null)
  const [todos, setTodos] = useState(null)
  const [mine, setMine] = useState(null)
  const [teamEvents, setTeamEvents] = useState([])
  const [closedDays, setClosedDays] = useState({})
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState(null)

  const [view, setView] = useState(() => (read(K.view, 'month') === 'week' ? 'week' : 'month'))
  const [cursor, setCursor] = useState(new Date())
  const [spFilter, setSpFilter] = useState(null)
  const [layers, setLayers] = useState(() => new Set(read(K.layers, ['mine', '팀', '촬영'])))
  const [openId, setOpenId] = useState(null)
  const [openTodoId, setOpenTodoId] = useState(null)
  const [draft, setDraft] = useState('')
  const [addSpaceId, setAddSpaceId] = useState(undefined)   // undefined면 필터를 따라간다
  const [query, setQuery] = useState('')
  const [hideDone, setHideDone] = useState(() => read(K.done, false))
  const [wide, setWide] = useState(() => read(K.wide, false))
  const [railOpen, setRailOpen] = useState(() => read(K.rail, false))
  /* 폰에서는 할 일 패널과 캘린더가 세로로 쌓여 캘린더가 화면 한참 아래로 밀린다.
     세그로 나눠 한 번에 하나만 보여준다 ('26.8.8, 모바일 캘린더 앱의 표준) */
  const [mView, setMView] = useState(() => read(K.mview, 'todos') === 'cal' ? 'cal' : 'todos')
  const [help, setHelp] = useState(false)
  const [newAt, setNewAt] = useState(null)                  // 빈 칸 클릭으로 여는 신규 시트
  const [undo, setUndo] = useState(null)

  const addRef = useRef(null)
  const searchRef = useRef(null)
  const undoTimer = useRef(null)
  /* 드래그 콜백이 매 렌더 새로 만들어지면 document 리스너를 계속 떼었다 붙인다 —
     최신 상태는 ref로 읽고 콜백 자체는 고정한다 */
  const todosRef = useRef(null); todosRef.current = todos
  const mineRef = useRef(null); mineRef.current = mine
  const viewRef = useRef(view); viewRef.current = view

  const today = toISO(new Date())
  const me = myEmail()

  const pickView = useCallback(v => { write(K.view, v); setView(v) }, [])
  const toggleHideDone = () => setHideDone(v => { write(K.done, !v); return !v })
  const toggleWide = () => setWide(v => { write(K.wide, !v); return !v })
  const toggleRail = () => setRailOpen(v => { write(K.rail, !v); return !v })
  const pickMView = v => { write(K.mview, v); setMView(v) }

  const load = useCallback(async () => {
    setErr(null)
    const [sp, td, ev] = await Promise.all([listSpaces(), listTodos(), listMyEvents()])
    setSpaces(sp); setTodos(td); setMine(ev)
    setErr(sp === null || td === null || ev === null)
    setReady(true)
    /* 겹쳐보기 배경 — 팀 캘린더는 읽기 전용으로만 얹는다.
       휴점은 다른 탭과 같게 셀 틴트로 쓴다 (예전엔 걸러내기만 해서 8/10 같은 날이
       이 탭에서만 평일로 보였다) */
    listEvents().then(all => {
      if (!Array.isArray(all)) return
      setTeamEvents(all)
      const cd = {}
      for (const e of all) if (e.kind === '휴점') cd[e.date] = '휴점'
      setClosedDays(cd)
    }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const cells = useMemo(() => {
    const out = []
    if (view === 'week') {
      const s = addDays(cursor, -cursor.getDay())
      for (let i = 0; i < 7; i++) {
        const d = addDays(s, i)
        out.push({ iso: toISO(d), day: d.getDate(), dow: i })
      }
      return out
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const d = new Date(first); d.setDate(1 - first.getDay())
    while (d <= last || d.getDay() !== 0) {
      out.push({ iso: toISO(d), day: d.getDate(), dow: d.getDay(), inM: d.getMonth() === cursor.getMonth() })
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [cursor, view])

  const range = useMemo(() => ({ from: cells[0]?.iso || today, to: cells[cells.length - 1]?.iso || today }), [cells, today])

  /* 배경 일정 — 보고 있는 기간만 펼친다. 전 기간을 매번 펼치면 수천 칩이 만들어진다 */
  const bgEvents = useMemo(
    () => expandBg(teamEvents.filter(e => BG_KINDS.has(e.kind)), range.from, range.to),
    [teamEvents, range.from, range.to])

  const shownEvents = useMemo(() => {
    const out = []
    if (layers.has('mine')) {
      for (const e of mine || []) {
        if (e.date >= range.from && e.date <= range.to) out.push({ ...e, kind: 'mine' })
      }
    }
    for (const e of bgEvents) if (layers.has(e.kind)) out.push(e)
    return out
  }, [mine, bgEvents, layers, range.from, range.to])

  const byDay = useMemo(() => {
    const m = {}
    for (const e of shownEvents) (m[e.date] = m[e.date] || []).push(e)
    /* 내 일정이 먼저, 그 안에서는 시각순 — 배경이 위로 올라오면 내 일정이 묻힌다 */
    for (const list of Object.values(m)) {
      list.sort((a, b) => (a.kind === 'mine' ? 0 : 1) - (b.kind === 'mine' ? 0 : 1)
        || (mins(a.time) ?? 1e9) - (mins(b.time) ?? 1e9))
    }
    return m
  }, [shownEvents])

  /* 충돌 — 판정은 lib/myTask.js 단일 소스 (test-data 20이 회귀 감시) */
  const clashes = useMemo(() => findClashes(byDay), [byDay])
  const clashIds = useMemo(() => {
    const s = new Set()
    for (const c of clashes) { s.add(c.a.id); s.add(c.b.id) }
    return s
  }, [clashes])

  /* 주간 시간 범위 — 보고 있는 주에 업무 시간 밖 일정이 있으면 넓힌다 */
  const hours = useMemo(() => hoursFor(shownEvents), [shownEvents])

  /* ── 액션 ── */
  const guard = useCallback(async (fn, msg) => {
    try { await fn(); if (msg) toast(msg) }
    catch (e) { toast(e.message, { danger: true }) }
  }, [])

  /* 되돌리기 — 이동, 날짜 해제, 삭제 직후 8초 (매체 캘린더 실행취소 바와 같은 결) */
  const offerUndo = useCallback((label, run) => {
    clearTimeout(undoTimer.current)
    setUndo({ label, run })
    undoTimer.current = setTimeout(() => setUndo(null), 8000)
  }, [])
  useEffect(() => () => clearTimeout(undoTimer.current), [])
  const runUndo = useCallback(() => {
    const u = undo
    setUndo(null)
    if (u) guard(u.run, '되돌렸습니다')
  }, [undo, guard])

  /* 낙관적 갱신 — 체크나 이동은 화면을 먼저 바꾸고 서버를 뒤따르게 한다.
     서버 왕복을 기다리면 체크 한 번에도 눈에 보이는 지연이 생긴다.
     실패하면 직전 상태로 되돌리고 알린다 */
  const optimistic = useCallback(async (setter, id, local, save) => {
    let before = null
    setter(v => (v || []).map(x => {
      if (x.id !== id) return x
      before = x
      return { ...x, ...local }
    }))
    try {
      const n = await save()
      setter(v => (v || []).map(x => (x.id === id ? n : x)))
      return n
    } catch (e) {
      if (before) setter(v => (v || []).map(x => (x.id === id ? before : x)))
      toast(e.message, { danger: true })
      throw e
    }
  }, [])

  /* 스페이스 확보 — "#기획"처럼 쓴 이름이 없으면 즉석에서 만든다 */
  const ensureSpace = useCallback(async name => {
    const cur = spaces || []
    const found = cur.find(s => s.name === name)
    if (found) return found.id
    const sp = await createSpace(name, PALETTE[cur.length % PALETTE.length], cur.length)
    setSpaces(v => [...(v || []), sp])
    return sp.id
  }, [spaces])

  /* 한 줄 입력 — 날짜가 있으면 일정, 없으면 할 일.
     스페이스는 세 갈래로 정해진다
     ① 본문의 "#이름" ② 입력줄 아래 "담을 곳" 칩 ③ 켜져 있는 스페이스 필터 */
  const addLine = useCallback(() => guard(async () => {
    const p = parseLine(draft)
    if (!p) return
    let spaceId = addSpaceId !== undefined ? addSpaceId : spFilter
    if (p.tag) spaceId = await ensureSpace(p.tag)
    if (!p.title) {
      /* "#기획"만 치면 스페이스만 만들고 끝 — 예전엔 입력창이 안 비워져 무반응으로 보였다 */
      setDraft('')
      toast(p.tag ? '스페이스만 만들었습니다' : '내용을 입력해 주세요', { danger: !p.tag })
      return
    }
    if (p.date) {
      const dur = p.dur || read(K.dur, 60)
      const ev = await createMyEvent({ title: p.title, date: p.date, time: p.time, dur, spaceId })
      setMine(v => [...(v || []), ev])
      setDraft('')
      toast(`${fmtK(p.date)}${p.time ? ` ${p.time}` : ''} 일정으로 등록됨`)
      return
    }
    const t = await createTodo({ txt: p.title, spaceId })
    setTodos(v => [t, ...(v || [])])
    setDraft('')
  }), [draft, addSpaceId, spFilter, ensureSpace, guard])

  const toggleTodo = useCallback(t => optimistic(setTodos, t.id, { done: !t.done },
    () => updateTodo(t.id, { done: !t.done })).catch(() => {}), [optimistic])

  const patchTodo = useCallback((id, patch, msg) => optimistic(setTodos, id, patch,
    async () => { const n = await updateTodo(id, patch); if (msg) toast(msg); return n }).catch(() => {}), [optimistic])

  const removeTodo = useCallback(id => guard(async () => {
    const t = (todosRef.current || []).find(x => x.id === id)
    await deleteTodo(id)
    setTodos(v => v.filter(x => x.id !== id))
    if (t) offerUndo('할 일 삭제됨', async () => {
      const n = await createTodo({ txt: t.txt, spaceId: t.spaceId, shared: t.shared, memo: t.memo, images: t.images })
      setTodos(v => [n, ...(v || [])])
    })
  }), [guard, offerUndo])

  /* 스페이스 추가는 인라인 입력 — 네이티브 prompt는 환경별 차단 이력이 있어 쓰지 않는다 */
  const addSpace = useCallback(name => guard(async () => {
    const t = (name || '').trim()
    if (!t) return
    await ensureSpace(t)
  }), [guard, ensureSpace])

  const removeSpace = useCallback(id => guard(async () => {
    await deleteSpace(id)
    setSpaces(v => v.filter(s => s.id !== id))
    if (spFilter === id) setSpFilter(null)
    /* 담을 곳으로 이 스페이스를 골라 뒀다면 같이 푼다 — 안 그러면 다음 추가가
       사라진 스페이스를 참조해 409로 막힌다 */
    setAddSpaceId(v => (v === id ? undefined : v))
    setTodos(v => (v || []).map(t => (t.spaceId === id ? { ...t, spaceId: null } : t)))
    setMine(v => (v || []).map(e => (e.spaceId === id ? { ...e, spaceId: null } : e)))
  }, '스페이스 삭제됨'), [guard, spFilter])

  /* 투두를 캘린더에 놓기 — 투두는 일정이 되고 목록에서 사라진다.
     생성 뒤 삭제가 실패하면 만든 일정을 도로 지운다 (둘 다 남으면 새로고침 때 이중으로 보인다) */
  const dropTodo = useCallback((todoId, date, time) => guard(async () => {
    const t = (todosRef.current || []).find(x => x.id === todoId)
    if (!t) return
    const ev = await createMyEvent({
      title: t.txt, date, time: time || null,
      dur: read(K.dur, 60), spaceId: t.spaceId, shared: t.shared, done: t.done,
      memo: t.memo, images: t.images,        // 메모와 첨부는 그대로 따라간다
    })
    try {
      await deleteTodo(t.id)
    } catch (e) {
      await deleteMyEvent(ev.id).catch(() => {})
      throw e
    }
    setMine(v => [...(v || []), ev])
    setTodos(v => v.filter(x => x.id !== todoId))
  }), [guard])

  const syncLinked = useCallback(async (ev, linkedId) => {
    const { updateEvent } = await import('./lib/store.js')
    await updateEvent(linkedId, { title: ev.title, date: ev.date, endDate: null, channel: '업무', kind: '팀' }).catch(() => {})
  }, [])

  const moveEvent = useCallback((id, date, time) => {
    const e = (mineRef.current || []).find(x => x.id === id)
    if (!e) return
    const patch = { date }
    if (time !== undefined) patch.time = time
    else if (viewRef.current === 'week') patch.time = null
    if (e.date === patch.date && e.time === (patch.time ?? e.time)) return
    const back = { date: e.date, time: e.time }
    return optimistic(setMine, id, patch, async () => {
      const n = await updateMyEvent(id, patch)
      if (e.linkedId) await syncLinked(n, e.linkedId)
      return n
    }).then(() => {
      offerUndo('일정 옮김', async () => {
        const n = await updateMyEvent(id, back)
        setMine(v => (v || []).map(x => (x.id === id ? n : x)))
        if (e.linkedId) await syncLinked(n, e.linkedId)
      })
    }).catch(() => {})
  }, [optimistic, syncLinked, offerUndo])

  /* 날짜가 붙은 할 일도 완료 처리한다 ('26.8.8) — 칩에 취소선이 그어진다 */
  const toggleEventDone = useCallback(e => optimistic(setMine, e.id, { done: !e.done },
    () => updateMyEvent(e.id, { done: !e.done })).catch(() => {}), [optimistic])

  const resizeEvent = useCallback((id, dur) => {
    write(K.dur, dur)
    return optimistic(setMine, id, { dur }, () => updateMyEvent(id, { dur })).catch(() => {})
  }, [optimistic])

  /* 날짜 지정 없애기 — 일정이 할 일로 되돌아간다 (팀 연동분은 같이 정리) */
  const unschedule = useCallback(id => guard(async () => {
    const e = (mineRef.current || []).find(x => x.id === id)
    if (!e) return
    const t = await createTodo({ txt: e.title, spaceId: e.spaceId, shared: e.shared, memo: e.memo, images: e.images })
    try {
      if (e.linkedId) await deleteEvent(e.linkedId).catch(() => {})
      await deleteMyEvent(id)
    } catch (ex) {
      await deleteTodo(t.id).catch(() => {})
      throw ex
    }
    setTodos(v => [t, ...(v || [])])
    setMine(v => v.filter(x => x.id !== id))
    setOpenId(null)
    offerUndo('할 일로 되돌림', async () => {
      const n = await createMyEvent({
        title: e.title, date: e.date, time: e.time, dur: e.dur,
        spaceId: e.spaceId, shared: e.shared, memo: e.memo, images: e.images,
      })
      await deleteTodo(t.id).catch(() => {})
      setMine(v => [...(v || []), n])
      setTodos(v => (v || []).filter(x => x.id !== t.id))
    })
  }), [guard, offerUndo])

  const removeEvent = useCallback(id => guard(async () => {
    const e = (mineRef.current || []).find(x => x.id === id)
    if (e?.linkedId) await deleteEvent(e.linkedId).catch(() => {})
    await deleteMyEvent(id)
    setMine(v => v.filter(x => x.id !== id))
    setOpenId(null)
    if (e) offerUndo('일정 삭제됨', async () => {
      const n = await createMyEvent({
        title: e.title, date: e.date, time: e.time, dur: e.dur,
        spaceId: e.spaceId, shared: e.shared, memo: e.memo, images: e.images,
      })
      setMine(v => [...(v || []), n])
    })
  }), [guard, offerUndo])

  const patchEvent = useCallback((id, patch, msg) => optimistic(setMine, id, patch, async () => {
    const n = await updateMyEvent(id, patch)
    if (patch.dur) write(K.dur, patch.dur)
    const e = (mineRef.current || []).find(x => x.id === id)
    if (e?.linkedId && (patch.date || patch.title)) await syncLinked(n, e.linkedId)
    if (msg) toast(msg)
    return n
  }).catch(() => {}), [optimistic, syncLinked])

  const toggleLink = useCallback(ev => guard(async () => {
    if (ev.linkedId) {
      await deleteEvent(ev.linkedId).catch(() => {})
      const n = await updateMyEvent(ev.id, { linkedId: null })
      setMine(v => v.map(x => (x.id === ev.id ? n : x)))
      toast('팀 캘린더에서 내림')
    } else {
      const created = await createEvent({
        title: ev.title, date: ev.date, endDate: null,
        channel: '업무', sub: null, campaign: null, kind: '팀',
        owner: TEAM[me] || me.split('@')[0],   // 팀 탭에 작성자 없는 일정이 뜨지 않게
        memo: '내 일정에서 연동',
      })
      const n = await updateMyEvent(ev.id, { linkedId: created.id })
      setMine(v => v.map(x => (x.id === ev.id ? n : x)))
      toast('팀 캘린더에 등록됨')
    }
  }), [guard, me])

  /* 빈 칸 클릭으로 만든 신규 일정 */
  const createAt = useCallback((date, time) => setNewAt({ date, time: time || null }), [])
  const saveNew = useCallback(form => guard(async () => {
    const dur = form.dur || read(K.dur, 60)
    const ev = await createMyEvent({ ...form, dur })
    if (form.time) write(K.dur, dur)
    setMine(v => [...(v || []), ev])
    setNewAt(null)
  }, '일정 등록됨'), [guard])

  const openEvent = useCallback(id => setOpenId(id), [])
  const openTodoRow = useCallback(id => setOpenTodoId(id), [])

  /* ── 키보드 ('26.8.8) — Notion Calendar 규약을 그대로 빌린다.
     전면 배정은 하지 않는다 (키를 다 외워야 하는 도구는 오히려 느려진다) ── */
  useEffect(() => {
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      if (openId || openTodoId || newAt) return          // 시트가 열려 있으면 시트 것이 우선
      const k = e.key
      if (k === '?') { e.preventDefault(); setHelp(v => !v); return }
      if (k === 'n' || k === 'N' || k === 'ㅜ') { e.preventDefault(); addRef.current?.focus(); return }
      if (k === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (k === 't' || k === 'T' || k === 'ㅅ') { setCursor(new Date()); return }
      if (k === 'm' || k === 'M' || k === 'ㅡ') { pickView('month'); return }
      if (k === 'w' || k === 'W' || k === 'ㅈ') { pickView('week'); return }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const n = k === 'ArrowLeft' ? -1 : 1
        setCursor(c => (viewRef.current === 'week' ? addDays(c, n * 7) : new Date(c.getFullYear(), c.getMonth() + n, 1)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, openTodoId, newAt, pickView])

  const open = (mine || []).find(e => e.id === openId) || null
  const openTodo = (todos || []).find(t => t.id === openTodoId) || null

  const spOf = useCallback(id => (spaces || []).find(s => s.id === id) || null, [spaces])
  const compact = useCompact()

  /* 오늘 요약 — 배치된 시간과 팀 일정을 함께 보여준다 (계획의 상한이 눈에 보이게) */
  const todayBox = useMemo(() => {
    const evs = (mine || []).filter(e => e.date === today)
    const planned = evs.reduce((a, e) => a + (e.time ? Math.max(SNAP, e.dur || 60) : 0), 0)
    const teamToday = teamEvents.filter(e => {
      const end = e.endDate && e.endDate > e.date ? e.endDate : e.date
      return e.kind !== '휴점' && e.date <= today && today <= end
    })
    return { n: evs.length, planned, team: teamToday.length }
  }, [mine, teamEvents, today])

  /* 레일에 띄울 스페이스별 남은 건수 */
  const spaceCounts = useMemo(() => {
    const m = { all: 0 }
    for (const t of todos || []) {
      if (t.done) continue
      m.all++
      if (t.spaceId) m[t.spaceId] = (m[t.spaceId] || 0) + 1
    }
    return m
  }, [todos])

  /* ── 렌더 ── */
  if (!ready) return <div className="wrap mytask"><Head /><div className="mt-empty">불러오는 중</div></div>
  if (err) return (
    <div className="wrap mytask">
      <Head />
      <div className="mt-empty">
        내 일정을 불러오지 못했습니다<br />
        테이블이 아직 없다면 data/mytask-setup.sql 실행이 필요합니다 (setup.md 15장)
        <div className="mt-empty-act"><button onClick={load}>다시 시도</button></div>
      </div>
    </div>
  )

  const q = norm(query)
  const shownTodos = (todos || []).filter(t => {
    if (spFilter && t.spaceId !== spFilter) return false
    if (hideDone && t.done) return false
    if (q && !(norm(t.txt).includes(q) || norm(t.memo).includes(q))) return false
    return true
  })
  /* 날짜 지정된 할 일 — 캘린더에 붙였다고 목록에서 사라지지 않는다 ('26.8.8 사용자 지시).
     드래그하면 "마감 미지정"에서 "날짜 지정됨"으로 옮겨갈 뿐이다.
     남의 것(공유받은 일정)은 내 할 일 목록에 섞지 않는다 */
  const shownDated = (mine || []).filter(e => {
    if (e.owner && e.owner !== me) return false
    if (spFilter && e.spaceId !== spFilter) return false
    if (hideDone && e.done) return false
    if (q && !(norm(e.title).includes(q) || norm(e.memo).includes(q))) return false
    return true
  }).sort((a, b) => a.date.localeCompare(b.date)
    || (mins(a.time) ?? 1e9) - (mins(b.time) ?? 1e9))
  const todayISO = today

  return (
    <div className="wrap mytask">
      <Head />
      {/* 폰 전용 전환 — 데스크톱에서는 CSS로 숨긴다 */}
      <div className="mt-mseg" role="tablist">
        <button role="tab" aria-selected={mView === 'todos'} className={mView === 'todos' ? 'on' : ''}
          onClick={() => pickMView('todos')}>할 일</button>
        <button role="tab" aria-selected={mView === 'cal'} className={mView === 'cal' ? 'on' : ''}
          onClick={() => pickMView('cal')}>캘린더</button>
      </div>
      <div className={`mt-cols${wide ? ' wide' : ''}${railOpen ? ' rail-open' : ''} m-${mView}`}>
        {/* 가장 좌측 분류 레일 — 접었다 펼 수 있다 (참고 이미지의 색점 열) */}
        <SpaceRail spaces={spaces} open={railOpen} onToggle={toggleRail}
          active={spFilter} counts={spaceCounts}
          onPick={id => setSpFilter(spFilter === id ? null : id)}
          onAddSpace={addSpace} onRemoveSpace={removeSpace} />
        <TodoPanel
          spaces={spaces} todos={shownTodos} allTodos={todos} spFilter={spFilter} me={me}
          dated={shownDated} today={todayISO} onOpenDated={openEvent} onToggleDated={toggleEventDone}
          draft={draft} setDraft={setDraft} addRef={addRef} searchRef={searchRef}
          query={query} setQuery={setQuery}
          hideDone={hideDone} onToggleHideDone={toggleHideDone}
          addSpaceId={addSpaceId} setAddSpaceId={setAddSpaceId}
          onAdd={addLine} onToggle={toggleTodo} onRemove={removeTodo}
          summary={todayBox}
        />
        <section className="mt-cal">
          <CalTop view={view} setView={pickView} cursor={cursor} setCursor={setCursor} cells={cells}
            wide={wide} onWide={toggleWide} onHelp={() => setHelp(true)} />
          <div className="mt-layers">
            {LAYERS.map(l => (
              <button key={l.id} className={`mt-ly${layers.has(l.id) ? ' on' : ''}`}
                aria-pressed={layers.has(l.id)}
                onClick={() => setLayers(s => {
                  const n = new Set(s)
                  n.has(l.id) ? n.delete(l.id) : n.add(l.id)
                  write(K.layers, [...n])
                  return n
                })}>
                <i style={{ background: l.color }} />{l.name}
              </button>
            ))}
          </div>
          {/* 좁은 화면에서 격자만 가로로 스크롤 — 본문이 통째로 밀리지 않게 */}
          <div className="mt-gwrap">
            {view === 'month'
              ? <MonthView cells={cells} byDay={byDay} today={today} clashIds={clashIds} spOf={spOf}
                  closedDays={closedDays} me={me} compact={compact}
                  onDay={iso => { setCursor(fromISO(iso)); pickView('week') }} />
              : <WeekView cells={cells} byDay={byDay} today={today} clashIds={clashIds} spOf={spOf}
                  closedDays={closedDays} hours={hours} me={me} />}
          </div>
          {clashes.length > 0 && (
            <div className="mt-clash">
              <b>시간이 겹치는 일정 {clashes.length}건</b>
              {clashes.slice(0, 3).map((c, i) => (
                <span key={i}>{fmtK(c.date)} {c.a.title}와 {c.b.title}</span>
              ))}
              {clashes.length > 3 && <span>외 {clashes.length - 3}건</span>}
            </div>
          )}
        </section>
      </div>

      <DragLayer onDropTodo={dropTodo} onMoveEvent={moveEvent} onUnschedule={unschedule}
        onResize={resizeEvent} onOpen={openEvent} onOpenTodo={openTodoRow} onNew={createAt} />

      {undo && <UndoBar label={undo.label} onUndo={runUndo} onClose={() => setUndo(null)} />}

      {newAt && (
        <NewSheet at={newAt} spaces={spaces} defaultSpace={spFilter}
          onClose={() => setNewAt(null)} onSave={saveNew} />
      )}
      {open && (
        <EventSheet ev={open} spaces={spaces} me={me} onClose={() => setOpenId(null)}
          onPatch={patchEvent} onLink={toggleLink} onUnschedule={unschedule}
          onDelete={removeEvent} onToggleDone={toggleEventDone} />
      )}
      {openTodo && (
        <TodoSheet td={openTodo} spaces={spaces} me={me} today={today}
          onClose={() => setOpenTodoId(null)}
          onPatch={patchTodo} onToggle={toggleTodo}
          onSchedule={(id, date, time) => { dropTodo(id, date, time); setOpenTodoId(null) }}
          onDelete={id => { removeTodo(id); setOpenTodoId(null) }} />
      )}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
    </div>
  )
}

function Head() {
  return (
    <header className="cal-head">
      <div>
        <h1>내 일정</h1>
        <p className="cal-desc">개인 할 일과 캘린더를 한 화면에서, 팀 일정과 겹치는지 바로 확인<br />
          할 일은 나만 보이고, 공유한 사람에게만 따로 보입니다</p>
      </div>
    </header>
  )
}

/* ── 분류 레일 ('26.8.8) — 가장 좌측, 접었다 펼 수 있다.
   접으면 색점만, 펼치면 이름과 남은 건수까지. 스페이스 추가와 삭제도 여기서 한다
   (예전엔 할 일 패널 안에 칩으로 있어 입력 영역을 밀어냈다) ── */
function SpaceRail({ spaces, open, onToggle, active, counts, onPick, onAddSpace, onRemoveSpace }) {
  const [draft, setDraft] = useState(null)
  const [arm, setArm] = useState(null)
  useEffect(() => {
    if (!arm) return
    const t = setTimeout(() => setArm(null), 5000)
    return () => clearTimeout(t)
  }, [arm])
  const submit = () => { onAddSpace(draft); setDraft(null) }
  /* 접힌 상태에서 추가를 누르면 입력이 보이도록 먼저 편다 */
  const startAdd = () => { if (!open) onToggle(); setDraft('') }

  return (
    <nav className={`mt-rail${open ? ' open' : ''}`} aria-label="분류">
      <div className="mt-rail-top">
        <button className="mt-rail-tog" onClick={onToggle} aria-expanded={open}
          aria-label={open ? '분류 접기' : '분류 펼치기'}>{open ? '‹' : '›'}</button>
        <button className="mt-rail-add" onClick={startAdd} aria-label="분류 추가"
          title="분류 추가">＋</button>
      </div>
      <div className="mt-rail-list">
        <button className={`mt-rail-i${active === null ? ' on' : ''}`} onClick={() => onPick(null)}
          title="전체" aria-pressed={active === null}>
          <i className="all" /><span>전체</span><em>{counts.all || 0}</em>
        </button>
        {spaces.map(sp => (
          <span className="mt-rail-w" key={sp.id}>
            <button className={`mt-rail-i${active === sp.id ? ' on' : ''}`} onClick={() => onPick(sp.id)}
              title={sp.name} aria-pressed={active === sp.id}>
              <i style={{ background: sp.color }} /><span>{sp.name}</span><em>{counts[sp.id] || 0}</em>
            </button>
            {open && (arm === sp.id
              ? <button className="mt-rail-x arm" onClick={() => { onRemoveSpace(sp.id); setArm(null) }}>삭제</button>
              : <button className="mt-rail-x" onClick={() => setArm(sp.id)}
                  aria-label={`${sp.name} 분류 삭제`}>×</button>)}
          </span>
        ))}
      </div>
      {draft !== null && (
        <div className="mt-rail-new">
          <input type="text" autoFocus value={draft} placeholder="분류 이름"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
              if (e.key === 'Escape') setDraft(null)
            }} />
          <button onClick={submit}>추가</button>
          <button onClick={() => setDraft(null)}>취소</button>
        </div>
      )}
    </nav>
  )
}

/* ── 오늘 요약 ── 계획의 상한이 눈에 보이게 (Sunsama 데일리 플래닝에서 가져온 최소한) */
function TodayBox({ n, planned, team }) {
  return (
    <div className="mt-todaybox">
      <div className="mt-tb-i"><b>{n}</b><span>오늘 내 일정</span></div>
      <div className="mt-tb-i"><b>{planned ? fmtDur(planned) : '없음'}</b><span>배치된 시간</span></div>
      <div className="mt-tb-i"><b>{team}</b><span>오늘 팀 일정</span></div>
    </div>
  )
}

/* ── 좌측 투두 패널 ── */
function TodoPanel({
  spaces, todos, allTodos, spFilter, me, draft, setDraft, addRef, searchRef,
  dated, today, onOpenDated, onToggleDated,
  query, setQuery, hideDone, onToggleHideDone,
  addSpaceId, setAddSpaceId, onAdd, onToggle, onRemove, summary,
}) {
  const left = (allTodos || []).filter(t => !t.done).length
  const [pickOpen, setPickOpen] = useState(false)
  const pick = addSpaceId !== undefined ? addSpaceId : spFilter
  const pickSp = spaces.find(x => x.id === pick) || null

  /* 정렬 ('26.8.7 사용자 지시) — 스페이스별 묶어 보기가 기본, 접기 상태는 브라우저에 기억 */
  const [sortBy, setSortBy] = useState(() => (read(K.sort, 'space') === 'recent' ? 'recent' : 'space'))
  const [fold, setFold] = useState(() => new Set(read(K.fold, [])))
  const setSort = v => { setSortBy(v); write(K.sort, v) }
  const toggleFold = key => setFold(f => {
    const n = new Set(f)
    n.has(key) ? n.delete(key) : n.add(key)
    write(K.fold, [...n])
    return n
  })

  /* 미완료가 위, 완료는 아래 — 어느 정렬에서도 같다 */
  const byDone = (a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1)
  const groups = useMemo(() => {
    const mineList = todos.filter(t => !t.owner || t.owner === me)
    /* 공유받은 항목은 남의 스페이스에 들어 있어 내 스페이스 어디에도 안 걸린다.
       예전에는 그래서 기본 정렬에서 통째로 사라져 공유받은 사실조차 몰랐다 */
    const got = todos.filter(t => t.owner && t.owner !== me)
    if (sortBy !== 'space') {
      const items = [...todos].sort((a, b) => byDone(a, b) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      return [{ key: 'all', head: false, items }]
    }
    const out = []
    for (const sp of spaces) {
      const items = mineList.filter(t => t.spaceId === sp.id).sort(byDone)
      if (items.length) out.push({
        key: sp.id, head: true, name: sp.name, color: sp.color,
        items, left: items.filter(t => !t.done).length,
      })
    }
    const none = mineList.filter(t => !t.spaceId).sort(byDone)
    /* 분류 없음은 항상 맨 뒤 — 정리되지 않은 것이 위로 올라오면 목록이 어수선해진다 */
    if (none.length) out.push({
      key: 'none', head: true, name: '분류 없음', color: null,
      items: none, left: none.filter(t => !t.done).length,
    })
    if (got.length) out.push({
      key: 'shared', head: true, name: '공유받음', color: null, shared: true,
      items: got.sort(byDone), left: got.filter(t => !t.done).length,
    })
    return out
  }, [todos, spaces, sortBy, me])

  return (
    <aside className="mt-todos" data-unschedule="1">
      <div className="mt-tp-head">
        <b>할 일</b>
        <div className="mt-tp-right">
          <span>남은 {left}건</span>
          <div className="mt-sort">
            <button className={sortBy === 'space' ? 'on' : ''} onClick={() => setSort('space')}>스페이스별</button>
            <button className={sortBy === 'recent' ? 'on' : ''} onClick={() => setSort('recent')}>최근순</button>
          </div>
        </div>
      </div>

      <TodayBox {...summary} />

      <div className="mt-search">
        <input type="search" ref={searchRef} value={query} placeholder="할 일과 일정 검색"
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setQuery('') }} />
        <button className={hideDone ? 'on' : ''} aria-pressed={hideDone} onClick={onToggleHideDone}>
          {hideDone ? '완료 보기' : '완료 숨기기'}
        </button>
      </div>
      {/* 간단한 한 줄 추가 — 버튼 없이 엔터로. 담을 곳은 왼쪽 색점을 눌러 고른다
          (분류 칩 줄과 담을 곳 칩 줄이 입력 영역을 밀어내던 것을 레일로 옮김) */}
      <div className="mt-add">
        <button className="mt-add-dot" aria-label="담을 곳 고르기" aria-expanded={pickOpen}
          title={pickSp ? `담을 곳 ${pickSp.name}` : '담을 곳 분류 없음'}
          style={{ background: pickSp ? pickSp.color : 'transparent' }}
          onClick={() => setPickOpen(v => !v)} />
        <input type="text" ref={addRef} value={draft}
          placeholder="할 일 추가, 날짜를 쓰면 일정이 됩니다"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAdd() }} />
        {pickOpen && (
          <div className="mt-add-pop">
            <button className={pick === null ? 'on' : ''}
              onClick={() => { setAddSpaceId(null); setPickOpen(false) }}>
              <i className="none" />분류 없음
            </button>
            {spaces.map(sp => (
              <button key={sp.id} className={pick === sp.id ? 'on' : ''}
                onClick={() => { setAddSpaceId(sp.id); setPickOpen(false) }}>
                <i style={{ background: sp.color }} />{sp.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <AddHint draft={draft} />

      <div className="mt-todo-list">
        {/* 날짜 지정된 할 일 — 캘린더에 붙였다고 사라지지 않는다 ('26.8.8 사용자 지시).
            드래그하면 아래 "마감 미지정"에서 이쪽으로 옮겨올 뿐이다 */}
        <section className="mt-sec">
          <div className="mt-sec-h">
            <b>날짜 지정된 할 일</b>
            <span>{dated.length}건</span>
          </div>
          {dated.length === 0 && <div className="mt-empty sm">캘린더로 끌어다 놓으면 여기에 모입니다</div>}
          {dated.map(e => (
            <DatedRow key={e.id} e={e} spaces={spaces} today={today}
              onToggle={onToggleDated} onOpen={onOpenDated} />
          ))}
        </section>

        <section className="mt-sec">
          <div className="mt-sec-h">
            <b>마감 미지정 할 일</b>
            <span>{todos.length}건</span>
          </div>
          {todos.length === 0 && (
            <div className="mt-empty sm">{query ? '검색 결과가 없습니다' : '담아 둔 할 일이 없습니다'}</div>
          )}
          {groups.map(g => (
            <section className="mt-group" key={g.key}>
              {g.head && (
                <button className={`mt-g-head${fold.has(g.key) ? ' folded' : ''}`}
                  aria-expanded={!fold.has(g.key)} onClick={() => toggleFold(g.key)}>
                  {g.color && <i style={{ background: g.color }} />}
                  <b>{g.name}</b>
                  <span>{g.left > 0 ? `남은 ${g.left}` : '완료'}</span>
                  <em>{fold.has(g.key) ? '＋' : '−'}</em>
                </button>
              )}
              {!fold.has(g.key) && g.items.map(t => (
                <TodoRow key={t.id} t={t} spaces={spaces} showSpace={!g.head} me={me}
                  onToggle={onToggle} onRemove={onRemove} />
              ))}
            </section>
          ))}
        </section>
      </div>
      <div className="mt-tp-hint">여기에 놓으면 날짜 지정이 없어집니다</div>
      <div className="mt-tp-foot">눌러서 메모와 이미지를 남기고, 캘린더로 끌어다 놓으면 개인 일정이 됩니다<br />
        폰에서는 길게 누른 뒤 끌면 됩니다</div>
    </aside>
  )
}

/* 입력줄이 무엇으로 해석되는지 미리 알려준다 — 날짜를 쓰면 일정이 되기 때문에
   결과가 바뀌는 것을 사람이 먼저 알아야 한다 */
function AddHint({ draft }) {
  const p = useMemo(() => parseLine(draft), [draft])
  if (!draft.trim() || !p) return null
  if (!p.date) return <div className="mt-add-hint">할 일로 담깁니다{p.tag ? `, 스페이스 ${p.tag}` : ''}</div>
  return (
    <div className="mt-add-hint on">
      일정으로 등록됩니다
      <b>{fmtK(p.date)}{p.time ? ` ${p.time}` : ' 종일'}</b>
      {p.dur && p.time && <span>{fmtDur(p.dur)}</span>}
      {p.tag && <span>스페이스 {p.tag}</span>}
    </div>
  )
}

/* 날짜 지정된 할 일 한 줄 — 언제인지가 주인공이라 날짜를 앞에 세운다.
   완료하면 취소선 (캘린더 칩과 같은 표기) */
function DatedRow({ e, spaces, today, onToggle, onOpen }) {
  const sp = spaces.find(x => x.id === e.spaceId)
  const past = e.date < today
  const isToday = e.date === today
  return (
    <div className={`mt-dated${e.done ? ' done' : ''}${isToday ? ' today' : ''}`}>
      <button type="button" className={`mt-box${e.done ? ' on' : ''}`}
        role="checkbox" aria-checked={e.done} aria-label={`${e.title} 완료`}
        onClick={() => onToggle(e)} />
      <button className="mt-dated-b" onClick={() => onOpen(e.id)}>
        <span className="mt-dated-t" title={e.title}>{e.title}</span>
        <span className="mt-dated-m">
          {sp && <i style={{ background: sp.color }} />}
          <em className={past && !e.done ? 'past' : ''}>
            {isToday ? '오늘' : fmtK(e.date)}{e.time ? ` ${e.time}` : ''}
          </em>
          {e.linkedId && <b>팀</b>}
        </span>
      </button>
    </div>
  )
}

/* 할 일 한 줄 — 스페이스별로 묶어 보면 그룹 머리에 이미 스페이스가 있으므로 칩을 생략한다 */
function TodoRow({ t, spaces, showSpace, me, onToggle, onRemove }) {
  const s = spaces.find(x => x.id === t.spaceId)
  const got = !!(t.owner && t.owner !== me)      // 공유받은 것 — 끌 수 없고 지울 수 없다
  const ro = got && !t.sharedEdit
  return (
    <div className={`mt-todo${t.done ? ' done' : ''}${got ? ' got' : ''}`}
      data-todo={got ? undefined : t.id} data-open={t.id}>
      <button type="button" className={`mt-box${t.done ? ' on' : ''}`}
        role="checkbox" aria-checked={t.done} aria-label={`${t.txt} 완료`}
        disabled={ro} onClick={() => !ro && onToggle(t)} />
      <div className="mt-t-body">
        <div className="mt-t-txt" title={t.txt}>{t.txt}</div>
        <div className="mt-t-meta">
          {got && <span className="mt-t-got">{TEAM[t.owner] || t.owner} 공유</span>}
          {showSpace && s && <span className="mt-t-sp"><i style={{ background: s.color }} />{s.name}</span>}
          {t.memo && <span className="mt-t-mark">메모</span>}
          {t.images.length > 0 && <span className="mt-t-mark">이미지 {t.images.length}</span>}
          {!got && t.shared.length > 0 && <span className="mt-t-share">공유 {t.shared.length}명</span>}
        </div>
      </div>
      {!got && <button className="mt-t-x" onClick={() => onRemove(t.id)} aria-label={`${t.txt} 삭제`}>×</button>}
    </div>
  )
}

/* ── 상단 네비 ── */
function CalTop({ view, setView, cursor, setCursor, cells, wide, onWide, onHelp }) {
  /* 주간 제목은 범위로 — 8/31~9/6 주가 "2026.08 31일 주"로 보이면 9월이 절반인데 8월로 읽힌다 */
  const a = cells[0]?.iso, b = cells[cells.length - 1]?.iso
  const title = view === 'week'
    ? (a.slice(0, 7) === b.slice(0, 7)
      ? `${a.slice(0, 4)}.${a.slice(5, 7)} ${+a.slice(8, 10)}일 ~ ${+b.slice(8, 10)}일`
      : `${+a.slice(5, 7)}월 ${+a.slice(8, 10)}일 ~ ${+b.slice(5, 7)}월 ${+b.slice(8, 10)}일`)
    : `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`
  const move = n => setCursor(c => (view === 'week' ? addDays(c, n * 7) : new Date(c.getFullYear(), c.getMonth() + n, 1)))
  return (
    <div className="mt-caltop">
      <div className="cal-nav">
        <button onClick={() => move(-1)} aria-label="이전">‹</button>
        <b>{title}</b>
        <button onClick={() => move(1)} aria-label="다음">›</button>
        <button className="mt-today" onClick={() => setCursor(new Date())}>오늘</button>
      </div>
      <div className="mt-caltop-r">
        <div className="seg">
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>월간</button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>주간</button>
        </div>
        <button className={`mt-wide${wide ? ' on' : ''}`} aria-pressed={wide} onClick={onWide}>
          {wide ? '할 일 보기' : '크게 보기'}
        </button>
        <button className="mt-help" onClick={onHelp} aria-label="단축키 도움말">?</button>
      </div>
    </div>
  )
}

/* ── 일정 칩 ──
   분류 색을 반투명 배경 + 왼쪽 색선으로 입힌다 ('26.8.8 참고 이미지) — 예전엔 내 일정이
   전부 같은 그린이라 어느 분류인지 칩만 보고는 알 수 없었다. 글자는 잉크로 둬서
   옅은 색 위에서도 읽힌다 */
export function chipColor(e, spOf) {
  if (e.kind === 'mine') return spOf(e.spaceId)?.color || '#0B4336'
  return LAYER_COLOR[e.kind] || '#9BA8C4'
}

function Chip({ e, clash, slot, idx, n, top, height, spOf, me }) {
  const color = chipColor(e, spOf)
  const got = e.kind === 'mine' && e.owner && me && e.owner !== me
  const range = timeLabel(e.time, e.dur)
  const label = `${range ? `${range} ` : ''}${e.title}`
  const style = {
    background: tint(color, e.kind === 'mine' ? 0.15 : 0.08),
    borderLeft: `3px solid ${e.kind === 'mine' ? color : tint(color, 0.55)}`,
    ...(slot ? {
      top, height,
      left: `calc(${(idx * 100) / n}% + 2px)`,
      width: `calc(${100 / n}% - 4px)`,
    } : null),
  }
  /* 30분짜리는 두 줄이 안 들어간다 — 제목만 남기고 시각은 title 속성으로 */
  const roomy = !slot || height >= 34
  return (
    <div className={`mt-ev ${e.kind === 'mine' ? 'mine' : `bg ${e.kind}`}${clash ? ' clash' : ''}${got ? ' got' : ''}${e.done ? ' done' : ''}${e.span === 'mid' || e.span === 'end' ? ' cont' : ''}`}
      data-ev={e.kind === 'mine' && !got ? e.id : undefined}
      data-open={e.kind === 'mine' ? e.id : undefined}
      style={style} title={label}>
      <span className="mt-ev-n">{e.title}</span>
      {range && roomy && <span className="mt-ev-t">{range}</span>}
      <span className="mt-ev-marks">
        {!!(e.memo || e.images?.length) && <i className="mk memo" title="메모나 첨부 있음" />}
        {e.linkedId && <span className="mt-ev-lk">팀</span>}
      </span>
      {slot && e.kind === 'mine' && !got && (
        <span className="mt-ev-grip" data-resize={e.id} aria-hidden="true" />
      )}
    </div>
  )
}

/* ── 월간 ── */
const MonthView = React.memo(function MonthView({ cells, byDay, today, clashIds, spOf, closedDays, me, onDay, compact }) {
  return (
    <div className="mt-grid">
      {DOW.map(d => <div key={d} className="mt-dow">{d}</div>)}
      {cells.map(c => {
        const list = byDay[c.iso] || []
        const hol = HOLIDAYS[c.iso], closed = CLOSED_DAYS[c.iso] || closedDays[c.iso]
        const over = list.length - MONTH_MAX
        return (
          <div className={`mt-cell${c.inM ? '' : ' dim'}${closed ? ' closed' : hol ? ' hol' : ''}`}
            key={c.iso} data-date={c.iso}>
            <button className={`mt-dnum${c.iso === today ? ' today' : ''}`}
              onClick={() => onDay(c.iso)} aria-label={`${c.day}일 시간별로 보기`}>{c.day}</button>
            {hol && <span className="mt-tag">{hol}</span>}
            {closed && <span className="mt-tag closed">{closed}</span>}
            {compact
              ? (
                <button className="mt-dots" onClick={() => onDay(c.iso)}
                  aria-label={`${c.day}일 일정 ${list.length}건 보기`}>
                  {list.slice(0, 6).map(e => (
                    <i key={e.id} className={e.done ? 'done' : undefined}
                      style={{ background: chipColor(e, spOf) }} />
                  ))}
                </button>
              )
              : (
                <div className="mt-evs">
                  {list.slice(0, MONTH_MAX).map(e => (
                    <Chip key={e.id} e={e} clash={clashIds.has(e.id)} spOf={spOf} me={me} />
                  ))}
                  {over > 0 && (
                    <button className="mt-more" onClick={() => onDay(c.iso)}>{over}건 더 보기</button>
                  )}
                </div>
              )}
            {/* 빈 자리를 눌러 그 날짜로 바로 등록 — 예전엔 할 일을 먼저 만들어 끌어야만 했다 */}
            {!compact && (
              <button className="mt-cell-add" data-new={c.iso} aria-label={`${c.day}일에 일정 등록`}>＋</button>
            )}
          </div>
        )
      })}
    </div>
  )
})

/* ── 주간 시간 격자 ──
   요일마다 열이 하나고, 칩은 그 열 위에 절대 배치된다. 시각 칸은 칩 뒤에 깔린
   드롭 타깃 전용이라 긴 칩이 아래 칸에 덮이지 않는다 (길이 조절 그립이 항상 잡힌다) */
const WeekView = React.memo(function WeekView({ cells, byDay, today, clashIds, spOf, closedDays, hours, me }) {
  const laid = useMemo(() => {
    const m = {}
    for (const c of cells) m[c.iso] = layoutDay(byDay[c.iso] || [])
    return m
  }, [cells, byDay])

  const base = hours[0] * 60
  const colH = hours.length * SLOT
  const posOf = m => ((m - base) / 60) * SLOT

  /* 지금 시각 선 — 진입하자마자 "지금 어디쯤인지"가 보이게 */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const nowM = now.getHours() * 60 + now.getMinutes()
  const nowTop = nowM >= base && nowM <= base + colH * (60 / SLOT) ? posOf(nowM) : null

  const colRef = useRef(null)
  /* 주간으로 들어오면 현재 시각이 보이는 위치로 스크롤 */
  useEffect(() => {
    const el = colRef.current?.parentElement
    if (!el || nowTop === null) return
    el.scrollTop = Math.max(0, nowTop - el.clientHeight / 3)
  }, [])   // 진입 시 한 번

  return (
    <div className="mt-wgrid">
      <div className="mt-wg-corner" />
      {cells.map(c => {
        const hol = HOLIDAYS[c.iso], closed = CLOSED_DAYS[c.iso] || closedDays[c.iso]
        return (
          <div className={`mt-wg-head${closed ? ' closed' : hol ? ' hol' : ''}`} key={c.iso}>
            <span>{DOW[c.dow]}</span>
            <b className={c.iso === today ? 'today' : ''}>{c.day}</b>
            {(closed || hol) && <em>{closed || hol}</em>}
          </div>
        )
      })}

      <div className="mt-wg-lab allday">종일</div>
      {cells.map(c => {
        const list = (byDay[c.iso] || []).filter(e => !e.time)
        return (
          <div className="mt-wg-cell allday" key={c.iso} data-date={c.iso} data-new={c.iso}>
            {list.map(e => <Chip key={e.id} e={e} clash={clashIds.has(e.id)} spOf={spOf} me={me} />)}
          </div>
        )
      })}

      <div className="mt-wg-hcol" style={{ height: colH }}>
        {hours.map(h => (
          <div className="mt-wg-hr" key={h} style={{ height: SLOT }}>{String(h).padStart(2, '0')}시</div>
        ))}
      </div>
      {cells.map((c, ci) => (
        <div className={`mt-wg-col${c.iso === today ? ' today' : ''}`} key={c.iso}
          style={{ height: colH }} ref={ci === 0 ? colRef : undefined}>
          {/* 30분 단위 드롭 타깃 겸 빈 칸 등록 버튼 */}
          {hours.map((h, i) => (
            <React.Fragment key={h}>
              <button className="mt-wg-slot" style={{ top: i * SLOT, height: SLOT / 2 }}
                data-date={c.iso} data-time={`${String(h).padStart(2, '0')}:00`} data-new={c.iso}
                aria-label={`${c.day}일 ${h}시에 등록`} />
              <button className="mt-wg-slot half" style={{ top: i * SLOT + SLOT / 2, height: SLOT / 2 }}
                data-date={c.iso} data-time={`${String(h).padStart(2, '0')}:30`} data-new={c.iso}
                aria-label={`${c.day}일 ${h}시 30분에 등록`} />
            </React.Fragment>
          ))}
          {c.iso === today && nowTop !== null && (
            <div className="mt-now" style={{ top: nowTop }}><i />{hhmm(nowM)}</div>
          )}
          {(laid[c.iso] || []).map(it => (
            <Chip key={it.e.id} e={it.e} clash={clashIds.has(it.e.id)} slot me={me}
              idx={it.col} n={it.n} spOf={spOf}
              top={posOf(it.s) + 1} height={Math.max(16, ((it.t - it.s) / 60) * SLOT - 2)} />
          ))}
        </div>
      ))}
    </div>
  )
})

/* ── 드래그 계층 — 투두 이동, 일정 이동, 날짜 해제, 길이 조절, 빈 칸 등록을 한 곳에서.
   콜백이 고정이라 document 리스너를 한 번만 붙인다 ──

   폰에서는 길게 누른 뒤에 끈다 ('26.8.8) — 예전엔 터치를 통째로 막아, 아이폰에서는
   할 일을 캘린더에 올릴 방법이 아예 없었다. 바로 끌게 하면 세로 스크롤과 충돌하므로
   350ms 롱프레스를 게이트로 두고, 드래그가 시작된 뒤에만 touchmove를 막는다 */
function DragLayer({ onDropTodo, onMoveEvent, onUnschedule, onResize, onOpen, onOpenTodo, onNew }) {
  const suppress = useRef(false)
  const dragging = useRef(false)

  useEffect(() => {
    /* 드래그 중에는 화면이 따라 스크롤되지 않게 막는다 (수동 리스너여야 preventDefault가 먹는다) */
    const blockScroll = e => { if (dragging.current) e.preventDefault() }
    document.addEventListener('touchmove', blockScroll, { passive: false })

    const targetUnder = v => {
      const el = document.elementFromPoint(v.clientX, v.clientY)
      if (!el) return null
      const un = el.closest('[data-unschedule]')
      if (un) return { un: true, el: un }
      const slot = el.closest('[data-time]')
      if (slot) return { un: false, el: slot, date: slot.dataset.date, time: slot.dataset.time }
      const c = el.closest('[data-date]')
      return c ? { un: false, el: c, date: c.dataset.date, time: null } : null
    }

    const down = pv => {
      if (pv.button != null && pv.button !== 0) return
      const touch = pv.pointerType === 'touch'

      /* 길이 조절 그립 — 칩 아래를 잡아 끌면 30분 단위로 붙는다 */
      const grip = pv.target.closest('[data-resize]')
      if (grip) {
        pv.preventDefault(); pv.stopPropagation()
        const chip = grip.closest('.mt-ev')
        const id = grip.dataset.resize
        const startY = pv.clientY
        const startH = chip.getBoundingClientRect().height
        let dur = null
        dragging.current = true
        const mv = m => {
          const px = Math.max(SLOT / 2, startH + (m.clientY - startY))
          dur = Math.max(SNAP, Math.round(((px / SLOT) * 60) / SNAP) * SNAP)
          chip.style.height = `${(dur / 60) * SLOT - 2}px`
        }
        const off = () => {
          dragging.current = false
          window.removeEventListener('pointermove', mv)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', cancel)
        }
        /* 실패하면 React가 그린 높이로 돌아가야 한다 — 인라인 style을 남겨두면
           칩이 잘못된 길이로 굳는다 */
        const restore = () => { chip.style.height = '' }
        const cancel = () => { off(); restore() }
        const up = () => {
          off()
          suppress.current = true
          setTimeout(() => {
            suppress.current = false
            restore()
            if (dur) onResize(id, dur)
          }, 0)
        }
        window.addEventListener('pointermove', mv)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', cancel)
        return
      }

      const src = pv.target.closest('[data-todo], .mt-ev.mine')
      if (!src) return
      if (src.classList.contains('got')) return
      if (pv.target.closest('.mt-box, .mt-t-x')) return
      const isTodo = src.hasAttribute('data-todo')
      const id = isTodo ? src.dataset.todo : src.dataset.ev
      if (!id) return
      /* 마우스는 네이티브 드래그와 텍스트 선택을 즉시 차단.
         터치는 롱프레스 전까지 스크롤을 살려둬야 하므로 여기서 막지 않는다 */
      if (!touch) pv.preventDefault()

      const st = { active: false, x: pv.clientX, y: pv.clientY }
      let last = null
      let hold = null
      const panel = document.querySelector('[data-unschedule]')
      const ghost = document.createElement('div')
      ghost.className = 'mt-ghost'

      const clear = () => {
        if (!last) return
        last.el.classList.remove('drop')
        panel?.classList.remove('unschedule')
      }
      const begin = () => {
        st.active = true
        dragging.current = true
        src.classList.add('dragging')
        ghost.textContent = (src.querySelector('.mt-t-txt, .mt-ev-n')?.textContent || '').slice(0, 24)
        document.body.appendChild(ghost)
      }
      const mv = m => {
        if (!st.active) {
          const moved = Math.hypot(m.clientX - st.x, m.clientY - st.y)
          if (touch) { if (moved > 10) { clearTimeout(hold); hold = null; off() } return }
          if (moved < 6) return
          begin()
        }
        m.preventDefault()
        clear()
        last = targetUnder(m)
        /* 놓일 자리를 시각까지 보여준다 — 시간 격자에서는 이게 없으면 몇 시에 놓이는지 모른다 */
        ghost.style.transform = `translate(${m.clientX + 12}px, ${m.clientY + 12}px)`
        ghost.dataset.at = last?.un ? '날짜 지정 없애기' : last?.time || (last?.date ? '종일' : '')
        if (last) {
          if (last.un) panel?.classList.add('unschedule')
          else last.el.classList.add('drop')
        }
      }
      const off = () => {
        clearTimeout(hold)
        dragging.current = false
        window.removeEventListener('pointermove', mv)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', off)
        src.classList.remove('dragging')
        ghost.remove()
        clear()
      }
      const up = uv => {
        const wasActive = st.active
        off()
        if (!wasActive) return
        suppress.current = true
        const t = targetUnder(uv)
        /* 화면 갱신은 한 틱 뒤로 — pointerup 처리 중 DOM 교체는 제스처 상태를 흔든다 */
        setTimeout(() => {
          suppress.current = false
          if (!t) return
          if (t.un) { if (!isTodo) onUnschedule(id); return }
          if (isTodo) onDropTodo(id, t.date, t.time)
          else onMoveEvent(id, t.date, t.time === null ? undefined : t.time)
        }, 0)
      }
      if (touch) hold = setTimeout(() => { hold = null; begin() }, 350)
      window.addEventListener('pointermove', mv)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', off)
    }

    /* 드래그 끝에 브라우저가 click을 한 번 더 쏜다 — 억제하지 않으면 상세가 저절로 열린다 */
    const click = ev => {
      if (suppress.current) return
      if (ev.target.closest('.mt-box, .mt-t-x, .mt-dnum, .mt-more, .mt-ev-grip')) return
      const chip = ev.target.closest('.mt-ev[data-open]')
      if (chip) { onOpen(chip.dataset.open); return }
      const row = ev.target.closest('[data-open]')
      if (row && row.classList.contains('mt-todo')) { onOpenTodo(row.dataset.open); return }
      /* 빈 칸 = 그 날짜와 시각으로 바로 등록 */
      const slot = ev.target.closest('[data-new]')
      if (slot) onNew(slot.dataset.new, slot.dataset.time || null)
    }

    document.addEventListener('pointerdown', down)
    document.addEventListener('click', click)
    return () => {
      document.removeEventListener('touchmove', blockScroll)
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('click', click)
    }
  }, [onDropTodo, onMoveEvent, onUnschedule, onResize, onOpen, onOpenTodo, onNew])

  return null
}

/* ── 실행 취소 바 — 이동, 날짜 해제, 삭제 직후 8초 ── */
function UndoBar({ label, onUndo, onClose }) {
  return (
    <div className="mt-undo" role="status">
      <span>{label}</span>
      <button onClick={onUndo}>실행 취소</button>
      <button className="x" onClick={onClose} aria-label="닫기">×</button>
    </div>
  )
}

/* ── 메모 입력 ── 타이핑마다 저장하면 요청이 폭주하므로 포커스를 떠날 때만 저장.
   Esc로 시트를 닫으면 포커스된 노드가 그대로 언마운트되어 onBlur가 오지 않는다 —
   언마운트 시점에도 한 번 더 저장한다 (긴 메모를 쓰고 습관적으로 Esc를 누르면
   전부 날아가던 문제) */
function MemoBox({ value, onSave, rows = 4, placeholder = '메모를 남기면 상세에서 계속 보입니다' }) {
  const [v, setV] = useState(value || '')
  const [dirty, setDirty] = useState(false)
  const live = useRef({ v: value || '', dirty: false, base: value || '', onSave })
  live.current.onSave = onSave
  live.current.base = value || ''
  useEffect(() => { setV(value || ''); setDirty(false); live.current.v = value || ''; live.current.dirty = false }, [value])
  useEffect(() => () => {
    const l = live.current
    if (l.dirty && l.v !== l.base) l.onSave(l.v)
  }, [])
  const commit = () => {
    if (!dirty || v === (value || '')) { setDirty(false); live.current.dirty = false; return }
    setDirty(false); live.current.dirty = false
    onSave(v)
  }
  return (
    <div className="mt-memo">
      <textarea rows={rows} value={v} placeholder={placeholder}
        onChange={e => { setV(e.target.value); setDirty(true); live.current.v = e.target.value; live.current.dirty = true }}
        onBlur={commit} />
      {dirty && <button className="mt-memo-save" onClick={commit}>메모 저장</button>}
    </div>
  )
}

/* 시간 입력 한 벌 — 신규와 상세가 같은 모양을 쓴다 */
function TimeRow({ time, dur, onTime, onDur }) {
  const allday = !time
  const steps = dur && !DUR_STEPS.includes(dur) ? [...DUR_STEPS, dur].sort((a, b) => a - b) : DUR_STEPS
  return (
    <>
      <div className="mt-sh-row">
        <input type="time" value={time || ''} disabled={allday} aria-label="시각"
          onChange={e => onTime(e.target.value || null)} />
        <select value={String(dur || 60)} disabled={allday} aria-label="소요 시간"
          onChange={e => onDur(+e.target.value)}>
          {steps.map(m => <option key={m} value={m}>{fmtDur(m)}</option>)}
        </select>
      </div>
      <label className="mt-chk">
        <input type="checkbox" checked={allday}
          onChange={e => onTime(e.target.checked ? null : '10:00')} />
        <span>종일<small>시간을 정하지 않으면 주간 화면 맨 위 종일 줄에 놓입니다</small></span>
      </label>
    </>
  )
}

function SpacePick({ spaces, value, onPick }) {
  return (
    <div className="mt-people">
      {spaces.map(s => (
        <button key={s.id} className={`mt-person${value === s.id ? ' on' : ''}`}
          onClick={() => onPick(value === s.id ? null : s.id)}>{s.name}</button>
      ))}
      {spaces.length === 0 && <span className="mt-empty sm">스페이스를 만들면 여기서 고를 수 있습니다</span>}
    </div>
  )
}

function SharePick({ item, me, onPatch }) {
  const emails = Object.keys(TEAM).filter(e => e !== me)
  return (
    <>
      <div className="mt-people">
        {emails.map(em => (
          <button key={em} className={`mt-person${item.shared.includes(em) ? ' on' : ''}`}
            onClick={() => onPatch({
              shared: item.shared.includes(em) ? item.shared.filter(x => x !== em) : [...item.shared, em],
            })}>{TEAM[em]}</button>
        ))}
      </div>
      <label className="mt-chk">
        <input type="checkbox" checked={item.sharedEdit}
          onChange={e => onPatch({ sharedEdit: e.target.checked })} />
        <span>공유받은 사람도 수정 가능<small>해제하면 상대는 보기만 됩니다</small></span>
      </label>
      {item.shared.length > 0 && (
        <p className="mt-sh-warn">첨부한 이미지는 공유 대상에게 보이지 않습니다, 파일은 개인 보관함에만 저장됩니다</p>
      )}
    </>
  )
}

/* ── 신규 일정 시트 ('26.8.8) — 빈 칸을 눌러 바로 만든다 ── */
function NewSheet({ at, spaces, defaultSpace, onClose, onSave }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(at.date)
  const [time, setTime] = useState(at.time)
  const [dur, setDur] = useState(() => read(K.dur, 60))
  const [spaceId, setSpaceId] = useState(defaultSpace || null)
  const ok = title.trim() && date
  const submit = () => { if (ok) onSave({ title: title.trim(), date, time, dur, spaceId }) }
  return (
    <ModalShell onClose={onClose} className="mt-sheet">
      <h3>새 일정</h3>
      <div className="mt-sh-date">{fmtK(date)}{time ? ` ${time}` : ' 종일'}</div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">제목</div>
        <input className="mt-sh-name" autoFocus value={title} placeholder="무엇을 하나요"
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit() }} />
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">날짜와 시간</div>
        <div className="mt-sh-row">
          <input type="date" value={date} aria-label="날짜" onChange={e => setDate(e.target.value)} />
        </div>
        <TimeRow time={time} dur={dur} onTime={setTime} onDur={setDur} />
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">스페이스</div>
        <SpacePick spaces={spaces} value={spaceId} onPick={setSpaceId} />
      </div>

      <div className="mt-sh-acts">
        <button onClick={onClose}>취소</button>
        <button className="primary" disabled={!ok} onClick={submit}>등록</button>
      </div>
    </ModalShell>
  )
}

/* ── 할 일 상세 시트 — 제목, 날짜 지정, 메모, 이미지, 스페이스, 공유를 한 화면에서 ── */
function TodoSheet({ td, spaces, me, today, onClose, onPatch, onToggle, onDelete, onSchedule }) {
  const [title, setTitle] = useState(td.txt)
  const [delArm, setDelArm] = useState(false)
  const [schedDate, setSchedDate] = useState(today)
  const [schedTime, setSchedTime] = useState('')
  useEffect(() => setTitle(td.txt), [td.txt])
  const got = !!(td.owner && td.owner !== me)
  const ro = got && !td.sharedEdit
  const saveTitle = () => {
    const t = title.trim()
    if (!t || t === td.txt) { setTitle(td.txt); return }
    onPatch(td.id, { txt: t })
  }
  return (
    <ModalShell onClose={onClose} className="mt-sheet">
      <div className="mt-sh-title">
        <button className={`mt-box${td.done ? ' on' : ''}`} role="checkbox" aria-checked={td.done}
          disabled={ro} onClick={() => !ro && onToggle(td)}
          aria-label={td.done ? '완료 해제' : '완료 처리'} />
        <input className={`mt-sh-name${td.done ? ' done' : ''}`} value={title} readOnly={ro}
          onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.target.blur() }} />
      </div>
      <div className="mt-sh-date">
        {td.done ? '완료' : '진행 중'}
        {got && <span className="mt-sh-got">{TEAM[td.owner] || td.owner} 공유{ro ? ', 보기만 가능' : ''}</span>}
      </div>

      {/* 날짜를 정하면 일정이 된다 — 드래그와 같은 동작을 손가락으로도 할 수 있게 ('26.8.8).
          폰에서는 할 일 패널과 캘린더가 세로로 쌓여 한 화면에 같이 보이지 않으므로
          드래그만으로는 일정을 만들 길이 없다 */}
      {!ro && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">날짜 지정</div>
          <div className="mt-sh-row">
            <input type="date" value={schedDate} aria-label="날짜"
              onChange={e => setSchedDate(e.target.value)} />
            <input type="time" value={schedTime} aria-label="시각"
              onChange={e => setSchedTime(e.target.value)} />
            <button className="mt-sched" disabled={!schedDate}
              onClick={() => onSchedule(td.id, schedDate, schedTime || null)}>일정으로</button>
          </div>
          <p className="mt-sh-hint">날짜를 정하면 캘린더로 옮겨가고 메모와 이미지도 같이 따라갑니다<br />
            시각을 비우면 종일 일정이 됩니다</p>
        </div>
      )}

      {!ro && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">메모</div>
          <MemoBox value={td.memo} rows={5} onSave={v => onPatch(td.id, { memo: v }, '메모 저장됨')} />
        </div>
      )}
      {ro && td.memo && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">메모</div>
          <p className="mt-sh-ro">{td.memo}</p>
        </div>
      )}

      {!got && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">이미지</div>
          <ImageAttach imgs={td.images} canEdit storeKey={td.id} api={MY_IMAGE_API}
            hint="나만 봅니다" onChange={imgs => onPatch(td.id, { images: imgs })} />
        </div>
      )}

      {!ro && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">스페이스</div>
          <SpacePick spaces={spaces} value={td.spaceId} onPick={id => onPatch(td.id, { spaceId: id })} />
        </div>
      )}

      {!got && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">공유</div>
          <SharePick item={td} me={me} onPatch={p => onPatch(td.id, p)} />
        </div>
      )}

      <div className="mt-sh-note">캘린더로 끌어다 놓으면 날짜가 붙고, 메모와 이미지도 같이 따라갑니다</div>

      <div className="mt-sh-acts">
        {!got && (!delArm
          ? <button onClick={() => setDelArm(true)}>삭제</button>
          : <button className="danger" onClick={() => onDelete(td.id)}>정말 삭제</button>)}
        <button className="primary" onClick={onClose}>닫기</button>
      </div>
    </ModalShell>
  )
}

/* ── 일정 상세 시트 ── */
function EventSheet({ ev, spaces, me, onClose, onPatch, onLink, onUnschedule, onDelete, onToggleDone }) {
  const [delArm, setDelArm] = useState(false)
  const [title, setTitle] = useState(ev.title)
  useEffect(() => setTitle(ev.title), [ev.title])
  const got = !!(ev.owner && ev.owner !== me)
  const ro = got && !ev.sharedEdit
  const saveTitle = () => {
    const t = title.trim()
    if (!t || t === ev.title) { setTitle(ev.title); return }
    onPatch(ev.id, { title: t })
  }
  return (
    <ModalShell onClose={onClose} className="mt-sheet">
      <div className="mt-sh-title">
        <button className={`mt-box${ev.done ? ' on' : ''}`} role="checkbox" aria-checked={ev.done}
          disabled={ro} onClick={() => !ro && onToggleDone(ev)}
          aria-label={ev.done ? '완료 해제' : '완료 처리'} />
        <input className={`mt-sh-name${ev.done ? ' done' : ''}`} value={title} readOnly={ro}
          aria-label="제목"
          onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.target.blur() }} />
      </div>
      <div className="mt-sh-date">
        {fmtK(ev.date)}{ev.time ? ` ${ev.time}` : ' 종일'}
        {got && <span className="mt-sh-got">{TEAM[ev.owner] || ev.owner} 공유{ro ? ', 보기만 가능' : ''}</span>}
      </div>

      {!ro && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">날짜와 시간</div>
          {/* 날짜를 상세에서 바로 고친다 — 예전엔 드래그가 유일한 길이라 폰에서는 못 옮겼다 */}
          <div className="mt-sh-row">
            <input type="date" value={ev.date} aria-label="날짜"
              onChange={e => e.target.value && onPatch(ev.id, { date: e.target.value })} />
          </div>
          <TimeRow time={ev.time} dur={ev.dur || 60}
            onTime={v => onPatch(ev.id, { time: v })}
            onDur={v => onPatch(ev.id, { dur: v })} />
          <button className="mt-unset" onClick={() => onUnschedule(ev.id)}>날짜 지정 없애기</button>
        </div>
      )}

      {!ro && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">스페이스</div>
          <SpacePick spaces={spaces} value={ev.spaceId} onPick={id => onPatch(ev.id, { spaceId: id })} />
        </div>
      )}

      <div className="mt-sh-block">
        <div className="mt-sh-lab">메모와 이미지</div>
        {ro
          ? <p className="mt-sh-ro">{ev.memo || '메모 없음'}</p>
          : <MemoBox value={ev.memo} onSave={v => onPatch(ev.id, { memo: v }, '메모 저장됨')} />}
        {!got && (
          <ImageAttach imgs={ev.images} canEdit storeKey={ev.id} api={MY_IMAGE_API}
            hint="나만 봅니다" onChange={imgs => onPatch(ev.id, { images: imgs })} />
        )}
      </div>

      {!got && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">팀 일정 연동</div>
          <label className="mt-chk">
            <input type="checkbox" checked={!!ev.linkedId} onChange={() => onLink(ev)} />
            <span>팀 캘린더에도 등록
              <small>체크하면 팀 전체가 이 일정을 보고, 당일 아침 팀즈 브리핑에도 실립니다</small></span>
          </label>
        </div>
      )}

      {!got && (
        <div className="mt-sh-block">
          <div className="mt-sh-lab">공유</div>
          <SharePick item={ev} me={me} onPatch={p => onPatch(ev.id, p)} />
        </div>
      )}

      <div className="mt-sh-acts">
        {!got && (!delArm
          ? <button onClick={() => setDelArm(true)}>삭제</button>
          : <button className="danger" onClick={() => onDelete(ev.id)}>정말 삭제</button>)}
        <button className="primary" onClick={onClose}>닫기</button>
      </div>
    </ModalShell>
  )
}

/* ── 단축키 도움말 ── */
const KEYS = [
  ['N', '할 일 입력으로'],
  ['/', '검색으로'],
  ['T', '오늘로'],
  ['M', '월간'],
  ['W', '주간'],
  ['← →', '이전과 다음'],
  ['Esc', '시트 닫기'],
  ['?', '이 도움말'],
]
function HelpSheet({ onClose }) {
  return (
    <ModalShell onClose={onClose} className="mt-sheet sm">
      <h3>단축키</h3>
      <p className="mt-sh-date">입력창에 글자를 치는 중에는 동작하지 않습니다</p>
      <div className="mt-keys">
        {KEYS.map(([k, d]) => <div key={k}><kbd>{k}</kbd><span>{d}</span></div>)}
      </div>
      <div className="mt-sh-block">
        <div className="mt-sh-lab">한 줄로 일정 만들기</div>
        <p className="mt-sh-ro">할 일 입력줄에 날짜를 함께 쓰면 할 일이 아니라 일정으로 등록됩니다
          <br />내일 15시 임원 보고 1시간
          <br />다음주 목요일 촬영 준비 #기획
          <br />8/20 오후 3시 정기 회의 90분</p>
      </div>
      <div className="mt-sh-acts"><button className="primary" onClick={onClose}>닫기</button></div>
    </ModalShell>
  )
}
