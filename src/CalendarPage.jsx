import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { CHANNELS, channelById } from './data/channels.js'
import { parseQuick, toISO, fromISO, displayTitle } from './lib/parse.js'
import { listEvents, createEvent, updateEvent, deleteEvent, renameCampaign, listHistory, listDeleted, storageMode } from './lib/store.js'
import { getSession, onAuthChange } from './lib/auth.js'
import { resolveSpecMedia } from './lib/specLink.js'
import { findPerformance } from './lib/perf.js'
import { authorName } from './data/team.js'
import { HOLIDAYS } from './data/holidays.js'
import { MIRROR_URL } from './config.js'
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

/* 기간 일정: 시작일에 본 표기, 종료일에만 흐린 종료 마커 (기간 중은 표기 없음).
   withMid(와이드 열람 모드): 중간 날짜에도 흐린 연속 표시 — 그 주에 걸린 일정이 보이게 */
function indexByDay(events, withMid = false) {
  const map = {}
  const push = (iso, e) => ((map[iso] = map[iso] || []).push(e))
  for (const e of events) {
    push(e.date, e)
    if (e.endDate && e.endDate !== e.date) {
      if (withMid) {
        const d = fromISO(e.date)
        const end = fromISO(e.endDate)
        for (d.setDate(d.getDate() + 1); d < end; d.setDate(d.getDate() + 1)) {
          push(toISO(d), { ...e, isMid: true })
        }
      }
      push(e.endDate, { ...e, isEnd: true })
    }
  }
  return map
}

/* 메모 렌더 — http/https 링크는 클릭 가능하게 (그 외 텍스트는 그대로, 줄바꿈 유지) */
function Memo({ text }) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  )
}

/* 검색어 하이라이트 */
function hlText(text, q) {
  const s = (q || '').trim()
  if (!s || !text) return text || ''
  const i = text.toLowerCase().indexOf(s.toLowerCase())
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + s.length)}</mark>{text.slice(i + s.length)}</>
}

/* 전체 일정 검색 대상 — 제목·캠페인·메모·작성자·매체 */
const evHaystack = e => [
  e.title, e.campaign || '', e.memo || '', e.owner || '',
  channelById(e.channel)?.label || e.channel, e.sub || '',
].join(' ').toLowerCase()

