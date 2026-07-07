import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { CHANNELS, channelById } from './data/channels.js'
import { parseQuick, toISO, fromISO } from './lib/parse.js'
import { listEvents, createEvent, updateEvent, deleteEvent, renameCampaign, storageMode } from './lib/store.js'
import { getSession, onAuthChange } from './lib/auth.js'
import ChannelIcon from './ChannelIcon.jsx'
import ShareButton from './ShareButton.jsx'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const todayISO = () => toISO(new Date())

const fmtDot = iso => {
  const d = fromISO(iso)
  return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`
}
const fmtRange = e => e.endDate ? `${fmtDot(e.date)} ~ ${fmtDot(e.endDate)}` : fmtDot(e.date)

/* 월 그리드: 일요일 시작, 해당 월을 덮는 주 단위 셀 배열 */
function buildMonth(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const cells = []
  const d = new Date(start)
  while (d <= last || d.getDay() !== 0) {
    cells.push({ iso: toISO(d), day: d.getDate(), dow: d.getDay(), inMonth: d.getMonth() === cursor.getMonth() })
    d.setDate(d.getDate() + 1)
  }
  return cells
}

/* 기간 일정: 시작일에 본 표기, 종료일에만 흐린 종료 마커 (기간 중은 표기 없음) */
function indexByDay(events) {
  const map = {}
  const push = (iso, e) => ((map[iso] = map[iso] || []).push(e))
  for (const e of events) {
    push(e.date, e)
    if (e.endDate && e.endDate !== e.date) push(e.endDate, { ...e, isEnd: true })
  }
  return map
}

/* 유사 캠페인명 탐지 — 포함 관계 또는 앞 2글자 일치 */
const campSimilar = (campaigns, c) =>
  !c ? [] : campaigns.filter(x =>
    x !== c && (x.includes(c) || c.includes(x) || (c.length >= 2 && x.slice(0, 2) === c.slice(0, 2)))
  ).slice(0, 4)

function ChannelPickGrid({ value, onPick }) {
  return (
    <div className="ch-pick">
      {CHANNELS.map(c => (
        <button key={c.id} className={value === c.id ? 'on' : ''} onClick={() => onPick(c.id)}>
          <ChannelIcon id={c.id} />
          {c.label}
        </button>
      ))}
    </div>
  )
}

/* 등록 전 확인 팝업 — 매체 미인식 시 직접 선택, 유사 캠페인은 통일/신규 선택 */
function ConfirmSheet({ draft, sim, onConfirm, onCancel }) {
  const [channel, setChannel] = useState(draft.channel)
  const [campaign, setCampaign] = useState(draft.campaign)
  const needChannel = !draft.channel

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="md-ch">등록 전 확인</div>
        <div className="md-title sm">{draft.title}</div>
        {needChannel && (
          <div className="cs-section">
            <div className="cs-q">매체가 인식되지 않았습니다 — 어떤 매체인가요?</div>
            <ChannelPickGrid value={channel} onPick={setChannel} />
          </div>
        )}
        {sim.length > 0 && (
          <div className="cs-section">
            <div className="cs-q">비슷한 캠페인이 이미 있습니다 — 어느 쪽으로 등록할까요?</div>
            <div className="cs-camps">
              {sim.map(c => (
                <button key={c} className={campaign === c ? 'on' : ''} onClick={() => setCampaign(c)}>
                  #{c}<small>기존</small>
                </button>
              ))}
              <button className={campaign === draft.campaign ? 'on' : ''} onClick={() => setCampaign(draft.campaign)}>
                #{draft.campaign}<small>새로 만들기</small>
              </button>
            </div>
          </div>
        )}
        <div className="md-actions">
          <div className="md-spacer" />
          <button className="btn-ghost" onClick={onCancel}>취소</button>
          <button
            className="btn-solid" disabled={needChannel && !channel}
            onClick={() => onConfirm({ ...draft, channel: channel || '기타', campaign })}
          >등록</button>
        </div>
      </div>
    </div>
  )
}

function QuickAdd({ onCreate, owner, setOwner, campaigns }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  const [pending, setPending] = useState(null)
  const draft = useMemo(() => parseQuick(text), [text])

  /* "#"만 치면 기존 캠페인 전체를 선택지로 노출 */
  const bareHash = /#\s*$/.test(text)
  const similar = useMemo(
    () => (bareHash ? campaigns.slice(0, 8) : campSimilar(campaigns, draft?.campaign)),
    [draft, campaigns, bareHash]
  )

  const useCampaign = name => {
    setText(t => (/#\s*$/.test(t) ? t.replace(/#\s*$/, '#' + name) : t.replace(/#[^\s#]+/, '#' + name)))
  }

  const doCreate = async d => {
    await onCreate({ ...d, owner: owner || null })
    setText('')
    setPending(null)
  }

  const submit = () => {
    if (!draft) return
    if (!draft.date) { setErr('날짜를 인식하지 못함 — 12/20 또는 12/20~25 형식으로 입력'); return }
    if (!draft.title) { setErr('제목이 비어 있음 — 날짜 뒤에 내용을 입력'); return }
    setErr(null)
    const sim = campSimilar(campaigns, draft.campaign)
    if (!draft.channel || sim.length > 0) { setPending({ draft, sim }); return }
    doCreate(draft)
  }

  return (
    <div className="quick-add">
      <div className="qa-row">
        <input
          className="qa-input" type="text" autoComplete="off"
          placeholder="일정 빠른 입력 — 예: 12/20 크리스마스 인스타 릴스 현장 스케치 #크리스마스"
          value={text}
          onChange={e => { setText(e.target.value); setErr(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <input
          className="qa-owner" type="text" autoComplete="off" placeholder="작성자"
          value={owner}
          onChange={e => setOwner(e.target.value)}
        />
        <button className="qa-btn" onClick={submit}>등록</button>
      </div>
      {text.trim() && draft && (
        <div className="qa-status">
          <span className={'st ' + (draft.date ? 'got' : 'miss')}>
            {draft.date ? fmtRange(draft) : '날짜 미인식 — 12/20 형식으로'}
          </span>
          <span className={'st ' + (draft.channel ? 'got' : 'miss')}>
            {draft.channel
              ? <><ChannelIcon id={draft.channel} /> {channelById(draft.channel)?.label}{draft.sub ? ` · ${draft.sub}` : ''}</>
              : '매체 미인식 — 등록 시 선택 팝업'}
          </span>
          {draft.campaign && <span className="st camp">#{draft.campaign}</span>}
          {draft.title && <span className="st ttl">{draft.title}</span>}
        </div>
      )}
      {similar.length > 0 && (
        <div className="qa-suggest big">
          {bareHash ? '기존 캠페인 선택' : '비슷한 캠페인이 이미 있음 — 클릭하면 통일'}
          {similar.map(c => (
            <button key={c} onClick={() => useCampaign(c)}>#{c}</button>
          ))}
        </div>
      )}
      {err && <div className="qa-err">{err}</div>}
      {pending && (
        <ConfirmSheet
          draft={pending.draft} sim={pending.sim}
          onConfirm={doCreate} onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

function MonthGrid({ cursor, events, onSelect, onDayClick }) {
  const cells = useMemo(() => buildMonth(cursor), [cursor])
  const byDay = useMemo(() => indexByDay(events), [events])
  const today = todayISO()

  return (
    <div className={'cal-grid' + (onDayClick ? ' editable' : '')}>
      {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
      {cells.map(c => {
        const list = byDay[c.iso] || []
        return (
          <div
            key={c.iso}
            className={'cal-cell' + (c.inMonth ? '' : ' dim') + (c.iso === today ? ' today' : '')}
            onClick={onDayClick ? () => onDayClick(c.iso) : undefined}
            title={onDayClick ? '클릭해서 일정 등록' : undefined}
          >
            <div className={'cal-daynum' + (c.dow === 0 || c.dow === 6 ? ' wknd' : '')}>{c.day}</div>
            {list.slice(0, 4).map(e => (
              <button
                key={e.id + c.iso + (e.isEnd ? 'e' : '')} className={'cal-ev' + (e.isEnd ? ' end' : '')}
                onClick={ev => { ev.stopPropagation(); onSelect(e) }}
                title={`${channelById(e.channel)?.label || e.channel}${e.sub ? ` (${e.sub})` : ''} — ${e.title} (${fmtRange(e)})`}
              >
                <ChannelIcon id={e.channel} />
                <span className="ev-title">{e.title}{e.isEnd && ' · 종료'}</span>
              </button>
            ))}
            {list.length > 4 && <div className="cal-more">+{list.length - 4}</div>}
          </div>
        )
      })}
    </div>
  )
}

/* 캠페인 뷰 — 진행·예정 캠페인은 펼침, 종료 캠페인은 자동 보관(접힘) */
function CampaignView({ events, onSelect, onRename }) {
  const today = todayISO()
  const [renaming, setRenaming] = useState(null)   // 이름 변경 중인 캠페인
  const [renameVal, setRenameVal] = useState('')
  const groups = useMemo(() => {
    const map = {}
    for (const e of events) {
      if (!e.campaign) continue
      ;(map[e.campaign] = map[e.campaign] || []).push(e)
    }
    const entries = Object.entries(map).map(([name, list]) => {
      list.sort((a, b) => a.date.localeCompare(b.date))
      const lastEnd = list.reduce((m, e) => ((e.endDate || e.date) > m ? (e.endDate || e.date) : m), '')
      return { name, list, first: list[0].date, lastEnd, past: lastEnd < today }
    })
    return {
      active: entries.filter(g => !g.past).sort((a, b) => a.first.localeCompare(b.first)),
      past: entries.filter(g => g.past).sort((a, b) => b.lastEnd.localeCompare(a.lastEnd)),
    }
  }, [events, today])

  const noCampaign = events.filter(e => !e.campaign).length

  const startRename = name => { setRenaming(name); setRenameVal(name) }
  const confirmRename = async () => {
    const to = renameVal.trim().replace(/^#/, '')
    if (to && to !== renaming) await onRename(renaming, to)
    setRenaming(null)
  }

  const Block = ({ g }) => (
    <div className="camp-block">
      <div className="camp-head">
        {renaming === g.name ? (
          <span className="camp-rename-form">
            <input
              autoFocus value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmRename()
                if (e.key === 'Escape') setRenaming(null)
              }}
              placeholder="새 이름 (기존 캠페인명 입력 시 통합)"
            />
            <button className="btn-solid sm" onClick={confirmRename}>확인</button>
            <button className="btn-ghost sm" onClick={() => setRenaming(null)}>취소</button>
          </span>
        ) : (
          <>
            <span className="camp-name">#{g.name}</span>
            {onRename && (
              <button className="camp-rename" onClick={() => startRename(g.name)}>이름 변경·통합</button>
            )}
          </>
        )}
        <span className="camp-range">{fmtDot(g.first)} ~ {fmtDot(g.lastEnd)} · {g.list.length}건</span>
      </div>
      {g.list.map(e => (
        <button key={e.id} className="camp-ev" onClick={() => onSelect(e)}>
          <span className="ce-date">{fmtRange(e)}</span>
          <span className="ce-ch" title={channelById(e.channel)?.label || e.channel}>
            <ChannelIcon id={e.channel} />
            {e.sub || channelById(e.channel)?.label || e.channel}
          </span>
          <span className="ce-title">{e.title}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="camp-view">
      {groups.active.length === 0 && groups.past.length === 0 && (
        <div className="empty">캠페인 태그가 붙은 일정이 없음 — 빠른 입력에 #캠페인명 을 붙이면 여기에 묶임</div>
      )}
      {groups.active.map(g => <Block key={g.name} g={g} />)}
      {groups.past.length > 0 && (
        <details className="camp-past">
          <summary>지난 캠페인 {groups.past.length}건 — 자동 보관됨</summary>
          {groups.past.map(g => <Block key={g.name} g={g} />)}
        </details>
      )}
      {noCampaign > 0 && (
        <div className="camp-note">캠페인 미지정 일정 {noCampaign}건은 월간 뷰에서 확인</div>
      )}
    </div>
  )
}

/* isNew: 날짜 셀 클릭으로 열리는 신규 등록 모드 — 편집 폼으로 바로 시작, 저장 시 onCreate */
function EventModal({ event, campaigns, onClose, onSave, onDelete, onCreate, readOnly = false, isNew = false }) {
  const [editing, setEditing] = useState(isNew)
  const [confirmDel, setConfirmDel] = useState(false)
  const [f, setF] = useState({ ...event, sub: event.sub || '', campaign: event.campaign || '', owner: event.owner || '', memo: event.memo || '', endDate: event.endDate || '' })
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const subs = channelById(f.channel)?.subs || []
  const campSuggest = campaigns.filter(c =>
    c !== f.campaign && f.campaign && (c.includes(f.campaign) || f.campaign.includes(c))
  ).slice(0, 4)

  const save = async () => {
    if (!f.title.trim() || !f.date) return
    const fields = {
      title: f.title.trim(), date: f.date, endDate: f.endDate || null,
      channel: f.channel, sub: f.sub || null, campaign: f.campaign.trim() || null,
      owner: f.owner.trim() || null, memo: f.memo.trim() || null,
    }
    if (isNew) await onCreate(fields)
    else await onSave(event.id, fields)
    onClose()
  }

  /* 2단계 삭제 — 네이티브 confirm 대신 버튼 재클릭 확인 */
  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    await onDelete(event.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {!editing ? (
          <>
            <div className="md-ch"><ChannelIcon id={event.channel} /> {channelById(event.channel)?.label || event.channel}{event.sub ? ` · ${event.sub}` : ''}</div>
            <div className="md-title">{event.title}</div>
            <dl className="md-grid">
              <dt>일자</dt><dd>{fmtRange(event)}</dd>
              {event.campaign && <><dt>캠페인</dt><dd>#{event.campaign}</dd></>}
              {event.owner && <><dt>작성자</dt><dd>{event.owner}</dd></>}
              {event.memo && <><dt>메모</dt><dd>{event.memo}</dd></>}
            </dl>
            <div className="md-actions">
              {!readOnly && (
                <button className={'btn-ghost danger' + (confirmDel ? ' arm' : '')} onClick={del}>
                  {confirmDel ? '한 번 더 클릭하면 삭제' : '삭제'}
                </button>
              )}
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={onClose}>닫기</button>
              {!readOnly && <button className="btn-solid" onClick={() => setEditing(true)}>수정</button>}
            </div>
          </>
        ) : (
          <>
            <div className="md-ch">{isNew ? `일정 등록 — ${fmtDot(event.date)}` : '일정 수정'}</div>
            <div className="md-form">
              <label>제목
                <input value={f.title} onChange={e => set('title', e.target.value)} />
              </label>
              <div className="md-cols">
                <label>시작일
                  <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
                </label>
                <label>종료일 (선택)
                  <input type="date" value={f.endDate} onChange={e => set('endDate', e.target.value)} />
                </label>
              </div>
              <div className="md-cols">
                <label>매체
                  <select value={f.channel} onChange={e => { set('channel', e.target.value); set('sub', '') }}>
                    {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label>세부
                  <select value={f.sub} onChange={e => set('sub', e.target.value)} disabled={subs.length === 0}>
                    <option value="">{subs.length ? '선택' : '—'}</option>
                    {subs.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <div className="md-cols">
                <label>캠페인
                  <input list="campaign-list" value={f.campaign} onChange={e => set('campaign', e.target.value)} placeholder="예: 크리스마스" />
                  <datalist id="campaign-list">
                    {campaigns.map(c => <option key={c} value={c} />)}
                  </datalist>
                  {campSuggest.length > 0 && (
                    <span className="qa-suggest">
                      기존:
                      {campSuggest.map(c => (
                        <button key={c} type="button" onClick={() => set('campaign', c)}>#{c}</button>
                      ))}
                    </span>
                  )}
                </label>
                <label>작성자
                  <input value={f.owner} onChange={e => set('owner', e.target.value)} />
                </label>
              </div>
              <label>메모
                <textarea rows={3} value={f.memo} onChange={e => set('memo', e.target.value)} />
              </label>
            </div>
            <div className="md-actions">
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={() => (isNew ? onClose() : setEditing(false))}>취소</button>
              <button className="btn-solid" onClick={save}>{isNew ? '등록' : '저장'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CalendarApp({ session, readOnly = false }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [filter, setFilter] = useState('전체')
  const [view, setView] = useState('월간')
  const [selected, setSelected] = useState(null)
  const [dayDraft, setDayDraft] = useState(null)   // 날짜 셀 클릭 → 신규 등록 모달
  const [owner, setOwnerState] = useState(() => localStorage.getItem('media-cal-owner') || '')
  const setOwner = v => { setOwnerState(v); localStorage.setItem('media-cal-owner', v) }

  const refresh = useCallback(async () => {
    try {
      setEvents(await listEvents())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  const onCreate = async e => {
    try {
      const ev = await createEvent(e)
      setEvents(prev => [...prev, ev].sort((a, b) => a.date.localeCompare(b.date)))
    } catch (err) { setError(err.message) }
  }
  const onSave = async (id, patch) => {
    try {
      const ev = await updateEvent(id, patch)
      setEvents(prev => prev.map(x => (x.id === id ? ev : x)))
    } catch (err) { setError(err.message) }
  }
  const onDelete = async id => {
    try {
      await deleteEvent(id)
      setEvents(prev => prev.filter(x => x.id !== id))
    } catch (err) { setError(err.message) }
  }
  const onRename = async (from, to) => {
    try {
      await renameCampaign(from, to)
      await refresh()
    } catch (err) { setError(err.message) }
  }

  const filtered = filter === '전체' ? events : events.filter(e => e.channel === filter)
  const campaigns = useMemo(() => [...new Set(events.map(e => e.campaign).filter(Boolean))], [events])
  const monthLabel = `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="wrap cal-wrap">
      <header>
        <div className="eyebrow">Media Content Team · Schedule{readOnly && ' · Read Only'}</div>
        <h1>매체 일정 캘린더</h1>
        <div className="masthead-sub">
          {readOnly
            ? '미디어콘텐츠팀 매체 집행 일정 — 읽기 전용 공유 뷰 (등록·수정은 팀 내부에서만)'
            : '팀 운영 매체 집행 일정 — 빠른 입력 한 줄로 등록, 클릭해서 수정·삭제'}
        </div>
        {session && !readOnly && (
          <div className="session-bar">
            <ShareButton query="?view=mirror" label="읽기전용 공유 링크 복사" />
          </div>
        )}
      </header>

      {!readOnly && storageMode === 'local' && (
        <div className="store-note">
          현재 <b>이 브라우저에만</b> 저장 중 — 팀 공유를 켜려면 Supabase 연동 (data/supabase-setup.md)
        </div>
      )}
      {error && <div className="store-err">{error}</div>}

      {!readOnly && (
        <QuickAdd onCreate={onCreate} owner={owner} setOwner={setOwner} campaigns={campaigns} />
      )}

      <div className="cal-controls">
        <div className="seg">
          {['월간', '캠페인'].map(v => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        {view === '월간' && (
          <div className="cal-nav">
            <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>◀</button>
            <span className="cal-month">{monthLabel}</span>
            <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>▶</button>
            <button className="cal-today" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}>오늘</button>
          </div>
        )}
      </div>

      <div className="filters cal-filters">
        {['전체', ...CHANNELS.map(c => c.id)].map(id => (
          <button key={id} className={id === filter ? 'on' : ''} onClick={() => setFilter(id)}>
            {id !== '전체' && <ChannelIcon id={id} />}
            {id === '전체' ? '전체' : channelById(id).label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : view === '월간' ? (
        <MonthGrid
          cursor={cursor} events={filtered} onSelect={setSelected}
          onDayClick={readOnly ? null : setDayDraft}
        />
      ) : (
        <CampaignView events={filtered} onSelect={setSelected} onRename={readOnly ? null : onRename} />
      )}

      {selected && (
        <EventModal
          event={selected} campaigns={campaigns} readOnly={readOnly}
          onClose={() => setSelected(null)} onSave={onSave} onDelete={onDelete}
        />
      )}

      {dayDraft && !readOnly && (
        <EventModal
          isNew
          event={{ title: '', date: dayDraft, endDate: '', channel: '기타', sub: '', campaign: '', owner, memo: '' }}
          campaigns={campaigns}
          onClose={() => setDayDraft(null)} onCreate={onCreate}
        />
      )}

    </div>
  )
}

/* 로그인 게이트는 App.jsx(사이트 전체 락)에서 처리 — 여기 도달했다면 이미 인증된 상태.
   readOnly(?view=mirror)는 뷰어 계정용 UI — 쓰기 권한은 RLS의 team_writers 등록 여부가 결정
   (setup.md 4장) */
export default function CalendarPage({ readOnly = false }) {
  const [session, setSession] = useState(getSession())
  useEffect(() => onAuthChange(setSession), [])

  return <CalendarApp session={session} readOnly={readOnly} />
}
