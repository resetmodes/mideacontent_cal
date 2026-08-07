/* 내 일정 ('26.8) — 개인 투두와 개인 캘린더를 한 화면에서.
   시안 승인 후 실구축 ('26.8.7, config.js MYTASK_EMAILS 게이트로 1차는 노규빈만).

   설계 요지
   - 개인 데이터는 my_* 테이블에만 저장한다 (media_events는 미러가 열리면 무로그인 공개라
     개인 메모를 넣으면 샌다). data/mytask-setup.sql 주석 참조
   - 팀 캘린더 연동은 체크박스 — 켜면 media_events에 kind='팀'으로 한 건 더 만들고
     그 id를 linkedId에 물려둔다. 끄면 그 행만 지운다 (라운지 linked_events와 같은 패턴)
   - 팀·매체·촬영 일정은 읽기 전용 배경으로만 얹는다 (겹쳐보기 칩)

   드래그 주의 ('26.8.7 시안에서 실측한 함정 3개)
   1. 드래그 끝에 브라우저가 click을 한 번 더 쏜다 → 억제하지 않으면 상세가 저절로 열린다
   2. 드래그가 텍스트 선택을 남기면 다음 드래그를 브라우저가 네이티브 드래그로 오인해
      pointercancel로 끊는다 → 칩에 user-select 해제 + pointerdown에서 preventDefault
   3. 같은 시간대 일정은 폭을 나눠야 한다 (겹쳐 쌓으면 아래 것이 클릭조차 안 됨) */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { HOLIDAYS, CLOSED_DAYS } from './data/holidays.js'
import { TEAM } from './data/team.js'
import { toISO, fromISO } from './lib/parse.js'
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
const H0 = 8, H1 = 20, SLOT = 46          // 주간 시간 격자 범위와 칸 높이
const SNAP = 30                            // 길이 조절 스냅 (분)
const SORT_KEY = 'mtTodoSort', FOLD_KEY = 'mtTodoFold'   // 정렬과 접기 상태 기억
const PALETTE = ['#0B4336', '#CFA3BD', '#7FA795', '#D9C6A5', '#9BA8C4', '#96637F']
const LAYERS = [
  { id: 'mine', name: '내 일정', color: '#0B4336' },
  { id: '팀', name: '팀 일정', color: '#A9B5AD' },
  { id: '매체', name: '매체', color: '#CFA3BD' },
  { id: '촬영', name: '촬영', color: '#E8730C' },
]