function SearchResults({ events, query, onSelect }) {
  const q = query.trim().toLowerCase()
  const results = useMemo(
    () => events.filter(e => evHaystack(e).includes(q)).sort((a, b) => b.date.localeCompare(a.date)),
    [events, q]
  )
  if (results.length === 0)
    return <div className="empty">‘{query}’에 해당하는 일정이 없음</div>
  return (
    <div className="srch-view">
      <div className="srch-count">{results.length}건</div>
      {results.map(e => (
        <button key={e.id} className="srch-ev" onClick={() => onSelect(e)}>
          <span className="ce-date">{fmtRange(e)}</span>
          <span className="ce-ch" title={channelById(e.channel)?.label || e.channel}>
            <ChannelIcon id={e.channel} />
            {e.sub || channelById(e.channel)?.label || e.channel}
          </span>
          <span className="ce-title">
            {hlText(displayTitle(e.title, e.channel), query)}
            {e.campaign && <em>#{e.campaign}</em>}
          </span>
        </button>
      ))}
    </div>
  )
}

/* 유사 캠페인명 탐지 — 포함 관계 또는 앞 2글자 일치 */
const campSimilar = (campaigns, c) =>
  !c ? [] : campaigns.filter(x =>
    x !== c && (x.includes(c) || c.includes(x) || (c.length >= 2 && x.slice(0, 2) === c.slice(0, 2)))
  ).slice(0, 4)

/* 촬영일정 허용 매체 — 유튜브·인스타만 ('26.7 확정) */
const SHOOT_CHANNELS = new Set(['인스타', '유튜브'])

/* ── 변경 이력 ('26.7) — DB 트리거 기록 조회.
   fmtTs·ACTION_KO·histDiff는 알림센터(NotifyCenter.jsx)도 사용 — export */
export const fmtTs = iso => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const ACTION_KO = { INSERT: '등록', UPDATE: '수정', DELETE: '삭제' }
const HIST_FIELDS = [
  ['title', '제목'], ['date', '시작일'], ['end_date', '종료일'], ['channel', '매체'],
  ['sub', '세부'], ['campaign', '캠페인'], ['owner', '작성자'], ['memo', '메모'], ['kind', '구분'],
]

/* 연속 스냅샷 비교 — 바뀐 필드만 "제목: A → B" 형태로 */
export function histDiff(cur, prev) {
  if (!prev) return []
  const out = []
  for (const [k, label] of HIST_FIELDS) {
    const a = prev[k] ?? '', b = cur[k] ?? ''
    if (a !== b) out.push(`${label}: ${a || '—'} → ${b || '—'}`)
  }
  return out
}

function HistoryView({ eventId }) {
  const [state, setState] = useState('closed')   // closed | loading | error | rows[]
  const open = async () => {
    setState('loading')
    try { setState(await listHistory(eventId)) }
    catch { setState('error') }
  }
  if (state === 'closed')
    return <button className="md-hist-link" onClick={open}>변경 이력</button>
  if (state === 'loading') return <div className="md-hist-note">이력 불러오는 중…</div>
  if (state === 'error')
    return <div className="md-hist-note">이력 조회 실패 — 이력 테이블 미설정일 수 있음 (supabase-setup.md 6장)</div>
  if (state.length === 0) return <div className="md-hist-note">기록된 이력 없음 (이력 기능 활성화 이후 변경분부터 기록)</div>
  return (
    <div className="md-hist">
      {state.map((h, i) => {
        const diffs = h.action === 'UPDATE' ? histDiff(h.data || {}, state[i + 1]?.data) : []
        return (
          <div key={h.id} className="md-hist-row">
            <span className="mh-when">{fmtTs(h.changed_at)}</span>
            <span className="mh-who">{h.actor ? authorName(h.actor) : '—'}</span>
            <span className="mh-act">{ACTION_KO[h.action] || h.action}</span>
            {diffs.length > 0 && <span className="mh-diff">{diffs.join(' · ')}</span>}
          </div>
        )
      })}
    </div>
  )
}

/* 최근 30일 삭제 기록 — 캘린더 하단 접힘 목록 ("누가 지웠어?" 대비) */
function DeletedLog({ shoot }) {
  const [rows, setRows] = useState(null)   // null=미조회
  const [failed, setFailed] = useState(false)
  const load = async e => {
    if (!e.target.open || rows) return
    try {
      const all = await listDeleted(30)
      setRows(all.filter(r => (shoot ? r.data?.kind === '촬영' : r.data?.kind !== '촬영')))
    } catch { setFailed(true) }
  }
  return (
    <details className="del-log" onToggle={load}>
      <summary>최근 30일 삭제 기록</summary>
      {failed && <div className="md-hist-note">조회 실패 — 이력 테이블 미설정일 수 있음 (supabase-setup.md 6장)</div>}
      {rows && rows.length === 0 && <div className="md-hist-note">최근 30일 내 삭제된 일정 없음</div>}
      {rows && rows.map(r => (
        <div key={r.id} className="md-hist-row">
          <span className="mh-when">{fmtTs(r.changed_at)}</span>
          <span className="mh-who">{r.actor ? authorName(r.actor) : '—'}</span>
          <span className="mh-act">삭제</span>
          <span className="mh-diff">{r.data?.date} {displayTitle(r.data?.title, r.data?.channel)}{r.data?.channel ? ` (${r.data.channel})` : ''}</span>
        </div>
      ))}
    </details>
  )
}

function ChannelPickGrid({ value, onPick, shootOnly = false }) {
  const list = shootOnly ? CHANNELS.filter(c => SHOOT_CHANNELS.has(c.id)) : CHANNELS
  return (
    <div className="ch-pick">
      {list.map(c => (
        <button key={c.id} className={value === c.id ? 'on' : ''} onClick={() => onPick(c.id)}>
          <ChannelIcon id={c.id} />
          {c.label}
        </button>
      ))}
    </div>
  )
}

/* 등록 전 확인 팝업 — 매체 미인식 시 직접 선택, 유사 캠페인은 통일/신규 선택 */
function ConfirmSheet({ draft, sim, onConfirm, onCancel, shootOnly = false }) {
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
            <div className="cs-q">
              매체가 인식되지 않았습니다 — 어떤 매체인가요?{shootOnly && ' (촬영일정은 인스타·유튜브만)'}
            </div>
            <ChannelPickGrid value={channel} onPick={setChannel} shootOnly={shootOnly} />
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

function QuickAdd({ onCreate, campaigns, shoot = false }) {
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

  /* 다중 매체(인스타+유튜브 …)면 매체 수만큼, 촬영/업로드 병기면 건별 2개 등록.
     촬영 탭에서의 단일 날짜 입력 = 촬영일. 작성자는 CalendarApp에서 자동 기록 */
  const doCreate = async d => {
    const { channels, shootDate, ...base } = d
    const chans = channels?.length ? channels : [{ channel: base.channel, sub: base.sub }]
    for (const c of chans) {
      const ev = { ...base, channel: c.channel, sub: c.sub }
      if (shootDate) await onCreate({ ...ev, date: shootDate, endDate: null, kind: '촬영' })
      if (ev.date) await onCreate({ ...ev, kind: shoot && !shootDate ? '촬영' : null })
    }
    setText('')
    setPending(null)
  }

  const submit = () => {
    if (!draft) return
    if (!draft.date && !draft.shootDate) { setErr('날짜를 인식하지 못함 — 12/20 형식, 촬영·업로드 병기는 "7/10 촬영 7/15 업로드"'); return }
    if (!draft.title) { setErr('제목이 비어 있음 — 날짜 뒤에 내용을 입력'); return }
    /* 촬영 건 포함 시 매체 제한 — 유튜브·인스타만 */
    const hasShoot = shoot || !!draft.shootDate
    const chans = draft.channels?.length ? draft.channels : (draft.channel ? [{ channel: draft.channel }] : [])
    if (hasShoot && chans.length > 0 && chans.some(c => !SHOOT_CHANNELS.has(c.channel))) {
      setErr('촬영일정은 인스타·유튜브만 등록 가능'); return
    }
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
          placeholder={shoot
            ? '촬영일정 빠른 입력 — 예: 7/10 촬영 7/15 업로드 여름 룩북 인스타 (업로드 건은 매체 캘린더로)'
            : '일정 빠른 입력 — 예: 12/20 크리스마스 인스타 릴스 #크리스마스 (인스타+유튜브 = 동시 등록)'}
          value={text}
          onChange={e => { setText(e.target.value); setErr(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
        />
        <button className="qa-btn" onClick={submit}>등록</button>
      </div>
      {text.trim() && draft && (
        <div className="qa-status">
          {draft.shootDate && <span className="st got">촬영 {fmtDot(draft.shootDate)}</span>}
          {(draft.date || !draft.shootDate) && (
            <span className={'st ' + (draft.date ? 'got' : 'miss')}>
              {draft.date
                ? (draft.shootDate ? '업로드 ' : '') + fmtRange(draft)
                : '날짜 미인식 — 12/20 형식으로'}
            </span>
          )}
          {draft.channels?.length > 1 ? (
            <>
              {draft.channels.map((c, i) => (
                <span key={i} className="st got">
                  <ChannelIcon id={c.channel} /> {channelById(c.channel)?.label}{c.sub ? ` · ${c.sub}` : ''}
                </span>
              ))}
              <span className="st camp">{draft.channels.length}건 동시 등록</span>
            </>
          ) : (
            <span className={'st ' + (draft.channel ? 'got' : 'miss')}>
              {draft.channel
                ? <><ChannelIcon id={draft.channel} /> {channelById(draft.channel)?.label}{draft.sub ? ` · ${draft.sub}` : ''}</>
                : '매체 미인식 — 등록 시 선택 팝업'}
            </span>
          )}
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
          shootOnly={shoot || !!pending.draft.shootDate}
          onConfirm={doCreate} onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

function MonthGrid({ cursor, events, onSelect, onDayClick, wide = false }) {
  const cells = useMemo(() => buildMonth(cursor), [cursor])
  const byDay = useMemo(() => indexByDay(events, wide), [events, wide])
  const today = todayISO()
  const MAX = wide ? 8 : 4   // 와이드 열람 모드는 셀당 표시 건수 확대

  return (
    <div className={'cal-grid' + (onDayClick ? ' editable' : '')}>
      {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
      {cells.map(c => {
        const list = byDay[c.iso] || []
        const hol = HOLIDAYS[c.iso]
        return (
          <div
            key={c.iso}
            className={'cal-cell' + (c.inMonth ? '' : ' dim') + (c.iso === today ? ' today' : '')}
            onClick={onDayClick ? () => onDayClick(c.iso) : undefined}
            title={onDayClick ? '클릭해서 일정 등록' : undefined}
          >
            <div className="cal-dayrow">
              <div className={'cal-daynum' + (c.dow === 0 || c.dow === 6 || hol ? ' wknd' : '')}>{c.day}</div>
              {hol && <span className="cal-hol">{hol}</span>}
            </div>
            {list.slice(0, MAX).map(e => (
              <button
                key={e.id + c.iso + (e.isEnd ? 'e' : e.isMid ? 'm' : '')}
                className={'cal-ev' + (e.isEnd ? ' end' : '') + (e.isMid ? ' mid' : '')}
                onClick={ev => { ev.stopPropagation(); onSelect(e) }}
                title={`${channelById(e.channel)?.label || e.channel}${e.sub ? ` (${e.sub})` : ''} — ${displayTitle(e.title, e.channel)} (${fmtRange(e)})`}
              >
                <ChannelIcon id={e.channel} />
                {wide && <span className="ev-ch">{channelById(e.channel)?.label || e.channel}</span>}
                <span className="ev-title">{displayTitle(e.title, e.channel)}{e.isEnd && ' · 종료'}</span>
              </button>
            ))}
            {list.length > MAX && <div className="cal-more">+{list.length - MAX}</div>}
          </div>
        )
      })}
    </div>
  )
}

/* 캠페인 블록 — CampaignView 밖에 정의 (렌더마다 컴포넌트가 재생성되면
   이름 변경 입력이 한 글자마다 재마운트되어 커서가 튀는 문제 방지) */
function CampBlock({ g, renaming, renameVal, setRenameVal, onConfirmRename, onStartRename, onCancelRename, canRename, onSelect }) {
  return (
    <div className="camp-block">
      <div className="camp-head">
        {renaming === g.name ? (
          <span className="camp-rename-form">
            <input
              autoFocus value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) onConfirmRename()
                if (e.key === 'Escape') onCancelRename()
              }}
              placeholder="새 이름 (기존 캠페인명 입력 시 통합)"
            />
            <button className="btn-solid sm" onClick={onConfirmRename}>확인</button>
            <button className="btn-ghost sm" onClick={onCancelRename}>취소</button>
          </span>
        ) : (
          <>
            <span className="camp-name">#{g.name}</span>
            {canRename && (
              <button className="camp-rename" onClick={() => onStartRename(g.name)}>이름 변경·통합</button>
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
          <span className="ce-title">{displayTitle(e.title, e.channel)}</span>
        </button>
      ))}
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

  const blockProps = {
    renaming, renameVal, setRenameVal,
    onConfirmRename: confirmRename,
    onStartRename: startRename,
    onCancelRename: () => setRenaming(null),
    canRename: !!onRename,
    onSelect,
  }

  return (
    <div className="camp-view">
      {groups.active.length === 0 && groups.past.length === 0 && (
        <div className="empty">캠페인 태그가 붙은 일정이 없음 — 빠른 입력에 #캠페인명 을 붙이면 여기에 묶임</div>
      )}
      {groups.active.map(g => <CampBlock key={g.name} g={g} {...blockProps} />)}
      {groups.past.length > 0 && (
        <details className="camp-past">
          <summary>지난 캠페인 {groups.past.length}건 — 자동 보관됨</summary>
          {groups.past.map(g => <CampBlock key={g.name} g={g} {...blockProps} />)}
        </details>
      )}
      {noCampaign > 0 && (
        <div className="camp-note">캠페인 미지정 일정 {noCampaign}건은 월간 뷰에서 확인</div>
      )}
    </div>
  )
}

/* isNew: 날짜 셀 클릭으로 열리는 신규 등록 모드 — 편집 폼으로 바로 시작, 저장 시 onCreate.
   상단 "한 줄 자동 작성" 입력에 치면 파싱해서 아래 폼을 자동으로 채움 */
function EventModal({ event, campaigns, onClose, onSave, onDelete, onCreate, readOnly = false, isNew = false, onOpenSpec }) {
  const [editing, setEditing] = useState(isNew)
  const [confirmDel, setConfirmDel] = useState(false)
  const [quick, setQuick] = useState('')
  const specName = resolveSpecMedia(event.channel, event.sub)
  const isShoot = event.kind === '촬영'
  /* 촬영 일정은 게시 시점이 아니라 실적 매칭 제외 */
  const perf = useMemo(() => (isNew || isShoot ? [] : findPerformance(event)), [event, isNew, isShoot])
  /* 실적 확정 — 담당자가 후보 중 하나를 선택하면 그것만 남음 (perfUrl 필드) */
  const pinned = event.perfUrl
    ? perf.find(p => p.url === event.perfUrl)
      || { url: event.perfUrl, title: event.perfUrl.replace(/^https?:\/\//, ''), meta: '확정된 게시물' }
    : null
  const setPerf = async url => {
    await onSave(event.id, {
      title: event.title, date: event.date, endDate: event.endDate || null,
      channel: event.channel, sub: event.sub || null, campaign: event.campaign || null,
      owner: event.owner || null, memo: event.memo || null, kind: event.kind || null,
      perfUrl: url,   // null이면 확정 해제 → 후보 다시 표시
    })
  }
  const [f, setF] = useState({ ...event, sub: event.sub || '', campaign: event.campaign || '', owner: event.owner || '', memo: event.memo || '', endDate: event.endDate || '' })
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  /* 한 줄 입력 → 폼 자동 채움. 날짜를 안 쓰면 클릭한 날짜 유지 */
  const applyQuick = v => {
    setQuick(v)
    const d = parseQuick(v)
    if (!d) return
    setF(prev => ({
      ...prev,
      title: d.title || prev.title,
      channel: d.channel || prev.channel,
      sub: d.sub || (d.channel ? '' : prev.sub),
      campaign: d.campaign ?? prev.campaign,
      date: d.date || prev.date,
      endDate: d.endDate || prev.endDate,
    }))
  }
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
      kind: f.kind || null,
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
            <div className="md-ch"><ChannelIcon id={event.channel} /> {channelById(event.channel)?.label || event.channel}{event.sub ? ` · ${event.sub}` : ''}{isShoot ? ' · 촬영' : ''}</div>
            <div className="md-title">{displayTitle(event.title, event.channel)}</div>
            <dl className="md-grid">
              <dt>일자</dt><dd>{fmtRange(event)}</dd>
              {event.campaign && <><dt>캠페인</dt><dd>#{event.campaign}</dd></>}
              {event.owner && <><dt>작성자</dt><dd>{event.owner}</dd></>}
              {event.memo && <><dt>메모</dt><dd className="md-memo"><Memo text={event.memo} /></dd></>}
            </dl>
            {pinned ? (
              <div className="md-perf">
                <div className="md-perf-title">
                  집행 실적 <small>담당자 확정</small>
                  {!readOnly && (
                    <button className="pf-unpin" onClick={() => setPerf(null)}>선택 해제</button>
                  )}
                </div>
                <div className="md-perf-item">
                  <a className="md-perf-row" href={pinned.url} target="_blank" rel="noopener noreferrer">
                    <span className="pf-title">{pinned.title}</span>
                    <span className="pf-meta">{pinned.meta} <span className="pf-open">↗</span></span>
                  </a>
                </div>
              </div>
            ) : perf.length > 0 && (
              <div className="md-perf">
                <div className="md-perf-title">
                  집행 실적 후보 <small>{readOnly ? 'SNS 수집분 근사 매칭' : '실제 콘텐츠를 선택하면 그것만 확정으로 남음'}</small>
                </div>
                {perf.map(p => (
                  <div key={p.url} className="md-perf-item">
                    <a className="md-perf-row" href={p.url} target="_blank" rel="noopener noreferrer">
                      <span className="pf-title">{p.title}</span>
                      <span className="pf-meta">{p.meta} <span className="pf-open">↗</span></span>
                    </a>
                    {!readOnly && (
                      <button className="pf-pin" onClick={() => setPerf(p.url)}>선택</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {specName && onOpenSpec && (
              <button className="md-spec-link" onClick={() => { onOpenSpec(specName); onClose() }}>
                이 매체 규격·납기 보기 →
              </button>
            )}
            {storageMode === 'supabase' && <HistoryView eventId={event.id} />}
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
            <div className="md-ch">{isNew ? `${isShoot ? '촬영 ' : ''}일정 등록 — ${fmtDot(f.date || event.date)}` : `${isShoot ? '촬영 ' : ''}일정 수정`}</div>
            {isNew && (
              <input
                className="qa-input md-quick" type="text" autoComplete="off" autoFocus
                placeholder="한 줄 자동 작성 — 예: 본사 인스타 릴스 촬영 #여름 (아래 폼이 자동으로 채워짐)"
                value={quick}
                onChange={e => applyQuick(e.target.value)}
              />
            )}
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
                    {(isShoot ? CHANNELS.filter(c => SHOOT_CHANNELS.has(c.id)) : CHANNELS)
                      .map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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
              <label>메모 · 참고 링크
                <textarea rows={3} value={f.memo} onChange={e => set('memo', e.target.value)}
                  placeholder="추가로 알아야 할 설명이나 참고 링크(http…) — 링크는 상세에서 클릭 가능" />
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

function CalendarApp({ session, readOnly = false, onOpenSpec, shoot = false }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [filter, setFilter] = useState('전체')
  const [view, setView] = useState('월간')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [dayDraft, setDayDraft] = useState(null)   // 날짜 셀 클릭 → 신규 등록 모달
  const me = authorName(session?.email)            // 작성자 = 로그인 계정 (자동)

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

  /* 읽기 전용(미러) 전용 자동 새로고침 — 스탠바이미처럼 상시 켜둔 화면은 focus
     이벤트가 없어 갱신이 안 되므로 10분 주기 폴링. 탭이 숨겨져 있으면 건너뜀.
     팀용 화면은 폴링 없음 (기존 focus 갱신 유지) */
  useEffect(() => {
    if (!readOnly) return
    const t = setInterval(() => { if (!document.hidden) refresh() }, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [readOnly, refresh])

  const onCreate = async e => {
    try {
      const ev = await createEvent({ ...e, owner: e.owner || me || null })
      setEvents(prev => [...prev, ev].sort((a, b) => a.date.localeCompare(b.date)))
    } catch (err) { setError(err.message) }
  }
  const onSave = async (id, patch) => {
    try {
      const ev = await updateEvent(id, patch)
      setEvents(prev => prev.map(x => (x.id === id ? ev : x)))
      setSelected(sel => (sel?.id === id ? ev : sel))   // 열린 모달도 즉시 갱신 (실적 확정 등)
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

  /* 탭별 대상: 촬영일정 탭 = kind '촬영'만, 매체 캘린더 = 그 외 전부 */
  const kindEvents = useMemo(
    () => events.filter(e => (shoot ? e.kind === '촬영' : e.kind !== '촬영')),
    [events, shoot]
  )
  const chipChannels = shoot ? CHANNELS.filter(c => SHOOT_CHANNELS.has(c.id)) : CHANNELS
  const filtered = filter === '전체' ? kindEvents : kindEvents.filter(e => e.channel === filter)
  const campaigns = useMemo(() => [...new Set(events.map(e => e.campaign).filter(Boolean))], [events])
  const monthLabel = `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`
  const searching = search.trim().length > 0

  return (
    <div className={'wrap cal-wrap' + (readOnly ? ' wide' : '')}>
      <header>
        <div className="eyebrow">Media Content Team · {shoot ? 'Shooting' : 'Schedule'}{readOnly && ' · Read Only'}</div>
        <h1>{shoot ? '촬영 일정 캘린더' : '매체 일정 캘린더'}</h1>
        <div className="masthead-sub">
          {shoot
            ? '유튜브·인스타 촬영 스케줄 — "7/10 촬영 7/15 업로드"로 병기하면 업로드 건은 매체 캘린더에 자동 등록'
            : readOnly
              ? '미디어콘텐츠팀 매체 집행 일정 — 읽기 전용 공유 뷰 (등록·수정은 팀 내부에서만)'
              : '팀 운영 매체 집행 일정 — 빠른 입력 한 줄로 등록, 클릭해서 수정·삭제'}
        </div>
        {session && !readOnly && (
          <div className="session-bar">
            <ShareButton query="?view=mirror" url={MIRROR_URL || undefined} label="읽기전용 공유 링크 복사" />
            <a className="share-btn" href={MIRROR_URL || '?view=mirror'} target="_blank" rel="noreferrer">
              크게 보기 (새 탭)
            </a>
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
        <QuickAdd onCreate={onCreate} campaigns={campaigns} shoot={shoot} />
      )}

      <div className="cal-search-row">
        <input
          className="cal-search" type="search" autoComplete="off"
          placeholder="전체 일정 검색 — 제목·캠페인·메모·작성자·매체"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        {searching && <button className="cal-search-clear" onClick={() => setSearch('')}>지우기</button>}
      </div>

      {!searching && (
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
      )}

      {!searching && (
        <div className="filters cal-filters">
          {['전체', ...chipChannels.map(c => c.id)].map(id => (
            <button key={id} className={id === filter ? 'on' : ''} onClick={() => setFilter(id)}>
              {id !== '전체' && <ChannelIcon id={id} />}
              {id === '전체' ? '전체' : channelById(id).label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : searching ? (
        <SearchResults events={kindEvents} query={search} onSelect={setSelected} />
      ) : view === '월간' ? (
        <MonthGrid
          cursor={cursor} events={filtered} onSelect={setSelected}
          onDayClick={readOnly ? null : setDayDraft} wide={readOnly}
        />
      ) : (
        <CampaignView events={filtered} onSelect={setSelected} onRename={readOnly ? null : onRename} />
      )}

      {!loading && !searching && !readOnly && storageMode === 'supabase' && (
        <DeletedLog shoot={shoot} />
      )}

      {selected && (
        <EventModal
          event={selected} campaigns={campaigns} readOnly={readOnly} onOpenSpec={onOpenSpec}
          onClose={() => setSelected(null)} onSave={onSave} onDelete={onDelete}
        />
      )}

      {dayDraft && !readOnly && (
        <EventModal
          isNew
          event={{ title: '', date: dayDraft, endDate: '', channel: shoot ? '인스타' : '기타', sub: '', campaign: '', owner: me, memo: '', kind: shoot ? '촬영' : null }}
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
export default function CalendarPage({ readOnly = false, onOpenSpec, shoot = false }) {
  const [session, setSession] = useState(getSession())
  useEffect(() => onAuthChange(setSession), [])

  return <CalendarApp session={session} readOnly={readOnly} onOpenSpec={onOpenSpec} shoot={shoot} />
}