const hourOf = t => (t ? +t.slice(0, 2) : null)
const minOf = t => (t ? +t.slice(3, 5) : 0)
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fmtK = s => (s ? `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '')
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/* 시간 겹침 판정 — 종일끼리는 같은 날이면 겹친 것으로 본다 */
function overlaps(a, b) {
  if (!a.time || !b.time) return true
  const a0 = hourOf(a.time) * 60 + minOf(a.time), a1 = a0 + (a.dur || 60)
  const b0 = hourOf(b.time) * 60 + minOf(b.time), b1 = b0 + (b.dur || 60)
  return a0 < b1 && b0 < a1
}

/* 팀 일정을 내 일정과 같은 모양으로 — 겹쳐보기 배경용 */
const asBg = e => ({
  id: `bg-${e.id}`, title: e.title, date: e.date,
  time: null, dur: 0, kind: e.kind || '매체', bg: true,
})

export default function MyTaskPage() {
  const [spaces, setSpaces] = useState(null)
  const [todos, setTodos] = useState(null)
  const [mine, setMine] = useState(null)
  const [teamEvents, setTeamEvents] = useState([])
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState(null)

  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [spFilter, setSpFilter] = useState(null)
  const [layers, setLayers] = useState(() => new Set(['mine', '팀', '매체', '촬영']))
  const [openId, setOpenId] = useState(null)
  const [openTodoId, setOpenTodoId] = useState(null)
  const [draft, setDraft] = useState('')
  const [addSpaceId, setAddSpaceId] = useState(undefined)   // undefined면 필터를 따라간다

  const today = toISO(new Date())

  const load = useCallback(async () => {
    const [sp, td, ev] = await Promise.all([listSpaces(), listTodos(), listMyEvents()])
    setSpaces(sp); setTodos(td); setMine(ev)
    setErr(sp === null || td === null || ev === null)
    setReady(true)
    /* 겹쳐보기 배경 — 팀 캘린더는 읽기 전용으로만 얹는다 */
    listEvents().then(all => setTeamEvents(Array.isArray(all) ? all : [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  /* 배경 일정 (팀·매체·촬영) — kind 없는 것은 매체 */
  const bgEvents = useMemo(() => teamEvents
    .filter(e => (e.kind || '매체') !== '휴점')
    .map(e => asBg({ ...e, kind: e.kind || '매체' })), [teamEvents])

  const shownEvents = useMemo(() => {
    const out = []
    if (layers.has('mine')) out.push(...(mine || []).map(e => ({ ...e, kind: 'mine' })))
    for (const e of bgEvents) if (layers.has(e.kind)) out.push(e)
    return out
  }, [mine, bgEvents, layers])

  const byDay = useMemo(() => {
    const m = {}
    for (const e of shownEvents) (m[e.date] = m[e.date] || []).push(e)
    return m
  }, [shownEvents])

  /* 충돌 — 내 일정과 다른 종류가 시간까지 겹칠 때 */
  const clashes = useMemo(() => {
    const out = []
    for (const [d, list] of Object.entries(byDay)) {
      for (const e of list) {
        if (e.kind !== 'mine') continue
        const other = list.find(o => o.kind !== 'mine' && overlaps(e, o))
        if (other) out.push({ date: d, mine: e, other })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [byDay])
  const clashIds = useMemo(() => new Set(clashes.map(c => c.mine.id)), [clashes])

  const cells = useMemo(() => {
    const out = []
    if (view === 'week') {
      const s = addDays(cursor, -cursor.getDay())
      for (let i = 0; i < 7; i++) {
        const d = addDays(s, i)
        out.push({ iso: toISO(d), day: d.getDate(), dow: i, inM: d.getMonth() === cursor.getMonth() })
      }
      return out
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const d = new Date(first); d.setDate(1 - first.getDay())
    while (d <= last || d.getDay() !== 0) {
      out.push({ iso: toISO(d), day: d.getDate(), inM: d.getMonth() === cursor.getMonth() })
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [cursor, view])

  /* ── 액션 ── */
  const guard = async (fn, msg) => {
    try { await fn(); if (msg) toast(msg) }
    catch (e) { toast(e.message, { danger: true }) }
  }

  /* 할 일 추가 — 스페이스 지정이 세 갈래로 편하게 된다
     ① 입력줄 옆 스페이스 칩으로 고르기 ② 스페이스 필터가 켜져 있으면 그 스페이스로
     ③ 본문에 "#기획"처럼 쓰면 그 스페이스로 (없으면 즉석에서 만든다, 캠페인 #문법과 같은 결) */
  const addTodo = () => guard(async () => {
    let txt = draft.trim()
    if (!txt) return
    let spaceId = addSpaceId !== undefined ? addSpaceId : spFilter
    const tag = txt.match(/#([^\s#]+)/)
    if (tag) {
      const name = tag[1]
      let sp = (spaces || []).find(s => s.name === name)
      if (!sp) sp = await createSpace(name, PALETTE[(spaces?.length || 0) % PALETTE.length], spaces?.length || 0)
      if (!(spaces || []).some(s => s.id === sp.id)) setSpaces(v => [...(v || []), sp])
      spaceId = sp.id
      txt = txt.replace(tag[0], '').replace(/\s{2,}/g, ' ').trim()
    }
    if (!txt) return
    const t = await createTodo({ txt, spaceId })
    setTodos(v => [t, ...(v || [])])
    setDraft('')
  })
  const toggleTodo = t => guard(async () => {
    const n = await updateTodo(t.id, { done: !t.done })
    setTodos(v => v.map(x => (x.id === t.id ? n : x)))
  })
  const patchTodo = (id, patch, msg) => guard(async () => {
    const n = await updateTodo(id, patch)
    setTodos(v => v.map(x => (x.id === id ? n : x)))
  }, msg)
  const removeTodo = id => guard(async () => {
    await deleteTodo(id)
    setTodos(v => v.filter(x => x.id !== id))
  }, '할 일 삭제됨')

  /* 스페이스 추가는 인라인 입력 — 네이티브 prompt는 환경별 차단 이력이 있어 쓰지 않는다 */
  const addSpace = name => guard(async () => {
    const t = (name || '').trim()
    if (!t) return
    const s = await createSpace(t, PALETTE[(spaces?.length || 0) % PALETTE.length], spaces?.length || 0)
    setSpaces(v => [...(v || []), s])
  })
  const removeSpace = id => guard(async () => {
    await deleteSpace(id)
    setSpaces(v => v.filter(s => s.id !== id))
    if (spFilter === id) setSpFilter(null)
    setTodos(v => (v || []).map(t => (t.spaceId === id ? { ...t, spaceId: null } : t)))
  }, '스페이스 삭제됨')

  /* 투두를 캘린더에 놓기 — 투두는 일정이 되고 목록에서 사라진다 */
  const dropTodo = (todoId, date, hour) => guard(async () => {
    const t = todos.find(x => x.id === todoId)
    if (!t) return
    const ev = await createMyEvent({
      title: t.txt, date, time: hour != null ? `${String(hour).padStart(2, '0')}:00` : null,
      dur: 60, spaceId: t.spaceId, shared: t.shared,
      memo: t.memo, images: t.images,        // 메모와 첨부는 그대로 따라간다
    })
    await deleteTodo(t.id)
    setMine(v => [...(v || []), ev])
    setTodos(v => v.filter(x => x.id !== todoId))
  })

  const moveEvent = (id, date, hour) => guard(async () => {
    const e = mine.find(x => x.id === id)
    if (!e) return
    const patch = { date }
    if (hour != null) patch.time = `${String(hour).padStart(2, '0')}:00`
    else if (view === 'week') patch.time = null
    const n = await updateMyEvent(id, patch)
    setMine(v => v.map(x => (x.id === id ? n : x)))
    if (e.linkedId) await syncLinked(n, e.linkedId)
  })

  const resizeEvent = (id, dur) => guard(async () => {
    const n = await updateMyEvent(id, { dur })
    setMine(v => v.map(x => (x.id === id ? n : x)))
  })

  /* 날짜 지정 없애기 — 일정이 할 일로 되돌아간다 (팀 연동분은 같이 정리) */
  const unschedule = id => guard(async () => {
    const e = mine.find(x => x.id === id)
    if (!e) return
    if (e.linkedId) await deleteEvent(e.linkedId).catch(() => {})
    const t = await createTodo({ txt: e.title, spaceId: e.spaceId, shared: e.shared, memo: e.memo, images: e.images })
    await deleteMyEvent(id)
    setTodos(v => [t, ...(v || [])])
    setMine(v => v.filter(x => x.id !== id))
    setOpenId(null)
  }, '할 일로 되돌림')

  const removeEvent = id => guard(async () => {
    const e = mine.find(x => x.id === id)
    if (e?.linkedId) await deleteEvent(e.linkedId).catch(() => {})
    await deleteMyEvent(id)
    setMine(v => v.filter(x => x.id !== id))
    setOpenId(null)
  }, '일정 삭제됨')

  /* 팀 캘린더 연동분 갱신 — 날짜가 바뀌면 팀 쪽도 따라간다 */
  const syncLinked = async (ev, linkedId) => {
    const { updateEvent } = await import('./lib/store.js')
    await updateEvent(linkedId, { title: ev.title, date: ev.date, endDate: null, channel: '업무', kind: '팀' }).catch(() => {})
  }

  const patchEvent = (id, patch, msg) => guard(async () => {
    const n = await updateMyEvent(id, patch)
    setMine(v => v.map(x => (x.id === id ? n : x)))
  }, msg)

  const toggleLink = ev => guard(async () => {
    if (ev.linkedId) {
      await deleteEvent(ev.linkedId).catch(() => {})
      const n = await updateMyEvent(ev.id, { linkedId: null })
      setMine(v => v.map(x => (x.id === ev.id ? n : x)))
      toast('팀 캘린더에서 내림')
    } else {
      const created = await createEvent({
        title: ev.title, date: ev.date, endDate: null,
        channel: '업무', sub: null, campaign: null, kind: '팀',
        memo: '내 일정에서 연동',
      })
      const n = await updateMyEvent(ev.id, { linkedId: created.id })
      setMine(v => v.map(x => (x.id === ev.id ? n : x)))
      toast('팀 캘린더에 등록됨')
    }
  })

  const open = (mine || []).find(e => e.id === openId) || null
  const openTodo = (todos || []).find(t => t.id === openTodoId) || null

  /* ── 렌더 ── */
  if (!ready) return <div className="wrap mytask"><div className="mt-empty">불러오는 중</div></div>
  if (err) return (
    <div className="wrap mytask">
      <Head />
      <div className="mt-empty">내 일정 테이블이 아직 설정되지 않았습니다, data/mytask-setup.sql 실행 후 사용할 수 있습니다 (setup.md 15장)</div>
    </div>
  )

  const shownTodos = spFilter ? todos.filter(t => t.spaceId === spFilter) : todos
  const spOf = id => spaces.find(s => s.id === id) || null

  return (
    <div className="wrap mytask">
      <Head />
      <div className="mt-cols">
        <TodoPanel
          spaces={spaces} todos={shownTodos} allTodos={todos} spFilter={spFilter}
          draft={draft} setDraft={setDraft}
          addSpaceId={addSpaceId} setAddSpaceId={setAddSpaceId}
          onFilter={id => setSpFilter(spFilter === id ? null : id)}
          onAddSpace={addSpace} onRemoveSpace={removeSpace}
          onAdd={addTodo} onToggle={toggleTodo} onRemove={removeTodo}
        />
        <section className="mt-cal">
          <CalTop view={view} setView={setView} cursor={cursor} setCursor={setCursor} cells={cells} />
          <div className="mt-layers">
            {LAYERS.map(l => (
              <button key={l.id} className={`mt-ly${layers.has(l.id) ? ' on' : ''}`}
                onClick={() => setLayers(s => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })}>
                <i style={{ background: l.color }} />{l.name}
              </button>
            ))}
          </div>
          {/* 좁은 화면에서 격자만 가로로 스크롤 — 본문이 통째로 밀리지 않게 */}
          <div className="mt-gwrap">
            {view === 'month'
              ? <MonthView cells={cells} byDay={byDay} today={today} clashIds={clashIds} spOf={spOf} />
              : <WeekView cells={cells} byDay={byDay} today={today} clashIds={clashIds} spOf={spOf} />}
          </div>
          {clashes.length > 0 && (
            <div className="mt-clash">겹치는 일정 {clashes.length}건
              {clashes.slice(0, 3).map((c, i) => (
                <span key={i}>, {fmtK(c.date)} {c.mine.title}와 {c.other.title}</span>
              ))}
            </div>
          )}
        </section>
      </div>

      <DragLayer onDropTodo={dropTodo} onMoveEvent={moveEvent} onUnschedule={unschedule}
        onResize={resizeEvent} onOpen={setOpenId} onOpenTodo={setOpenTodoId} />

      {open && (
        <EventSheet ev={open} spaces={spaces} onClose={() => setOpenId(null)}
          onPatch={patchEvent} onLink={toggleLink} onUnschedule={unschedule} onDelete={removeEvent} />
      )}
      {openTodo && (
        <TodoSheet td={openTodo} spaces={spaces} onClose={() => setOpenTodoId(null)}
          onPatch={patchTodo} onToggle={toggleTodo}
          onDelete={id => { removeTodo(id); setOpenTodoId(null) }} />
      )}
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

/* ── 좌측 투두 패널 ── */
function TodoPanel({ spaces, todos, allTodos, spFilter, draft, setDraft, addSpaceId, setAddSpaceId, onFilter, onAddSpace, onRemoveSpace, onAdd, onToggle, onRemove }) {
  const left = (allTodos || []).filter(t => !t.done).length
  const [spDraft, setSpDraft] = useState(null)   // null이면 입력창 닫힘
  const [spArm, setSpArm] = useState(null)       // 삭제 2단계 확인 대상
  const submitSp = () => { onAddSpace(spDraft); setSpDraft(null) }
  const pick = addSpaceId !== undefined ? addSpaceId : spFilter

  /* 정렬 ('26.8.7 사용자 지시) — 스페이스별 묶어 보기가 기본, 접기 상태는 브라우저에 기억 */
  const [sortBy, setSortBy] = useState(() => localStorage.getItem(SORT_KEY) || 'space')
  const [fold, setFold] = useState(() => new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')))
  const setSort = v => { setSortBy(v); localStorage.setItem(SORT_KEY, v) }
  const toggleFold = key => setFold(f => {
    const n = new Set(f)
    n.has(key) ? n.delete(key) : n.add(key)
    localStorage.setItem(FOLD_KEY, JSON.stringify([...n]))
    return n
  })

  /* 미완료가 위, 완료는 아래 — 어느 정렬에서도 같다 */
  const byDone = (a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1)
  const groups = useMemo(() => {
    if (sortBy !== 'space') {
      const items = [...todos].sort((a, b) => byDone(a, b) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      return [{ key: 'all', head: false, items }]
    }
    const out = []
    for (const sp of spaces) {
      const items = todos.filter(t => t.spaceId === sp.id).sort(byDone)
      if (items.length) out.push({
        key: sp.id, head: true, name: sp.name, color: sp.color,
        items, left: items.filter(t => !t.done).length,
      })
    }
    const none = todos.filter(t => !t.spaceId).sort(byDone)
    /* 분류 없음은 항상 맨 뒤 — 정리되지 않은 것이 위로 올라오면 목록이 어수선해진다 */
    if (none.length) out.push({
      key: 'none', head: true, name: '분류 없음', color: null,
      items: none, left: none.filter(t => !t.done).length,
    })
    return out
  }, [todos, spaces, sortBy])

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
      <div className="mt-sp-row">
        {spaces.map(s => (
          <span key={s.id} className="mt-sp-wrap">
            <button className={`mt-sp${spFilter === s.id ? ' on' : ''}`}
              onClick={() => onFilter(s.id)}>
              <i style={{ background: s.color }} />{s.name}
            </button>
            {spArm === s.id
              ? <button className="mt-sp-del arm" onClick={() => { onRemoveSpace(s.id); setSpArm(null) }}>정말 삭제</button>
              : <button className="mt-sp-del" onClick={() => setSpArm(s.id)} title="스페이스 삭제">×</button>}
          </span>
        ))}
        {spDraft === null
          ? <button className="mt-sp add" onClick={() => setSpDraft('')}>＋ 스페이스</button>
          : (
            <span className="mt-sp-new">
              <input type="text" autoFocus value={spDraft} placeholder="스페이스 이름"
                onChange={e => setSpDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitSp()
                  if (e.key === 'Escape') setSpDraft(null)
                }} />
              <button onClick={submitSp}>추가</button>
              <button onClick={() => setSpDraft(null)}>취소</button>
            </span>
          )}
      </div>
      <div className="mt-add">
        <input type="text" value={draft} placeholder="할 일 입력 후 엔터, #이름으로 스페이스 지정"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAdd() }} />
        <button onClick={onAdd}>추가</button>
      </div>
      {/* 어디에 담을지 한 번에 보이게 — 안 고르면 지금 보고 있는 스페이스로 들어간다 */}
      {spaces.length > 0 && (
        <div className="mt-add-sp">
          <span>담을 곳</span>
          <button className={pick === null ? 'on' : ''} onClick={() => setAddSpaceId(null)}>분류 없음</button>
          {spaces.map(s => (
            <button key={s.id} className={pick === s.id ? 'on' : ''} onClick={() => setAddSpaceId(s.id)}>
              <i style={{ background: s.color }} />{s.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-todo-list">
        {todos.length === 0 && <div className="mt-empty sm">할 일이 없습니다</div>}
        {groups.map(g => (
          <section className="mt-group" key={g.key}>
            {g.head && (
              <button className={`mt-g-head${fold.has(g.key) ? ' folded' : ''}`} onClick={() => toggleFold(g.key)}>
                {g.color && <i style={{ background: g.color }} />}
                <b>{g.name}</b>
                <span>{g.left > 0 ? `남은 ${g.left}` : '완료'}</span>
                <em>{fold.has(g.key) ? '＋' : '−'}</em>
              </button>
            )}
            {!fold.has(g.key) && g.items.map(t => (
              <TodoRow key={t.id} t={t} spaces={spaces} showSpace={!g.head}
                onToggle={onToggle} onRemove={onRemove} />
            ))}
          </section>
        ))}
      </div>
      <div className="mt-tp-hint">여기에 놓으면 날짜 지정이 없어집니다</div>
      <div className="mt-tp-foot">눌러서 메모와 이미지를 남기고, 캘린더로 끌어다 놓으면 개인 일정이 됩니다</div>
    </aside>
  )
}

/* 할 일 한 줄 — 스페이스별로 묶어 보면 그룹 머리에 이미 스페이스가 있으므로 칩을 생략한다 */
function TodoRow({ t, spaces, showSpace, onToggle, onRemove }) {
  const s = spaces.find(x => x.id === t.spaceId)
  return (
    <div className={`mt-todo${t.done ? ' done' : ''}`} data-todo={t.id}>
      <span className={`mt-box${t.done ? ' on' : ''}`} onClick={() => onToggle(t)} />
      <div className="mt-t-body">
        <div className="mt-t-txt">{t.txt}</div>
        <div className="mt-t-meta">
          {showSpace && s && <span className="mt-t-sp"><i style={{ background: s.color }} />{s.name}</span>}
          {t.memo && <span className="mt-t-mark">메모</span>}
          {t.images.length > 0 && <span className="mt-t-mark">이미지 {t.images.length}</span>}
          {t.shared.length > 0 && <span className="mt-t-share">공유 {t.shared.length}명</span>}
        </div>
      </div>
      <button className="mt-t-x" onClick={() => onRemove(t.id)} title="삭제">×</button>
    </div>
  )
}

/* ── 상단 네비 ── */
function CalTop({ view, setView, cursor, setCursor, cells }) {
  const title = view === 'week'
    ? `${cells[0].iso.slice(0, 4)}.${cells[0].iso.slice(5, 7)} ${+cells[0].iso.slice(8, 10)}일 주`
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
      <div className="seg">
        <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>월간</button>
        <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>주간</button>
      </div>
    </div>
  )
}

/* ── 일정 칩 ── */
function Chip({ e, clash, slot, idx, n, spOf }) {
  const style = slot
    ? {
      height: Math.max(20, ((e.dur || 60) / 60) * SLOT - 4),
      left: `calc(${(idx * 100) / n}% + 3px)`,
      width: `calc(${100 / n}% - 6px)`,
      right: 'auto',
    }
    : undefined
  const sp = e.kind === 'mine' ? spOf(e.spaceId) : null
  return (
    <div className={`mt-ev ${e.kind === 'mine' ? 'mine' : 'bg ' + e.kind}${clash ? ' clash' : ''}`}
      data-ev={e.kind === 'mine' ? e.id : undefined} style={style}>
      {sp && <i className="mt-ev-sp" style={{ background: sp.color }} />}
      {e.time && !slot && <span className="mt-ev-t">{e.time}</span>}
      <span className="mt-ev-n">{e.title}</span>
      {e.linkedId && <span className="mt-ev-lk">팀</span>}
      {slot && e.kind === 'mine' && (
        <span className="mt-ev-grip" data-resize={e.id} title="끌어서 길이 조절" />
      )}
    </div>
  )
}

/* ── 월간 ── */
function MonthView({ cells, byDay, today, clashIds, spOf }) {
  return (
    <div className="mt-grid">
      {DOW.map(d => <div key={d} className="mt-dow">{d}</div>)}
      {cells.map(c => {
        const list = byDay[c.iso] || []
        const hol = HOLIDAYS[c.iso], closed = CLOSED_DAYS[c.iso]
        return (
          <div className={`mt-cell${c.inM ? '' : ' dim'}${closed ? ' closed' : hol ? ' hol' : ''}`}
            key={c.iso} data-date={c.iso}>
            <span className={`mt-dnum${c.iso === today ? ' today' : ''}`}>{c.day}</span>
            {hol && <span className="mt-tag">{hol}</span>}
            {closed && <span className="mt-tag closed">{closed}</span>}
            <div className="mt-evs">
              {list.map(e => <Chip key={e.id} e={e} clash={clashIds.has(e.id)} spOf={spOf} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 주간 시간 격자 ── */
function WeekView({ cells, byDay, today, clashIds, spOf }) {
  const hours = []
  for (let h = H0; h <= H1; h++) hours.push(h)
  return (
    <div className="mt-wgrid">
      <div className="mt-wg-corner" />
      {cells.map(c => (
        <div className="mt-wg-head" key={c.iso}>
          <span>{DOW[c.dow]}</span>
          <b className={c.iso === today ? 'today' : ''}>{c.day}</b>
        </div>
      ))}
      <div className="mt-wg-lab allday">종일</div>
      {cells.map(c => {
        const list = (byDay[c.iso] || []).filter(e => !e.time)
        const hol = HOLIDAYS[c.iso], closed = CLOSED_DAYS[c.iso]
        return (
          <div className={`mt-wg-cell allday${closed ? ' closed' : hol ? ' hol' : ''}`}
            key={c.iso} data-date={c.iso}>
            {list.map(e => <Chip key={e.id} e={e} clash={clashIds.has(e.id)} spOf={spOf} />)}
          </div>
        )
      })}
      {hours.map(h => (
        <React.Fragment key={h}>
          <div className="mt-wg-lab">{String(h).padStart(2, '0')}시</div>
          {cells.map(c => {
            const list = (byDay[c.iso] || []).filter(e => e.time && hourOf(e.time) === h)
            return (
              <div className="mt-wg-cell" key={c.iso + h} data-date={c.iso} data-hour={h}>
                {list.map((e, i) => (
                  <Chip key={e.id} e={e} clash={clashIds.has(e.id)} slot idx={i} n={list.length} spOf={spOf} />
                ))}
              </div>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  )
}

/* ── 드래그 계층 ('26.8) — 투두 이동, 일정 이동, 날짜 해제, 길이 조절을 한 곳에서.
   문서 위임이라 렌더 때마다 리스너를 다시 붙일 필요가 없다 ── */
function DragLayer({ onDropTodo, onMoveEvent, onUnschedule, onResize, onOpen, onOpenTodo }) {
  const suppress = useRef(false)

  useEffect(() => {
    const cellUnder = v => {
      const el = document.elementFromPoint(v.clientX, v.clientY)
      if (!el) return null
      const un = el.closest('[data-unschedule]')
      if (un) return { un: true, el: un }
      const c = el.closest('[data-date]')
      return c ? { un: false, el: c } : null
    }

    const down = pv => {
      if (pv.pointerType === 'touch' || pv.button !== 0) return

      /* 길이 조절 그립 — 칩 아래를 잡아 끌면 30분 단위로 붙는다 */
      const grip = pv.target.closest('[data-resize]')
      if (grip) {
        pv.preventDefault(); pv.stopPropagation()
        const chip = grip.closest('.mt-ev')
        const id = grip.dataset.resize
        const startY = pv.clientY
        const startH = chip.getBoundingClientRect().height
        let dur = null
        const mv = m => {
          const px = Math.max(SLOT / 2, startH + (m.clientY - startY))
          dur = Math.max(SNAP, Math.round(((px / SLOT) * 60) / SNAP) * SNAP)
          chip.style.height = `${(dur / 60) * SLOT - 4}px`
        }
        const off = () => {
          window.removeEventListener('pointermove', mv)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', off)
        }
        const up = () => {
          off()
          suppress.current = true
          setTimeout(() => {
            suppress.current = false
            if (dur) onResize(id, dur)
          }, 0)
        }
        window.addEventListener('pointermove', mv)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', off)
        return
      }

      const src = pv.target.closest('[data-todo], .mt-ev.mine')
      if (!src) return
      if (pv.target.classList.contains('mt-box') || pv.target.classList.contains('mt-t-x')) return
      /* 네이티브 드래그와 텍스트 선택 차단 — 안 하면 다음 드래그가 pointercancel로 끊긴다 */
      pv.preventDefault()

      const isTodo = src.hasAttribute('data-todo')
      const id = isTodo ? src.dataset.todo : src.dataset.ev
      const st = { active: false, x: pv.clientX, y: pv.clientY }
      let last = null
      const panel = document.querySelector('[data-unschedule]')
      const clear = () => {
        if (!last) return
        last.el.classList.remove('drop')
        panel?.classList.remove('unschedule')
      }
      const mv = m => {
        if (!st.active) {
          if (Math.hypot(m.clientX - st.x, m.clientY - st.y) < 6) return
          st.active = true
          src.classList.add('dragging')
        }
        m.preventDefault()
        clear()
        last = cellUnder(m)
        if (last) {
          if (last.un) panel?.classList.add('unschedule')
          else last.el.classList.add('drop')
        }
      }
      const off = () => {
        window.removeEventListener('pointermove', mv)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', off)
        src.classList.remove('dragging')
        clear()
      }
      const up = uv => {
        off()
        if (!st.active) return
        suppress.current = true
        const t = cellUnder(uv)
        /* 화면 갱신은 한 틱 뒤로 — pointerup 처리 중 DOM 교체는 제스처 상태를 흔든다 */
        setTimeout(() => {
          suppress.current = false
          if (!t) return
          if (t.un) { if (!isTodo) onUnschedule(id); return }
          const date = t.el.dataset.date
          const hour = t.el.dataset.hour ? +t.el.dataset.hour : null
          if (isTodo) onDropTodo(id, date, hour)
          else onMoveEvent(id, date, hour)
        }, 0)
      }
      window.addEventListener('pointermove', mv)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', off)
    }

    /* 드래그 끝에 브라우저가 click을 한 번 더 쏜다 — 억제하지 않으면 상세가 저절로 열린다 */
    const click = ev => {
      if (suppress.current) return
      const chip = ev.target.closest('.mt-ev.mine')
      if (chip?.dataset.ev) { onOpen(chip.dataset.ev); return }
      /* 할 일 행 클릭 = 상세. 체크박스와 삭제 버튼은 각자 동작이 있으므로 제외 */
      if (ev.target.classList.contains('mt-box') || ev.target.classList.contains('mt-t-x')) return
      const row = ev.target.closest('[data-todo]')
      if (row) onOpenTodo(row.dataset.todo)
    }

    document.addEventListener('pointerdown', down)
    document.addEventListener('click', click)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('click', click)
    }
  }, [onDropTodo, onMoveEvent, onUnschedule, onResize, onOpen, onOpenTodo])

  return null
}

/* ── 메모 입력 ── 타이핑마다 저장하면 요청이 폭주하므로 포커스를 떠날 때만 저장 */
function MemoBox({ value, onSave, rows = 4, placeholder = '메모를 남기면 상세에서 계속 보입니다' }) {
  const [v, setV] = useState(value || '')
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setV(value || ''); setDirty(false) }, [value])
  const commit = () => {
    if (!dirty || v === (value || '')) { setDirty(false); return }
    setDirty(false)
    onSave(v)
  }
  return (
    <div className="mt-memo">
      <textarea rows={rows} value={v} placeholder={placeholder}
        onChange={e => { setV(e.target.value); setDirty(true) }}
        onBlur={commit} />
      {dirty && <button className="mt-memo-save" onClick={commit}>메모 저장</button>}
    </div>
  )
}

/* ── 할 일 상세 시트 ('26.8) — 제목, 메모, 이미지, 스페이스, 공유를 한 화면에서 ── */
function TodoSheet({ td, spaces, onClose, onPatch, onToggle, onDelete }) {
  const [title, setTitle] = useState(td.txt)
  const [delArm, setDelArm] = useState(false)
  useEffect(() => setTitle(td.txt), [td.txt])
  const emails = Object.keys(TEAM).filter(e => e !== myEmail())
  const saveTitle = () => {
    const t = title.trim()
    if (!t || t === td.txt) { setTitle(td.txt); return }
    onPatch(td.id, { txt: t })
  }
  return (
    <ModalShell onClose={onClose} className="mt-sheet">
      <div className="mt-sh-title">
        <button className={`mt-box${td.done ? ' on' : ''}`} onClick={() => onToggle(td)}
          title={td.done ? '완료 해제' : '완료 처리'} />
        <input className={`mt-sh-name${td.done ? ' done' : ''}`} value={title}
          onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.target.blur() }} />
      </div>
      <div className="mt-sh-date">{td.done ? '완료' : '진행 중'}</div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">메모</div>
        <MemoBox value={td.memo} rows={5} onSave={v => onPatch(td.id, { memo: v }, '메모 저장됨')} />
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">이미지</div>
        <ImageAttach imgs={td.images} canEdit storeKey={td.id} api={MY_IMAGE_API}
          hint="나만 봅니다" onChange={imgs => onPatch(td.id, { images: imgs })} />
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">스페이스</div>
        <div className="mt-people">
          {spaces.map(s => (
            <button key={s.id} className={`mt-person${td.spaceId === s.id ? ' on' : ''}`}
              onClick={() => onPatch(td.id, { spaceId: td.spaceId === s.id ? null : s.id })}>{s.name}</button>
          ))}
          {spaces.length === 0 && <span className="mt-empty sm">스페이스를 만들면 여기서 고를 수 있습니다</span>}
        </div>
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">공유</div>
        <div className="mt-people">
          {emails.map(em => (
            <button key={em} className={`mt-person${td.shared.includes(em) ? ' on' : ''}`}
              onClick={() => onPatch(td.id, {
                shared: td.shared.includes(em) ? td.shared.filter(x => x !== em) : [...td.shared, em],
              })}>{TEAM[em]}</button>
          ))}
        </div>
        <label className="mt-chk">
          <input type="checkbox" checked={td.sharedEdit}
            onChange={e => onPatch(td.id, { sharedEdit: e.target.checked })} />
          <span>공유받은 사람도 수정 가능<small>해제하면 상대는 보기만 됩니다</small></span>
        </label>
      </div>

      <div className="mt-sh-note">캘린더로 끌어다 놓으면 날짜가 붙고, 메모와 이미지도 같이 따라갑니다</div>

      <div className="mt-sh-acts">
        {!delArm
          ? <button onClick={() => setDelArm(true)}>삭제</button>
          : <button className="danger" onClick={() => onDelete(td.id)}>정말 삭제</button>}
        <button className="primary" onClick={onClose}>닫기</button>
      </div>
    </ModalShell>
  )
}

/* ── 상세 시트 ── */
function EventSheet({ ev, spaces, onClose, onPatch, onLink, onUnschedule, onDelete }) {
  const [delArm, setDelArm] = useState(false)
  const allday = !ev.time
  const emails = Object.keys(TEAM).filter(e => e !== myEmail())
  return (
    <ModalShell onClose={onClose} className="mt-sheet">
      <h3>{ev.title}</h3>
      <div className="mt-sh-date">{fmtK(ev.date)}{ev.time ? ` ${ev.time}` : ' 종일'}</div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">시간</div>
        <div className="mt-sh-row">
          <input type="time" value={ev.time || ''} disabled={allday}
            onChange={e => onPatch(ev.id, { time: e.target.value || null })} />
          <select value={String(ev.dur || 60)} disabled={allday}
            onChange={e => onPatch(ev.id, { dur: +e.target.value })}>
            {[30, 60, 90, 120, 180, 240].map(m => (
              <option key={m} value={m}>{m < 60 ? `${m}분` : m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`}</option>
            ))}
          </select>
        </div>
        <label className="mt-chk">
          <input type="checkbox" checked={allday}
            onChange={e => onPatch(ev.id, { time: e.target.checked ? null : '10:00' })} />
          <span>종일<small>시간을 정하지 않으면 주간 화면 맨 위 종일 줄에 놓입니다</small></span>
        </label>
        <button className="mt-unset" onClick={() => onUnschedule(ev.id)}>날짜 지정 없애기</button>
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">스페이스</div>
        <div className="mt-people">
          {spaces.map(s => (
            <button key={s.id} className={`mt-person${ev.spaceId === s.id ? ' on' : ''}`}
              onClick={() => onPatch(ev.id, { spaceId: ev.spaceId === s.id ? null : s.id })}>{s.name}</button>
          ))}
        </div>
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">메모와 이미지</div>
        <MemoBox value={ev.memo} onSave={v => onPatch(ev.id, { memo: v }, '메모 저장됨')} />
        <ImageAttach imgs={ev.images} canEdit storeKey={ev.id} api={MY_IMAGE_API}
          hint="나만 봅니다" onChange={imgs => onPatch(ev.id, { images: imgs })} />
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">팀 일정 연동</div>
        <label className="mt-chk">
          <input type="checkbox" checked={!!ev.linkedId} onChange={() => onLink(ev)} />
          <span>팀 캘린더에도 등록<small>체크하면 팀 전체가 이 일정을 봅니다, 해제하면 다시 나만 봅니다</small></span>
        </label>
      </div>

      <div className="mt-sh-block">
        <div className="mt-sh-lab">공유</div>
        <div className="mt-people">
          {emails.map(em => (
            <button key={em} className={`mt-person${ev.shared.includes(em) ? ' on' : ''}`}
              onClick={() => onPatch(ev.id, {
                shared: ev.shared.includes(em) ? ev.shared.filter(x => x !== em) : [...ev.shared, em],
              })}>{TEAM[em]}</button>
          ))}
        </div>
        <label className="mt-chk">
          <input type="checkbox" checked={ev.sharedEdit}
            onChange={e => onPatch(ev.id, { sharedEdit: e.target.checked })} />
          <span>공유받은 사람도 수정 가능<small>해제하면 상대는 보기만 됩니다</small></span>
        </label>
      </div>

      <div className="mt-sh-acts">
        {!delArm
          ? <button onClick={() => setDelArm(true)}>삭제</button>
          : <button className="danger" onClick={() => onDelete(ev.id)}>정말 삭제</button>}
        <button className="primary" onClick={onClose}>닫기</button>
      </div>
    </ModalShell>
  )
}
