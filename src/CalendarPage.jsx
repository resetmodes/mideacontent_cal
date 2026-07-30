import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { CHANNELS, TEAM_TYPES, TEAM_KEYWORDS, channelById, TARGET_CH, targetLast, mediaRank } from './data/channels.js'
import { parseQuick, toISO, fromISO, displayTitle } from './lib/parse.js'
import { listEvents, createEvent, updateEvent, updateEventImages, deleteEvent, renameCampaign, listHistory, listDeleted, resolveNotionGone, storageMode } from './lib/store.js'
import ImageAttach from './ImageAttach.jsx'
import ModalShell from './ModalShell.jsx'
import { getSession, onAuthChange } from './lib/auth.js'
import { resolveSpecMedia } from './lib/specLink.js'
import { findPerformance } from './lib/perf.js'
import { buildCampaignPerf } from './lib/campaignPerf.js'
import { HBars, Donut } from './Charts.jsx'
import { authorName, withAuthorName } from './data/team.js'
import { HOLIDAYS, CLOSED_DAYS } from './data/holidays.js'
import { MIRROR_URL, NOTION_REVIEW_EMAILS } from './config.js'
import ChannelIcon from './ChannelIcon.jsx'
import ShareButton from './ShareButton.jsx'
import { toast } from './lib/toast.js'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const todayISO = () => toISO(new Date())

const fmtDot = iso => {
  const d = fromISO(iso)
  return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`
}

/* 시작일보다 종료일이 앞서면 서로 맞바꿔 정렬 ('26.7) — 수정 폼의 두 날짜 선택기를
   거꾸로 고르면 "7.30 ~ 7.27"처럼 역순 기간이 저장·표시되던 문제 방지.
   저장(onCreate/onSave) 가드 + 표시(fmtRange·indexByDay)에 공통 적용 —
   가드 이전에 이미 역순으로 저장된 일정도 화면에서는 바로잡혀 보임 */
const orderRange = e => (e && e.endDate && e.date && e.endDate < e.date
  ? { ...e, date: e.endDate, endDate: e.date } : e)

const fmtRange = e0 => {
  const e = orderRange(e0)
  return e.endDate ? `${fmtDot(e.date)} ~ ${fmtDot(e.endDate)}` : fmtDot(e.date)
}

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
  for (const e0 of events) {
    const e = orderRange(e0)   // 역순 기간도 시작일에 본 표기·종료일에 마커가 바르게 찍히게
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
    if (a !== b) out.push(`${label} ${a || '없음'}에서 ${b || '없음'}으로`)
  }
  /* 이미지 첨부는 배열이라 장수 변화만 표기 ('26.7) */
  const ai = (prev.images || []).length, bi = (cur.images || []).length
  if (ai !== bi) out.push(`이미지 ${ai}장에서 ${bi}장으로`)
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
  if (state === 'loading') return <div className="md-hist-note">이력 불러오는 중</div>
  if (state === 'error')
    return <div className="md-hist-note">이력 조회 실패, 이력 테이블 미설정일 수 있음 (supabase-setup.md 6장)</div>
  if (state.length === 0) return <div className="md-hist-note">기록된 이력 없음 (이력 기능 활성화 이후 변경분부터 기록)</div>
  return (
    <div className="md-hist">
      {state.map((h, i) => {
        const diffs = h.action === 'UPDATE' ? histDiff(h.data || {}, state[i + 1]?.data) : []
        return (
          <div key={h.id} className="md-hist-row">
            <span className="mh-when">{fmtTs(h.changed_at)}</span>
            <span className="mh-who">{h.actor ? authorName(h.actor) : ''}</span>
            <span className="mh-act">{ACTION_KO[h.action] || h.action}</span>
            {diffs.length > 0 && <span className="mh-diff">{diffs.join(', ')}</span>}
          </div>
        )
      })}
    </div>
  )
}

/* 최근 30일 삭제 기록 — 캘린더 하단 접힘 목록 ("누가 지웠어?" 대비) */
function DeletedLog({ shoot, team = false }) {
  const [rows, setRows] = useState(null)   // null=미조회
  const [failed, setFailed] = useState(false)
  const load = async e => {
    if (!e.target.open || rows) return
    try {
      const all = await listDeleted(30)
      setRows(all.filter(r => {
        const k = r.data?.kind
        return team ? k === '팀' : shoot ? k === '촬영' : (k !== '촬영' && k !== '팀')
      }))
    } catch { setFailed(true) }
  }
  return (
    <details className="del-log" onToggle={load}>
      <summary>최근 30일 삭제 기록</summary>
      {failed && <div className="md-hist-note">조회 실패, 이력 테이블 미설정일 수 있음 (supabase-setup.md 6장)</div>}
      {rows && rows.length === 0 && <div className="md-hist-note">최근 30일 내 삭제된 일정 없음</div>}
      {rows && rows.map(r => (
        <div key={r.id} className="md-hist-row">
          <span className="mh-when">{fmtTs(r.changed_at)}</span>
          <span className="mh-who">{r.actor ? authorName(r.actor) : ''}</span>
          <span className="mh-act">삭제</span>
          <span className="mh-diff">{r.data?.date} {displayTitle(r.data?.title, r.data?.channel)}{r.data?.channel ? ` (${r.data.channel})` : ''}</span>
        </div>
      ))}
    </details>
  )
}

function ChannelPickGrid({ value, onPick, shootOnly = false, team = false }) {
  const list = team ? TEAM_TYPES : shootOnly ? CHANNELS.filter(c => SHOOT_CHANNELS.has(c.id)) : CHANNELS
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
/* 중복 등록 감지 ('26.7.29) — 같은 날짜, 같은 매체에 제목이 사실상 같은 일정이 이미 있으면
   등록 전에 보여준다. 대신 등록이 잦아 이중 등록이 실제로 생김.
   제목 비교는 공백·기호를 지운 뒤 완전일치 또는 포함관계 (짧은 쪽이 4자 이상일 때만) */
const normTitle = t => (t || '').replace(/[\s#·,.]/g, '').toLowerCase()
export function findDuplicates(draft, events) {
  if (!draft?.date || !draft.title || !events?.length) return []
  const chans = draft.channels?.length
    ? draft.channels.map(c => c.channel)
    : (draft.channel ? [draft.channel] : [])
  if (chans.length === 0) return []
  const kind = draft.kind || null
  const a = normTitle(draft.title)
  if (a.length < 2) return []
  return events.filter(e => {
    if ((e.kind || null) !== kind) return false
    if (e.date !== draft.date) return false
    if (!chans.includes(e.channel)) return false
    const b = normTitle(e.title)
    if (a === b) return true
    const short = a.length < b.length ? a : b
    return short.length >= 4 && (a.includes(b) || b.includes(a))
  }).slice(0, 4)
}

function ConfirmSheet({ draft, sim, dup = [], onConfirm, onCancel, shootOnly = false, team = false }) {
  const [channel, setChannel] = useState(draft.channel)
  const [campaign, setCampaign] = useState(draft.campaign)
  const needChannel = !draft.channel

  return (
    <ModalShell onClose={onCancel}>
        <div className="md-ch">등록 전 확인</div>
        <div className="md-title sm">{draft.title}</div>
        {needChannel && (
          <div className="cs-section">
            <div className="cs-q">
              {team
                ? '어떤 일정인가요?'
                : `어떤 매체인가요?${shootOnly ? ' (촬영일정은 인스타와 유튜브만)' : ''}`}
            </div>
            <ChannelPickGrid value={channel} onPick={setChannel} shootOnly={shootOnly} team={team} />
          </div>
        )}
        {dup.length > 0 && (
          <div className="cs-section cs-dup">
            <div className="cs-q">같은 날 같은 매체에 이미 등록된 일정이 있습니다</div>
            {dup.map(d => (
              <div key={d.id} className="cs-dup-row">
                <ChannelIcon id={d.channel} />
                <span className="cs-dup-ttl">{displayTitle(d.title, d.channel)}</span>
                {d.sub && <span className="cs-dup-sub">{d.sub}</span>}
                {d.owner && <span className="cs-dup-sub">{d.owner}</span>}
              </div>
            ))}
            <div className="cs-dup-note">그대로 등록하려면 아래 등록을 누르세요</div>
          </div>
        )}
        {sim.length > 0 && (
          <div className="cs-section">
            <div className="cs-q">어느 캠페인으로 등록할까요?</div>
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
            onClick={() => onConfirm({ ...draft, channel: channel || (team ? '팀기타' : '기타'), campaign })}
          >등록</button>
        </div>
    </ModalShell>
  )
}

/* 모바일 판별 — 예시 문구를 짧게 (긴 placeholder가 잘려 보이던 문제) */
const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width:560px)').matches

function QuickAdd({ onCreate, campaigns, events = [], shoot = false, team = false }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  const [pending, setPending] = useState(null)
  /* 팀 일정 탭: 매체 대신 유형 키워드(연차·외근·생일 …), 매체 표기 통일은 건너뜀 */
  const draft = useMemo(
    () => parseQuick(text, new Date(), team ? { keywords: TEAM_KEYWORDS, normalize: false } : {}),
    [text, team]
  )

  /* "#"만 치면 기존 캠페인 전체를 선택지로 노출 (팀 일정은 캠페인 없음) */
  const bareHash = !team && /#\s*$/.test(text)
  const similar = useMemo(
    () => (team ? [] : bareHash ? campaigns.slice(0, 8) : campSimilar(campaigns, draft?.campaign)),
    [draft, campaigns, bareHash, team]
  )

  const useCampaign = name => {
    setText(t => (/#\s*$/.test(t) ? t.replace(/#\s*$/, '#' + name) : t.replace(/#[^\s#]+/, '#' + name)))
  }

  /* 다중 매체(인스타+유튜브 …)면 매체 수만큼, 촬영/업로드 병기면 건별 2개 등록.
     촬영 탭에서의 단일 날짜 입력 = 촬영일. 팀 탭은 kind='팀'·캠페인 없음.
     작성자는 CalendarApp에서 자동 기록 */
  const doCreate = async d => {
    const { channels, shootDate, ...base } = d
    if (team) {
      await onCreate({ ...base, campaign: null, kind: '팀' })
      setText('')
      setPending(null)
      return
    }
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
    /* 휴점일 등록 — 어느 캘린더 탭에서든 "8/10 휴점" 한 줄이면 kind='휴점' 마커 등록.
       (제목이 "휴점"/"휴점일"뿐일 때만 — "휴점 안내 공지" 같은 실제 일정은 정상 등록) */
    if (draft.date && /^휴점(일)?$/.test((draft.title || '').trim())) {
      onCreate({ title: '휴점', channel: '휴점', campaign: null, kind: '휴점',
        date: draft.date, endDate: draft.endDate || null })
      setText(''); setErr(null); setPending(null)
      return
    }
    if (!draft.date && !draft.shootDate) { setErr(team ? '날짜를 인식하지 못함 (7/20 또는 8/1~3 형식)' : '날짜를 인식하지 못함 (12/20 형식, 촬영과 업로드 병기는 "7/10 촬영 7/15 업로드")'); return }
    if (!draft.title) { setErr(team ? '날짜 뒤에 이름과 내용을 입력하세요 (예: 7/20 노규빈 연차)' : '날짜 뒤에 내용을 입력하세요'); return }
    /* 촬영 건 포함 시 매체 제한 — 유튜브·인스타만 (팀 탭은 해당 없음) */
    const hasShoot = !team && (shoot || !!draft.shootDate)
    const chans = draft.channels?.length ? draft.channels : (draft.channel ? [{ channel: draft.channel }] : [])
    if (hasShoot && chans.length > 0 && chans.some(c => !SHOOT_CHANNELS.has(c.channel))) {
      setErr('촬영일정은 인스타와 유튜브만 등록 가능'); return
    }
    setErr(null)
    const sim = team ? [] : campSimilar(campaigns, draft.campaign)
    const dup = findDuplicates({ ...draft, kind: team ? '팀' : shoot ? '촬영' : null }, events)
    if (!draft.channel || sim.length > 0 || dup.length > 0) { setPending({ draft, sim, dup }); return }
    doCreate(draft)
  }

  return (
    <div className="quick-add">
      <div className="qa-row">
        <span className="io-label reg">등록</span>
        <input
          className="qa-input" type="text" autoComplete="off"
          placeholder={isMobile()
            ? (team ? '예: 7/20 노규빈 연차' : shoot ? '예: 7/10 촬영 7/15 업로드 인스타' : '예: 12/20 인스타 릴스 #크리스마스')
            : team
              ? '예: 7/20 노규빈 연차, 다음주 월~수 노규빈 출장'
              : shoot
                ? '예: 7/10 촬영 7/15 업로드 여름 룩북 인스타'
                : '예: 12/20 크리스마스 인스타 릴스 #크리스마스'}
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
                : '날짜 미인식 (12/20 형식)'}
            </span>
          )}
          {draft.channels?.length > 1 ? (
            <>
              {draft.channels.map((c, i) => (
                <span key={i} className="st got">
                  <ChannelIcon id={c.channel} /> {channelById(c.channel)?.label}{c.sub ? ` ${c.sub}` : ''}
                </span>
              ))}
              <span className="st camp">{draft.channels.length}건 동시 등록</span>
            </>
          ) : (
            <span className={'st ' + (draft.channel ? 'got' : 'miss')}>
              {draft.channel
                ? <><ChannelIcon id={draft.channel} /> {channelById(draft.channel)?.label}{draft.sub ? ` ${draft.sub}` : ''}</>
                : (team ? '유형 미인식' : '매체 미인식')}
            </span>
          )}
          {!team && draft.campaign && <span className="st camp">#{draft.campaign}</span>}
          {draft.title && <span className="st ttl">{draft.title}</span>}
        </div>
      )}
      {similar.length > 0 && (
        <div className="qa-suggest big">
          {bareHash ? '기존 캠페인 선택' : '비슷한 캠페인, 클릭하면 통일'}
          {similar.map(c => (
            <button key={c} onClick={() => useCampaign(c)}>#{c}</button>
          ))}
        </div>
      )}
      {err && <div className="qa-err">{err}</div>}
      {pending && (
        <ConfirmSheet
          draft={pending.draft} sim={pending.sim} dup={pending.dup || []}
          shootOnly={!team && (shoot || !!pending.draft.shootDate)} team={team}
          onConfirm={doCreate} onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

/* 타겟APP 후순위는 channels.js 단일 소스 (홈·시트·셀 공유) */

/* 타겟APP 셀 묶음 ('26.7) — 같은 제목·기간의 타겟APP 형제 건(세부만 다름)을 셀에서
   한 줄 "×N"으로 합침 (10종 동시 등록 시 셀 도배 방지). 클릭하면 세부 선택 시트 */
function groupCellEvents(list) {
  const out = [], gmap = {}
  for (const e of list) {
    if (e.channel !== TARGET_CH) { out.push(e); continue }
    const key = [e.title, e.date, e.endDate || '', e.isEnd ? 'e' : e.isMid ? 'm' : ''].join('|')
    if (gmap[key]) { gmap[key].group.push(e); continue }
    const item = { ...e, group: [e] }
    gmap[key] = item
    out.push(item)
  }
  return targetLast(out)   // 다른 매체 먼저, 타겟APP은 아래로
}

function MonthGrid({ cursor, events, onSelect, onDayClick, wide = false, onMove = null, onGroup = null, onDay = null, closedDays = CLOSED_DAYS }) {
  const cells = useMemo(() => buildMonth(cursor), [cursor])
  const byDay = useMemo(() => indexByDay(events, wide), [events, wide])
  const today = todayISO()
  const MAX = wide ? 8 : 4   // 와이드 열람 모드는 셀당 표시 건수 확대

  /* 드래그앤드롭 일정 이동 ('26.7) — 일정을 6px 이상 끌어야 드래그로 인식 (그 전에
     놓으면 기존 클릭 = 상세 모달, 기존 동작 불변). 놓은 셀과 집어든 셀의 날짜 차만큼
     평행이동 — 기간 일정의 "· 종료" 마커를 끌어도 전체가 같이 이동.
     터치는 스크롤과 충돌해 제외(데스크톱 전용), 기념일 투영(orig)은 이동 불가 */
  const [dragOver, setDragOver] = useState(null)   // 드래그 중 올라가 있는 셀 ISO
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)                     // {active} — 드래그 직후 클릭 억제용

  const pickUp = (pv, e, srcDay) => {
    if (!onMove || pv.pointerType === 'touch' || pv.button !== 0 || e.orig) return
    const d = { active: false, startX: pv.clientX, startY: pv.clientY }
    dragRef.current = d
    const cellAt = v => document.elementFromPoint(v.clientX, v.clientY)?.closest('[data-date]')?.dataset.date || null
    const move = mv => {
      if (!d.active) {
        if (Math.hypot(mv.clientX - d.startX, mv.clientY - d.startY) < 6) return
        d.active = true
        setDragging(true)
      }
      mv.preventDefault()
      setDragOver(cellAt(mv))
    }
    const up = uv => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragOver(null)
      setDragging(false)
      if (d.active) {
        const to = cellAt(uv)
        if (to && to !== srcDay) onMove(e, srcDay, to)
      }
      setTimeout(() => { dragRef.current = null }, 0)   // 뒤따르는 click까지 억제 유지
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className={'cal-grid' + (onDayClick ? ' editable' : '') + (dragging ? ' dragging' : '')}>
      {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
      {cells.map(c => {
        const list = groupCellEvents(byDay[c.iso] || [])
        const hol = HOLIDAYS[c.iso]
        const closed = closedDays[c.iso]
        return (
          <div
            key={c.iso}
            data-date={c.iso}
            className={'cal-cell' + (c.inMonth ? '' : ' dim') + (c.iso === today ? ' today' : '')
              + (closed ? ' closed' : hol ? ' holiday' : '') + (dragging && dragOver === c.iso ? ' drop' : '')}
            onClick={onDayClick
              ? () => { if (!dragRef.current?.active) onDayClick(c.iso) }
              : onDay ? () => onDay(c.iso) : undefined}   /* 읽기 전용 = 셀 클릭이 하루 보기 */
            title={onDayClick ? '클릭해서 일정 등록' : onDay ? '클릭해서 이 날 일정 전체 보기' : undefined}
          >
            <div className="cal-dayrow">
              {/* 일자 숫자 = 하루 전체 보기 ('26.7) — 셀(등록)과 분리된 명시 타깃 */}
              <button
                type="button"
                className={'cal-daynum' + (c.dow === 0 || c.dow === 6 || hol ? ' wknd' : '')}
                onClick={ev => { ev.stopPropagation(); onDay?.(c.iso) }}
                title="이 날 일정 전체 보기"
              >{c.day}</button>
              {closed && <span className="cal-closed">{closed}</span>}
              {hol && <span className="cal-hol">{hol}</span>}
            </div>
            {list.slice(0, MAX).map(e => {
              const n = e.group?.length || 1
              return (
                <button
                  key={e.id + c.iso + (e.isEnd ? 'e' : e.isMid ? 'm' : '') + (n > 1 ? 'g' : '')}
                  className={'cal-ev' + (e.isEnd ? ' end' : '') + (e.isMid ? ' mid' : '')}
                  onPointerDown={pv => pickUp(pv, e, c.iso)}
                  onClick={ev => {
                    ev.stopPropagation()
                    if (dragRef.current?.active) return
                    if (n > 1 && onGroup) onGroup(e.group)
                    else onSelect(n > 1 ? e.group[0] : e)
                  }}
                  title={n > 1
                    ? `타겟APP ${n}개 매체 동시 집행, ${displayTitle(e.title, e.channel)} (${fmtRange(e)})`
                    : `${channelById(e.channel)?.label || e.channel}${e.sub ? ` (${e.sub})` : ''} ${displayTitle(e.title, e.channel)} (${fmtRange(e)})`}
                >
                  <ChannelIcon id={e.channel} />
                  {n > 1 && <span className="ev-cnt">×{n}</span>}
                  {wide && <span className="ev-ch">{channelById(e.channel)?.label || e.channel}</span>}
                  <span className="ev-title">{displayTitle(e.title, e.channel)}{e.isEnd && ' 종료'}</span>
                </button>
              )
            })}
            {list.length > MAX && (
              <button type="button" className="cal-more"
                onClick={ev => { ev.stopPropagation(); onDay?.(c.iso) }}>
                +{list.length - MAX} 더보기
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── 하루 일정 시트 ('26.7) — 셀이 넘칠 때(타겟APP 다건 등) 그날 전체를 큰 화면으로.
   진입: 일자 숫자 클릭 · "+N 더보기" 클릭 · (읽기 전용 뷰) 셀 클릭.
   등록과 분리 — 셀 빈 공간 클릭 = 등록(불변), 시트 하단에 별도 "이 날짜에 등록" 버튼 */
function DaySheet({ iso, events, readOnly, onClose, onSelect, onRegister, closedDays = CLOSED_DAYS, canUnclose = false, onUnclose }) {
  const hol = HOLIDAYS[iso]
  const closed = closedDays[iso]
  const list = useMemo(() => {
    const covers = e => {
      const o = orderRange(e)
      return o.date <= iso && iso <= (o.endDate || o.date)
    }
    /* 매체 우선순위는 channels.js 단일 소스 (SNS, 기타, 장기 상시, 타겟APP) */
    return events.filter(covers).sort((a, b) =>
      (mediaRank(a.channel) - mediaRank(b.channel))
      || (CHANNELS.findIndex(c => c.id === a.channel) - CHANNELS.findIndex(c => c.id === b.channel))
      || (a.sub || '').localeCompare(b.sub || '') || a.title.localeCompare(b.title))
  }, [events, iso])

  /* 타겟APP 주제 묶음 ('26.7.29) — 같은 제목·기간의 타겟APP은 한 줄로 접고,
     펼치면 어떤 매체로 나가는지 보여준다 (10종 동시 집행 시 시트가 도배되던 문제) */
  const rows = useMemo(() => {
    const out = [], gmap = {}
    for (const e of list) {
      if (e.channel !== TARGET_CH) { out.push({ solo: e }); continue }
      const o = orderRange(e)
      const key = [e.title, o.date, o.endDate || ''].join('|')
      if (gmap[key]) { gmap[key].items.push(e); continue }
      const g = { key, items: [e] }
      gmap[key] = g
      out.push({ group: g })
    }
    return out
  }, [list])
  const [openGrp, setOpenGrp] = useState(null)

  return (
    <ModalShell onClose={onClose} className="day-sheet">
        <div className="md-ch">하루 일정 {list.length}건</div>
        <div className="md-title">{fmtDot(iso)}
          {closed && <small className="day-closed"> {closed}</small>}
          {hol && <small className="day-hol"> {hol}</small>}</div>
        <div className="day-list">
          {rows.map((r, i) => {
            const e = r.solo || r.items?.[0] || r.group.items[0]
            const o = orderRange(e)
            const ranged = o.endDate && o.endDate !== o.date
            const tag = ranged ? (o.date === iso ? '시작' : o.endDate === iso ? '종료' : '진행중') : null
            /* 타겟APP 묶음 = 주제 한 줄, 클릭하면 매체 목록 펼침 */
            if (r.group && r.group.items.length > 1) {
              const g = r.group
              const open = openGrp === g.key
              return (
                <div key={g.key} className={'day-grp' + (open ? ' open' : '')}>
                  <button className="day-row" onClick={() => setOpenGrp(open ? null : g.key)}>
                    <ChannelIcon id={TARGET_CH} />
                    <span className="day-ch">타겟APP</span>
                    <span className="day-ttl">{displayTitle(e.title, e.channel)}</span>
                    {e.campaign && <span className="day-camp">#{e.campaign}</span>}
                    {tag && <span className="day-sub">{tag} {fmtRange(o)}</span>}
                    <span className="day-sub">{g.items.length}개 매체 {open ? '접기' : '펼치기'}</span>
                  </button>
                  {open && (
                    <div className="day-grp-list">
                      {g.items.map(it => (
                        <button key={it.id} className="day-subrow" onClick={() => onSelect(it)}>
                          {it.sub || '세부 미지정'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <button key={e.id + i} className="day-row" onClick={() => onSelect(e)}>
                <ChannelIcon id={e.channel} />
                <span className="day-ch">{channelById(e.channel)?.label || e.channel}{e.sub ? ` ${e.sub}` : ''}</span>
                <span className="day-ttl">{displayTitle(e.title, e.channel)}</span>
                {e.campaign && <span className="day-camp">#{e.campaign}</span>}
                {tag && <span className="day-sub">{tag} {fmtRange(o)}</span>}
              </button>
            )
          })}
          {list.length === 0 && <div className="empty">이 날짜에 등록된 일정 없음</div>}
        </div>
        <div className="md-actions">
          {!readOnly && <button className="btn-ghost" onClick={onRegister}>+ 이 날짜에 등록</button>}
          {!readOnly && canUnclose && (
            <button className="btn-ghost danger" onClick={() => { onUnclose(iso); onClose() }}>휴점 해제</button>
          )}
          <div className="md-spacer" />
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
    </ModalShell>
  )
}

/* 캠페인 블록 — CampaignView 밖에 정의 (렌더마다 컴포넌트가 재생성되면
   이름 변경 입력이 한 글자마다 재마운트되어 커서가 튀는 문제 방지) */
function CampBlock({ g, renaming, renameVal, setRenameVal, onConfirmRename, onStartRename, onCancelRename, canRename, onSelect, focus, onFocus }) {
  const focused = focus === g.name
  return (
    <div className={'camp-block' + (focused ? ' focused' : '')}>
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
            {onFocus ? (
              <button className={'camp-name camp-name-btn' + (focused ? ' on' : '')}
                onClick={() => onFocus(focused ? null : g.name)}
                title={focused ? '전체 캠페인 보기' : '이 캠페인만 캘린더에 보기'}>#{g.name}</button>
            ) : (
              <span className="camp-name">#{g.name}</span>
            )}
            {canRename && (
              <button className="camp-rename" onClick={() => onStartRename(g.name)}>이름 변경</button>
            )}
          </>
        )}
        <span className="camp-range">{fmtDot(g.first)} ~ {fmtDot(g.lastEnd)}, {g.list.length}건</span>
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

/* 캠페인 뷰 — 최근 캠페인 / 지난 캠페인 ('26.7 기준 변경)
   최근 = 마지막 게시(종료일 포함)가 최근 1개월 이내이거나 진행·예정 → 항상 펼침.
   지난 = 마지막 게시 후 1개월 경과 → 자동 보관(접힘).
   이전 기준(종료일 지나면 즉시 보관)은 막 끝난 캠페인이 바로 묻히는 문제가 있었음 */
/* 캠페인 네비 ('26.7) — 큰 제목 ‹ #캠페인명 › 좌우 넘김 + 아래 작은 선택 칩.
   seq = [전체, ...최근 캠페인] 순환. 포커스가 지난 캠페인이면 seq에 끼워 넣어 넘김 정상 */
function CampNav({ names, focus, onFocus }) {
  const seq = [null, ...names]
  if (focus && !seq.includes(focus)) seq.splice(1, 0, focus)
  const idx = Math.max(0, seq.indexOf(focus ?? null))
  const go = dir => onFocus(seq[(idx + dir + seq.length) % seq.length])
  return (
    <div className="camp-nav">
      <div className="camp-nav-title">
        <button className="camp-arrow" onClick={() => go(-1)} aria-label="이전 캠페인">‹</button>
        <span className="camp-title-txt">{focus ? `#${focus}` : '전체 캠페인'}</span>
        <button className="camp-arrow" onClick={() => go(1)} aria-label="다음 캠페인">›</button>
      </div>
      <div className="camp-chips">
        <button className={!focus ? 'on' : ''} onClick={() => onFocus(null)}>전체</button>
        {names.map(n => (
          <button key={n} className={focus === n ? 'on' : ''}
            onClick={() => onFocus(focus === n ? null : n)}>#{n}</button>
        ))}
      </div>
    </div>
  )
}

/* ── 캠페인 통합 성과 ('26.7.30) — 캠페인 하나를 선택했을 때만 렌더.
   매체마다 집계 출처가 달라 행마다 출처 배지를 달고, 없는 값은 채우지 않는다.
   타겟APP 실적은 Supabase 전용이라 캠페인을 처음 열 때 한 번만 불러 캐시한다 */
let taCache = null
const loadTargetApp = () => {
  if (!taCache) {
    taCache = storageMode === 'supabase'
      ? import('./lib/targetappStore.js')
        .then(m => m.listTargetApp())
        .then(d => d?.rows || null)
        .catch(() => null)
      : Promise.resolve(null)
  }
  return taCache
}

const cpNum = n => Number(n || 0).toLocaleString('ko-KR')
/* KPI 큰 숫자 — 만·억으로 접되 자릿수가 커지면 소수점을 뗀다 (1621.5만은 읽히지 않음) */
const cpBig = n => {
  if (!n) return ['0', '']
  const unit = n >= 100000000 ? ['억', 100000000] : n >= 10000 ? ['만', 10000] : null
  if (!unit) return [cpNum(n), '']
  const v = n / unit[1]
  return [v.toLocaleString('ko-KR', { maximumFractionDigits: v >= 100 ? 0 : 1 }), unit[0]]
}

function CampaignPerf({ group, onSelect }) {
  const [taRows, setTaRows] = useState(null)
  useEffect(() => {
    let alive = true
    loadTargetApp().then(r => { if (alive) setTaRows(r) })
    return () => { alive = false }
  }, [])

  const perf = useMemo(
    () => buildCampaignPerf(group.list, { taRows, campaign: group.name }),
    [group.list, group.name, taRows])

  const today = todayISO()
  const state = group.lastEnd < today
    ? `종료 D+${Math.round((fromISO(today) - fromISO(group.lastEnd)) / 86400000)}`
    : group.first > today
      ? `시작 D-${Math.round((fromISO(group.first) - fromISO(today)) / 86400000)}`
      : '진행 중'

  const expRows = perf.rows.filter(r => r.exp != null)
  const actRows = perf.rows.filter(r => r.act != null)
  const vals = expRows.map(r => r.exp)
  /* 타겟APP 노출과 SNS 조회는 자릿수가 달라 선형 막대면 SNS가 안 보인다 */
  const useSqrt = vals.length > 1 && Math.max(...vals) >= 20 * Math.min(...vals)
  const [expV, expU] = cpBig(perf.total.exp)

  return (
    <div className="cp-perf">
      <div className="cp-head">
        <div className="cp-meta">
          <div className="cp-m"><span>집행 기간</span><b className="num">{fmtDot(group.first)} ~ {fmtDot(group.lastEnd)}</b></div>
          <div className="cp-m"><span>집행 건수</span><b className="num">{perf.total.count}건</b></div>
          <div className="cp-m"><span>집행 매체</span><b className="num">{perf.total.media}개</b></div>
        </div>
        <span className="cp-state">{state}</span>
      </div>

      <div className="group-label">캠페인 성과</div>
      <div className="dash-d">
        매체마다 집계 출처가 달라 행마다 출처를 함께 적었습니다. 수집이나 실적 입력이 없는 매체는
        값을 추정하지 않고 비워 둡니다.
      </div>

      {perf.total.measured === 0 ? (
        <div className="cp-empty">아직 집계된 매체가 없습니다</div>
      ) : (
        <>
          <div className="mon-hero">
            <div className="mon-stat">
              <div className="mon-label">총 노출</div>
              <div className="mon-value num">{expV}{expU && <small>{expU}</small>}</div>
              <div className="mon-sub">타겟APP 노출과 SNS 조회 합계</div>
            </div>
            <div className="mon-stat">
              <div className="mon-label">총 반응</div>
              <div className="mon-value num">{cpNum(perf.total.act)}</div>
              <div className="mon-sub">좋아요, 댓글, 클릭 합계</div>
            </div>
            <div className="mon-stat">
              <div className="mon-label">집계된 매체</div>
              <div className="mon-value num">{perf.total.measured}<small>개</small></div>
              <div className="mon-sub">전체 {perf.total.media}개 매체 중</div>
            </div>
            <div className="mon-stat">
              <div className="mon-label">집계 대기</div>
              <div className="mon-value num">{perf.pending.length}<small>개 매체</small></div>
              <div className="mon-sub">{perf.pending.join(', ') || '없음'}</div>
            </div>
          </div>

          <div className="mon-scroll">
            <table className="mon-table">
              <thead>
                <tr><th>매체</th><th>집행</th><th>노출</th><th>반응</th><th>반응률</th><th>출처</th></tr>
              </thead>
              <tbody>
                {perf.rows.map(r => (
                  <tr key={r.ch}>
                    <td>
                      <div className="cp-ch">
                        <ChannelIcon id={r.ch} />
                        <span>
                          <b>{r.label}</b>
                          {r.subs.length > 0 && <em>{r.subs.join(', ')}</em>}
                        </span>
                      </div>
                    </td>
                    <td>{r.count}건</td>
                    {r.exp == null && r.act == null ? (
                      <td className="mute" colSpan={3}>집계 확인 중</td>
                    ) : (
                      <>
                        <td className="strong num">{r.exp == null ? '' : cpNum(r.exp)}</td>
                        <td className="num">{r.act == null ? '' : cpNum(r.act)}</td>
                        <td className="num">{r.rate == null ? '' : r.rate.toFixed(2) + '%'}</td>
                      </>
                    )}
                    <td>
                      <span className={'src-tag' + (r.source ? '' : ' none')}>{r.source || '미집계'}</span>
                      {r.note && <em className="src-note">{r.note}</em>}
                    </td>
                  </tr>
                ))}
                <tr className="sum">
                  <td>합계</td><td />
                  <td className="num">{cpNum(perf.total.exp)}</td>
                  <td className="num">{cpNum(perf.total.act)}</td>
                  <td /><td />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="dash-grid g23">
            <div className="dash-panel">
              <div className="group-label">매체별 노출</div>
              <div className="dash-d">
                {useSqrt
                  ? '매체 간 규모 차이가 커서 제곱근 눈금으로 그렸습니다. 막대 길이는 배수가 아니라 순위를 읽는 용도입니다.'
                  : '집계된 매체만 표시합니다'}
              </div>
              <HBars sqrt={useSqrt} rows={expRows.map(r => ({
                name: r.label, sub: r.subs.join(', ') || undefined, value: r.exp,
              }))} />
            </div>
            <div className="dash-panel flat">
              <div className="group-label">반응 구성</div>
              <div className="dash-d">노출이 아니라 실제 반응이 어디서 나왔는지 봅니다</div>
              <Donut data={actRows.map(r => [r.label, r.act])} center={cpNum(perf.total.act)} />
            </div>
          </div>
        </>
      )}

      {perf.contents.length > 0 && (
        <>
          <div className="group-label">콘텐츠별 실적</div>
          <div className="dash-d">
            일정 1건마다 게시 시점이 가장 가까운 게시물 1건을 매칭합니다. 행을 누르면 일정 상세가 열립니다.
          </div>
          <div className="mon-scroll cp-posts">
            {perf.contents.map(c => (
              <button key={c.url} className="cp-post" onClick={() => onSelect(c.event)}>
                <span className="cp-thumb">
                  {c.thumb ? <img src={c.thumb} alt="" loading="lazy" /> : <ChannelIcon id={c.ch} />}
                </span>
                <span className="cp-t">
                  <b>{c.title}</b>
                  <span>
                    {c.chLabel}{c.sub && ' ' + c.sub}, {c.format}, {fmtDot(new Date(c.t).toISOString().slice(0, 10))} 게시
                    {c.how === 'near' && <em className="cp-guess">날짜 추정</em>}
                  </span>
                </span>
                {(() => {
                  /* 조회가 있으면 조회가 주인공, 없으면(피드·캐러셀) 반응이 주인공 */
                  const act = c.likes != null || c.comments != null ? (c.likes || 0) + (c.comments || 0) : null
                  const [main, unit] = c.views ? [cpNum(c.views), '조회'] : act != null ? [cpNum(act), '반응'] : ['', '수치 없음']
                  return (
                    <span className="cp-nums">
                      <b className="num">{main}</b>
                      <span className="num">{unit}{c.views && act != null ? `, 반응 ${cpNum(act)}` : ''}</span>
                    </span>
                  )
                })()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CampaignView({
  events, onSelect, onRename, focus = null, onFocus = null,
  cursor, onDayClick = null, onMove = null, onGroup = null, onDay = null, closedDays = CLOSED_DAYS, wide = false,
  perf = false,
}) {
  const today = todayISO()
  const [renaming, setRenaming] = useState(null)   // 이름 변경 중인 캠페인
  const [renameVal, setRenameVal] = useState('')
  const groups = useMemo(() => {
    const c = fromISO(today)
    c.setDate(c.getDate() - 30)
    const cutoff = toISO(c)   // 이 날짜 이전이 마지막 게시면 "지난 캠페인"
    const map = {}
    for (const e of events) {
      if (!e.campaign) continue
      ;(map[e.campaign] = map[e.campaign] || []).push(e)
    }
    const entries = Object.entries(map).map(([name, list]) => {
      list.sort((a, b) => a.date.localeCompare(b.date))
      const lastEnd = list.reduce((m, e) => ((e.endDate || e.date) > m ? (e.endDate || e.date) : m), '')
      return { name, list, first: list[0].date, lastEnd, past: lastEnd < cutoff }
    })
    return {
      recent: entries.filter(g => !g.past).sort((a, b) => a.first.localeCompare(b.first)),
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
    onSelect, focus, onFocus,
  }

  const focusedGroup = focus ? [...groups.recent, ...groups.past].find(g => g.name === focus) : null
  const empty = groups.recent.length === 0 && groups.past.length === 0
  /* 캘린더에 표시할 캠페인 일정 — 태그 붙은 것만, 선택 시 그 캠페인만 */
  const campEvents = events.filter(e => e.campaign && (!focus || e.campaign === focus))

  return (
    <div className="camp-view">
      {/* 캠페인 선택 = 큰 제목 네비 (캘린더 위, '26.7) */}
      {onFocus && !empty && (
        <CampNav names={groups.recent.map(g => g.name)} focus={focus} onFocus={onFocus} />
      )}

      <MonthGrid
        cursor={cursor} events={campEvents} onSelect={onSelect}
        onDayClick={onDayClick} wide={wide} onMove={onMove} onGroup={onGroup} onDay={onDay}
        closedDays={closedDays} />

      {empty && (
        <div className="empty">빠른 입력에 #캠페인명을 붙이면 여기에 묶임</div>
      )}

      {focusedGroup ? (
        <>
          {perf && <CampaignPerf key={focusedGroup.name} group={focusedGroup} onSelect={onSelect} />}
          <div className="camp-sec">#{focusedGroup.name} <small>이 캠페인만 캘린더에 표시 중</small></div>
          <CampBlock key={focusedGroup.name} g={focusedGroup} {...blockProps} />
        </>
      ) : !empty && (
        <>
          {groups.recent.length > 0 && <div className="camp-sec">최근 캠페인</div>}
          {groups.recent.map(g => <CampBlock key={g.name} g={g} {...blockProps} />)}
          {groups.past.length > 0 && (
            <details className="camp-past">
              <summary>지난 캠페인 {groups.past.length}건 <small>최근 1개월 게시 없음</small></summary>
              {groups.past.map(g => <CampBlock key={g.name} g={g} {...blockProps} />)}
            </details>
          )}
        </>
      )}
      {noCampaign > 0 && (
        <div className="camp-note">캠페인 미지정 일정 {noCampaign}건은 월간 뷰에서 확인</div>
      )}
    </div>
  )
}

/* isNew: 날짜 셀 클릭으로 열리는 신규 등록 모드 — 편집 폼으로 바로 시작, 저장 시 onCreate.
   상단 "한 줄 자동 작성" 입력에 치면 파싱해서 아래 폼을 자동으로 채움 */
/* ── 일정 이미지 첨부 ('26.7) — 결과·시안 보고용. 공용 위젯(ImageAttach) 사용:
   자동 압축·라이트박스·2단계 삭제·붙여넣기(Ctrl+V) 업로드.
   읽기 전용(미러 포함)은 열람만 — 공개 버킷이라 로그인 없이도 표시됨 ── */
function EventImages({ event, readOnly, onImages }) {
  const imgs = event.images || []
  const canEdit = !readOnly && !!onImages && storageMode === 'supabase'
  if (!imgs.length && !canEdit) return null
  return (
    <>
      {imgs.length > 0 && <div className="md-imgs-title">첨부 이미지 <small>클릭하면 크게 보기</small></div>}
      <ImageAttach
        imgs={imgs} canEdit={canEdit} storeKey={event.id}
        onChange={next => onImages(event.id, next)}
      />
    </>
  )
}

function EventModal({ event, campaigns, onClose, onSave, onDelete, onCreate, readOnly = false, isNew = false, onOpenSpec, onImages }) {
  const [editing, setEditing] = useState(isNew)
  const [confirmDel, setConfirmDel] = useState(false)
  const [quick, setQuick] = useState('')
  /* 모바일 신규 등록 ('26.7): 한 줄 입력 + 요약 칩만 먼저 — 긴 폼은 "상세 입력"을
     눌렀을 때만 펼침 (작은 화면에서 9개 필드 세로 스택이 화면을 다 덮던 문제) */
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width:560px)').matches
  const [expanded, setExpanded] = useState(!(isNew && mobile))
  const isShoot = event.kind === '촬영'
  const isTeam = event.kind === '팀'
  const specName = isTeam ? null : resolveSpecMedia(event.channel, event.sub)
  /* 촬영·팀 일정은 게시물이 아니라 실적 매칭 제외 */
  const perf = useMemo(() => (isNew || isShoot || isTeam ? [] : findPerformance(event)), [event, isNew, isShoot, isTeam])
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

  /* 세부 다중 선택 ('26.7) — 신규 등록에서 세부를 체크박스로 여러 개 고르면 선택 수만큼
     동시 등록 (타겟APP 바이비+아파트너+카카오골프 등). 팀 일정은 단일 select 유지 */
  const multiSub = isNew && !isTeam
  const [subsSel, setSubsSel] = useState(event.sub ? [event.sub] : [])
  const toggleSub = s => setSubsSel(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]))

  /* 한 줄 입력 → 폼 자동 채움. 날짜를 안 쓰면 클릭한 날짜 유지 */
  const applyQuick = v => {
    setQuick(v)
    const d = parseQuick(v, new Date(), isTeam ? { keywords: TEAM_KEYWORDS, normalize: false } : {})
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
    if (d.channels?.length > 1 && d.channels.every(c => c.channel === d.channels[0].channel))
      setSubsSel(d.channels.map(c => c.sub).filter(Boolean))   // "바이비+아파트너" 한 줄 → 체크 반영
    else if (d.sub) setSubsSel([d.sub])
    else if (d.channel) setSubsSel([])
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
    if (isNew && multiSub) {
      const subs = subsSel.length ? subsSel : [null]
      for (const s of subs) await onCreate({ ...fields, sub: s })   // 체크 수만큼 동시 등록
    } else if (isNew) {
      await onCreate(fields)
    } else {
      await onSave(event.id, fields)
    }
    onClose()
  }

  /* 2단계 삭제 — 네이티브 confirm 대신 버튼 재클릭 확인 */
  const del = async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    await onDelete(event.id)
    onClose()
  }

  return (
    <ModalShell onClose={onClose}>
        {!editing ? (
          <>
            <div className="md-ch"><ChannelIcon id={event.channel} /> {channelById(event.channel)?.label || event.channel}
              {event.sub && <span className="md-ch-sub">{event.sub}</span>}
              {isShoot && <span className="md-ch-sub">촬영</span>}
              {isTeam && <span className="md-ch-sub">팀 일정</span>}</div>
            <div className="md-title">{displayTitle(event.title, event.channel)}</div>
            <dl className="md-grid">
              <dt>일자</dt><dd>{fmtRange(event)}</dd>
              {event.campaign && <><dt>캠페인</dt><dd>#{event.campaign}</dd></>}
              {event.owner && <><dt>작성자</dt><dd>{event.owner}</dd></>}
              {event.memo && <><dt>메모</dt><dd className="md-memo"><Memo text={event.memo} /></dd></>}
            </dl>
            {!isNew && <EventImages event={event} readOnly={readOnly} onImages={onImages} />}
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
                    <span className="pf-meta">{pinned.meta}</span>
                  </a>
                </div>
              </div>
            ) : perf.length > 0 && (
              /* 제목 대조로 하나가 확정되면 그 건만 보여주고, 나머지는 접어 둔다 ('26.7.30)
                 사람이 매번 고르지 않아도 되게 — 어긋나면 "다른 후보"에서 바꾼다 */
              perf.some(p => p.auto) ? (
                <div className="md-perf">
                  <div className="md-perf-title">집행 실적 <small>제목 자동 대조</small></div>
                  {perf.filter(p => p.auto).map(p => (
                    <div key={p.url} className="md-perf-item">
                      <a className="md-perf-row" href={p.url} target="_blank" rel="noopener noreferrer">
                        <span className="pf-title">{p.title}</span>
                        <span className="pf-meta">{p.meta}</span>
                      </a>
                      {!readOnly && <button className="pf-pin" onClick={() => setPerf(p.url)}>확정</button>}
                    </div>
                  ))}
                  {perf.length > 1 && (
                    <details className="md-perf-more">
                      <summary>다른 후보 {perf.length - 1}건</summary>
                      {perf.filter(p => !p.auto).map(p => (
                        <div key={p.url} className="md-perf-item">
                          <a className="md-perf-row" href={p.url} target="_blank" rel="noopener noreferrer">
                            <span className="pf-title">{p.title}</span>
                            <span className="pf-meta">{p.meta}</span>
                          </a>
                          {!readOnly && <button className="pf-pin" onClick={() => setPerf(p.url)}>선택</button>}
                        </div>
                      ))}
                    </details>
                  )}
                </div>
              ) : (
                <div className="md-perf">
                  <div className="md-perf-title">
                    집행 실적 후보 <small>{readOnly ? '게시 시점만으로 추정' : '제목이 겹치는 게시물이 없어 게시 시점으로만 추렸음'}</small>
                  </div>
                  {perf.map(p => (
                    <div key={p.url} className="md-perf-item">
                      <a className="md-perf-row" href={p.url} target="_blank" rel="noopener noreferrer">
                        <span className="pf-title">{p.title}</span>
                        <span className="pf-meta">{p.meta}</span>
                      </a>
                      {!readOnly && (
                        <button className="pf-pin" onClick={() => setPerf(p.url)}>선택</button>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
            {specName && onOpenSpec && (
              <button className="md-spec-link" onClick={() => { onOpenSpec(specName); onClose() }}>
                이 매체 규격과 납기 보기
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
            <div className="md-ch">{`${isTeam ? '팀 ' : isShoot ? '촬영 ' : ''}일정 ${isNew ? '등록' : '수정'}`}</div>
            {isNew && (
              <input
                className="qa-input md-quick" type="text" autoComplete="off" autoFocus
                placeholder={mobile
                  ? (isTeam ? '예: 노규빈 연차' : '예: 인스타 릴스 여름 룩북 #여름')
                  : isTeam
                    ? `예: 노규빈 연차${expanded ? ' (아래 폼이 자동으로 채워짐)' : ''}`
                    : `예: 본사 인스타 릴스 촬영 #여름${expanded ? ' (아래 폼이 자동으로 채워짐)' : ''}`}
                value={quick}
                onChange={e => applyQuick(e.target.value)}
              />
            )}
            {!expanded && (
              <>
                <div className="qa-status md-mini">
                  <span className="st got">{f.endDate ? `${fmtDot(f.date)} ~ ${fmtDot(f.endDate)}` : fmtDot(f.date)}</span>
                  <span className="st got"><ChannelIcon id={f.channel} /> {channelById(f.channel)?.label || f.channel}{subsSel.length ? ` ${subsSel.join(', ')}` : f.sub ? ` ${f.sub}` : ''}</span>
                  {subsSel.length > 1 && <span className="st camp">{subsSel.length}건 동시 등록</span>}
                  {f.campaign && <span className="st camp">#{f.campaign}</span>}
                  {f.title ? <span className="st ttl">{f.title}</span> : <span className="st miss">내용을 위에 입력</span>}
                </div>
                {!isTeam && campaigns.length > 0 && (
                  <div className="qa-suggest md-camp-quick">
                    캠페인:
                    {campaigns.slice(0, 4).map(c => (
                      <button key={c} type="button" className={f.campaign === c ? 'on' : ''}
                        onClick={() => set('campaign', f.campaign === c ? '' : c)}>#{c}</button>
                    ))}
                  </div>
                )}
                <button className="md-expand" onClick={() => setExpanded(true)}>상세 입력 펼치기</button>
              </>
            )}
            <div className="md-form" style={expanded ? undefined : { display: 'none' }}>
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
                <label>{isTeam ? '유형' : '매체'}
                  <select value={f.channel} onChange={e => { set('channel', e.target.value); set('sub', ''); setSubsSel([]) }}>
                    {(isTeam ? TEAM_TYPES : isShoot ? CHANNELS.filter(c => SHOOT_CHANNELS.has(c.id)) : CHANNELS)
                      .map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                {!(multiSub && subs.length > 0) && (
                  <label>세부
                    <select value={f.sub} onChange={e => set('sub', e.target.value)} disabled={subs.length === 0}>
                      <option value="">{subs.length ? '선택' : ''}</option>
                      {subs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {multiSub && subs.length > 0 && (
                <label>세부 (체크한 만큼 동시 등록){subsSel.length > 1 ? ` (${subsSel.length}건)` : ''}
                  <div className="sub-pick">
                    {subs.map(s => (
                      <button type="button" key={s} className={subsSel.includes(s) ? 'on' : ''} onClick={() => toggleSub(s)}>{s}</button>
                    ))}
                    {subs.length > 2 && (
                      <button type="button" className="sub-all"
                        onClick={() => setSubsSel(subsSel.length === subs.length ? [] : [...subs])}>
                        {subsSel.length === subs.length ? '전체 해제' : '전체 선택'}
                      </button>
                    )}
                  </div>
                </label>
              )}
              <div className="md-cols">
                {!isTeam && (
                  <label>캠페인
                    <input list="campaign-list" value={f.campaign} onChange={e => set('campaign', e.target.value)} placeholder="예: 크리스마스" />
                    <datalist id="campaign-list">
                      {campaigns.map(c => <option key={c} value={c} />)}
                    </datalist>
    {campSuggest.length > 0 ? (
                      <span className="qa-suggest">
                        기존:
                        {campSuggest.map(c => (
                          <button key={c} type="button" onClick={() => set('campaign', c)}>#{c}</button>
                        ))}
                      </span>
                    ) : !f.campaign && campaigns.length > 0 && (
                      /* 캠페인 미입력 시 최근 캠페인 바로 선택 ('26.7 — 클릭 등록 편의) */
                      <span className="qa-suggest">
                        최근:
                        {campaigns.slice(0, 5).map(c => (
                          <button key={c} type="button" onClick={() => set('campaign', c)}>#{c}</button>
                        ))}
                      </span>
                    )}
                  </label>
                )}
                <label>작성자
                  <input value={f.owner} onChange={e => set('owner', e.target.value)} />
                </label>
              </div>
              <label>메모와 참고 링크
                <textarea rows={3} value={f.memo} onChange={e => set('memo', e.target.value)}
                  placeholder="설명이나 참고 링크" />
              </label>
            </div>
            <div className="md-actions">
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={() => (isNew ? onClose() : setEditing(false))}>취소</button>
              <button className="btn-solid" disabled={!f.title.trim() || !f.date} onClick={save}>{isNew ? '등록' : '저장'}</button>
            </div>
          </>
        )}
    </ModalShell>
  )
}

/* ── 노션 삭제 검토 배너 ('26.7) — 노션에서 지워진 동기화 일정을 사람이 [삭제/유지]로
   결정 (자동 삭제 안 함, 사용자 결정). NOTION_REVIEW_EMAILS 계정에만 노출.
   유지 = 연동 분리(notion_id 제거 — 다시 안 뜸), 삭제 = 2단계 확인 후 실제 삭제 ── */
function NotionReview({ list, onResolve }) {
  const [open, setOpen] = useState(false)
  const [arm, setArm] = useState(null)
  return (
    <div className="notion-review">
      <button className="nr-head" onClick={() => setOpen(o => !o)}>
        노션에서 삭제된 일정 <b>{list.length}건</b>, 우리 캘린더에서 지울지 확인 필요
        <span className="nr-chev">{open ? '접기' : '확인'}</span>
      </button>
      {open && list.map(e => (
        <div key={e.id} className="nr-row">
          <ChannelIcon id={e.channel} />
          <span className="nr-title">{displayTitle(e.title, e.channel)}</span>
          <span className="mute">{fmtRange(e)}</span>
          <span className="md-spacer" />
          <button className="btn-ghost sm" onClick={() => onResolve(e.id, true)}>유지 (연동만 분리)</button>
          <button className={'btn-ghost sm danger' + (arm === e.id ? ' arm' : '')}
            onClick={() => { if (arm !== e.id) { setArm(e.id); return } setArm(null); onResolve(e.id, false) }}>
            {arm === e.id ? '한 번 더' : '삭제'}
          </button>
        </div>
      ))}
    </div>
  )
}

/* 좌측 패널 미니 먼스 (v2 '26.7.29) — 내비 전용: 화살표로 월 이동, 오늘·일정 있는 날 표시.
   주 시작은 본 그리드와 동일(일요일). 크게 보기 토글 시 패널째 숨김 */
function MiniMonth({ cursor, onCursor, events }) {
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const cells = []
  const d = new Date(start)
  while (d <= last || d.getDay() !== 0) {
    cells.push({ iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === m })
    d.setDate(d.getDate() + 1)
  }
  const has = useMemo(() => {
    const s = new Set()
    for (const e of events) {
      if (e.kind === '휴점') continue
      const a = fromISO(e.date), b = fromISO(e.endDate || e.date)
      for (let x = new Date(a); x <= b; x.setDate(x.getDate() + 1)) {
        if (x.getFullYear() === y && x.getMonth() === m) s.add(toISO(x))
      }
    }
    return s
  }, [events, y, m])
  const todayIso = toISO(new Date())
  return (
    <div className="mini-cal">
      <div className="mini-head">
        <button onClick={() => onCursor(new Date(y, m - 1, 1))} aria-label="이전 달">‹</button>
        <span className="mini-title">{y}.{String(m + 1).padStart(2, '0')}</span>
        <button onClick={() => onCursor(new Date(y, m + 1, 1))} aria-label="다음 달">›</button>
      </div>
      <div className="mini-grid">
        {DOW.map(w => <span key={w} className="mini-dow">{w}</span>)}
        {cells.map(c => (
          <span key={c.iso}
            className={'mini-d' + (c.inMonth ? '' : ' out')
              + (c.iso === todayIso ? ' today' : c.inMonth && has.has(c.iso) ? ' has' : '')}>
            {c.day}
          </span>
        ))}
      </div>
    </div>
  )
}

function CalendarApp({ session, readOnly = false, onOpenSpec, shoot = false, team = false, initialView = null }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [filter, setFilter] = useState('전체')
  /* 홈 KPI에서 넘어오면 그 세그로 시작 ('26.7.29 — 캠페인 지표 클릭 = 캠페인 뷰) */
  const [view, setView] = useState(initialView || '월간')
  useEffect(() => { if (initialView) setView(initialView) }, [initialView])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [groupSel, setGroupSel] = useState(null)   // 타겟APP 묶음 클릭 → 세부 선택 시트
  const [dayDraft, setDayDraft] = useState(null)   // 날짜 셀 클릭 → 신규 등록 모달
  const [daySel, setDaySel] = useState(null)       // 일자 숫자·더보기 클릭 → 하루 일정 시트
  const [campFocus, setCampFocus] = useState(null) // 캠페인 뷰에서 선택한 캠페인 (null = 전체)
  /* 크게 보기 (v2 '26.7.29) — 좌측 패널(미니 먼스·필터) 숨김 + 본문 폭 확장. 브라우저별 기억 */
  const [big, setBig] = useState(() => { try { return localStorage.getItem('calBig') === '1' } catch { return false } })
  const toggleBig = () => setBig(b => {
    const v = !b
    try { localStorage.setItem('calBig', v ? '1' : '0') } catch { /* 프라이빗 모드 등 */ }
    return v
  })
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
      const ev = await createEvent(orderRange({
        ...e,
        /* 이름 자동 병기는 근태·기념일만 — 업무 일정(회의·마감)은 팀 공용이라 제외 ('26.7) */
        ...(e.kind === '팀' && e.channel !== '업무' ? { title: withAuthorName(e.title, me) } : {}),
        owner: e.owner || me || null,
      }))
      setEvents(prev => [...prev, ev].sort((a, b) => a.date.localeCompare(b.date)))
      toast('일정 등록됨')
    } catch (err) { setError(err.message) }
  }
  const onSave = async (id, patch) => {
    try {
      const ev = await updateEvent(id, orderRange(patch))
      setEvents(prev => prev.map(x => (x.id === id ? ev : x)))
      setSelected(sel => (sel?.id === id ? ev : sel))   // 열린 모달도 즉시 갱신 (실적 확정 등)
      toast('저장됨')
    } catch (err) { setError(err.message) }
  }
  /* 노션 삭제 검토 ('26.7) — 규빈 계정 + 매체 캘린더 탭에서만. 유지 = 연동 분리, 삭제 = 실삭제 */
  const notionGoneList = useMemo(() => (
    readOnly || team || shoot || !NOTION_REVIEW_EMAILS.includes((session?.email || '').toLowerCase())
      ? [] : events.filter(e => e.notionGone)
  ), [events, readOnly, team, shoot, session])
  const onNotionResolve = async (id, keep) => {
    try {
      await resolveNotionGone(id, keep)
      setEvents(prev => keep
        ? prev.map(x => (x.id === id ? { ...x, notionGone: false, notionId: null } : x))
        : prev.filter(x => x.id !== id))
    } catch (err) { setError(err.message) }
  }

  /* 이미지 첨부 메타만 부분 갱신 ('26.7) — 목록·열린 모달 즉시 반영 */
  const onImages = async (id, images) => {
    const ev = await updateEventImages(id, images)
    setEvents(prev => prev.map(x => (x.id === id ? ev : x)))
    setSelected(sel => (sel?.id === id ? ev : sel))
  }
  const onDelete = async id => {
    try {
      await deleteEvent(id)
      setEvents(prev => prev.filter(x => x.id !== id))
      toast('삭제됨', { danger: true })
    } catch (err) { setError(err.message) }
  }
  const onRename = async (from, to) => {
    try {
      await renameCampaign(from, to)
      await refresh()
    } catch (err) { setError(err.message) }
  }

  /* 드래그앤드롭 이동 ('26.7) — 집어든 셀 → 놓은 셀 날짜 차만큼 평행이동 (기간 유지).
     updateEvent는 전체 필드를 보내야 해서(toDb) 기존 값으로 채움 — perfUrl은 미포함(확정 불변).
     이동 직후 8초간 "실행 취소" 바 노출 (실수 이동 즉시 복구) */
  const [undo, setUndo] = useState(null)
  const undoTimer = useRef(null)
  const addDays = (iso, n) => toISO(new Date(fromISO(iso).getTime() + n * 86400000))
  const moveFields = (e, date, endDate) => ({
    title: e.title, date, endDate: endDate || null, channel: e.channel,
    sub: e.sub || null, campaign: e.campaign || null,
    owner: e.owner || null, memo: e.memo || null, kind: e.kind || null,
  })
  const applyMove = async (id, fields) => {
    const ev = await updateEvent(id, fields)
    setEvents(prev => prev.map(x => (x.id === id ? ev : x)).sort((a, b) => a.date.localeCompare(b.date)))
    return ev
  }
  const onMove = async (e, srcDay, dstDay) => {
    const delta = Math.round((fromISO(dstDay) - fromISO(srcDay)) / 86400000)
    if (!delta) return
    const targets = e.group?.length > 1 ? e.group : [e]   // 타겟APP 묶음은 형제 전체 이동
    try {
      const prev = targets.map(t => ({ id: t.id, fields: moveFields(t, t.date, t.endDate) }))
      for (const t of targets)
        await applyMove(t.id, moveFields(t, addDays(t.date, delta), t.endDate ? addDays(t.endDate, delta) : null))
      clearTimeout(undoTimer.current)
      setUndo({ items: prev, from: e.date, to: addDays(e.date, delta), title: e.title, channel: e.channel, n: targets.length })
      undoTimer.current = setTimeout(() => setUndo(null), 8000)
    } catch (err) { setError(err.message) }
  }
  const onUndo = async () => {
    if (!undo) return
    clearTimeout(undoTimer.current)
    try {
      for (const it of undo.items) await applyMove(it.id, it.fields)
    } catch (err) { setError(err.message) }
    setUndo(null)
  }

  /* 탭별 대상: 촬영 탭 = kind '촬영' / 팀 탭 = kind '팀' / 매체 캘린더 = 그 외 전부.
     휴점일(kind='휴점')은 일정 행이 아니라 셀 마커라 전 탭에서 목록 제외 */
  const kindEvents = useMemo(
    () => events.filter(e => e.kind !== '휴점' && (
      team ? e.kind === '팀' : shoot ? e.kind === '촬영' : (e.kind !== '촬영' && e.kind !== '팀'))),
    [events, shoot, team]
  )

  /* 휴점일 ('26.7): UI 등록(kind='휴점') + 정적 CLOSED_DAYS 병합 → 셀 틴트.
     closedDays[iso] = 표시 라벨 · closedEvt[iso] = DB 레코드(있으면 해제 가능) */
  const { closedDays, closedEvt } = useMemo(() => {
    const days = { ...CLOSED_DAYS }, evt = {}
    for (const e of events) {
      if (e.kind !== '휴점') continue
      const s = fromISO(e.date), end = fromISO(e.endDate || e.date)
      for (let d = new Date(s); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = toISO(d)
        days[iso] = '휴점'
        evt[iso] = e
      }
    }
    return { closedDays: days, closedEvt: evt }
  }, [events])

  /* 한 줄 입력 "휴점"·날짜 셀 시트에서 등록/해제 */
  const addClosed = async ({ date, endDate }) => {
    await onCreate({ title: '휴점', channel: '휴점', campaign: null, kind: '휴점', date, endDate: endDate || null })
  }
  const removeClosed = async iso => {
    const e = closedEvt[iso]
    if (e) await onDelete(e.id)
  }
  const chipChannels = team ? TEAM_TYPES : shoot ? CHANNELS.filter(c => SHOOT_CHANNELS.has(c.id)) : CHANNELS
  const filtered = filter === '전체' ? kindEvents : kindEvents.filter(e => e.channel === filter)

  /* 기념일 매년 반복 ('26.7) — 표시 시점에 앞뒤 연도로 투영 (원본 1건 불변, 수정은 원본에).
     2/29 등록분은 평년에 해당 셀이 없어 그 해엔 자연히 표시 안 됨 */
  const monthEvents = useMemo(() => {
    if (!team) return filtered
    const out = []
    const y = cursor.getFullYear()
    for (const e of filtered) {
      if (e.channel === '기념일') {
        const mmdd = e.date.slice(5)
        for (const yy of [y - 1, y, y + 1]) out.push({ ...e, date: `${yy}-${mmdd}`, endDate: null, orig: e })
      } else out.push(e)
    }
    return out
  }, [filtered, team, cursor])
  /* 캠페인 제안 목록 ('26.7 필터) — 마지막 게시 후 2개월 지난 캠페인은 제안에서 제외,
     최근 게시순 정렬. "#"만 쳤을 때 옛 캠페인이 전부 쏟아지는 문제 방지.
     (캠페인 뷰의 보관 목록에는 계속 보임 — 제안에서만 빠짐) */
  const campaigns = useMemo(() => {
    const last = {}
    for (const e of events) {
      if (!e.campaign) continue
      const d = e.endDate || e.date
      if (!last[e.campaign] || d > last[e.campaign]) last[e.campaign] = d
    }
    const c = new Date(); c.setMonth(c.getMonth() - 2)
    const cutoff = toISO(c)
    return Object.keys(last)
      .filter(k => last[k] >= cutoff)
      .sort((a, b) => last[b].localeCompare(last[a]))
  }, [events])
  const monthLabel = `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`
  const searching = search.trim().length > 0

  /* 캠페인 뷰 ('26.7) — 선택 캠페인이 사라지면(삭제·이름 변경) 자동으로 전체로 복귀 */
  const campNames = useMemo(() => new Set(filtered.filter(e => e.campaign).map(e => e.campaign)), [filtered])
  useEffect(() => { if (campFocus && !campNames.has(campFocus)) setCampFocus(null) }, [campFocus, campNames])

  return (
    <div className={'wrap cal-wrap' + (readOnly ? ' wide' : '') + (!readOnly && big ? ' big' : '')}>
      <header>
        <h1>{team ? '팀 일정' : shoot ? '촬영 일정 캘린더' : '매체 일정 캘린더'}</h1>
        <div className="masthead-sub">
          {team
            ? '연차, 외근, 교육, 기념일을 빠른 입력 한 줄로 등록'
            : shoot
              ? '콘텐츠 촬영 스케줄 ("7/10 촬영 7/15 업로드"로 병기하면 업로드 건은 매체 캘린더에 자동 등록)'
              : readOnly
                ? '읽기 전용 공유 뷰 (등록과 수정은 팀 내부에서만)'
                : '빠른 입력 한 줄로 등록, 클릭해서 수정하거나 삭제'}
        </div>
        {session && !readOnly && !team && (
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
          현재 <b>이 브라우저에만</b> 저장 중, 팀 공유를 켜려면 Supabase 연동 (data/supabase-setup.md)
        </div>
      )}
      {error && <div className="store-err">{error}</div>}

      {notionGoneList.length > 0 && (
        <NotionReview list={notionGoneList} onResolve={onNotionResolve} />
      )}

      {!readOnly && (
        <QuickAdd onCreate={onCreate} campaigns={campaigns} events={events} shoot={shoot} team={team} />
      )}

      <div className="cal-search-row">
        <span className="io-label">검색</span>
        <input
          className="cal-search" type="search" autoComplete="off"
          placeholder={team
            ? (isMobile() ? '이름, 유형, 메모로 찾기' : '이름, 유형, 메모, 작성자로 찾기')
            : (isMobile() ? '제목, 캠페인, 작성자로 찾기' : '제목, 캠페인, 메모, 작성자, 매체로 찾기')}
          value={search} onChange={e => setSearch(e.target.value)}
        />
        {searching && <button className="cal-search-clear" onClick={() => setSearch('')}>지우기</button>}
      </div>

      {!searching && (
        <div className="cal-controls">
          {!team && (
            <div className="seg">
              {['월간', '캠페인'].map(v => (
                <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>
              ))}
            </div>
          )}
          {(view === '월간' || view === '캠페인') && (
            <div className="cal-nav">
              <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>◀</button>
              <span className="cal-month">{monthLabel}</span>
              <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>▶</button>
              <button className="cal-today" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}>오늘</button>
            </div>
          )}
          {!readOnly && (
            /* 크게 보기 (v2) — 좌측 패널을 접고 그리드를 넓게 */
            <button className={'cal-big-btn' + (big ? ' on' : '')} onClick={toggleBig}>
              {big ? '기본 보기' : '크게 보기'}
            </button>
          )}
        </div>
      )}

      {/* 미러(readOnly)는 기존 가로 필터 유지 — 좌측 패널은 팀용 화면 전용 */}
      {!searching && readOnly && (
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
        <div className="empty">불러오는 중</div>
      ) : searching ? (
        <SearchResults events={kindEvents} query={search} onSelect={setSelected} />
      ) : readOnly ? (
        view === '월간' || team ? (
          <MonthGrid
            cursor={cursor} events={monthEvents} onSelect={e => setSelected(e.orig || e)}
            onDayClick={null} wide
            onMove={null} onGroup={setGroupSel} onDay={setDaySel}
            closedDays={closedDays}
          />
        ) : (
          <CampaignView
            events={filtered} focus={campFocus} onFocus={setCampFocus}
            onSelect={e => setSelected(e.orig || e)} onRename={null}
            cursor={cursor} onDayClick={null} wide
            onMove={null} onGroup={setGroupSel} onDay={setDaySel}
            closedDays={closedDays} />
        )
      ) : (
        /* v2 레이아웃 — 좌측 패널(미니 먼스 + 필터) + 본문. 크게 보기 시 패널 숨김 */
        <div className="cal-layout">
          {!big && (
            <aside className="cal-side">
              <MiniMonth cursor={cursor} onCursor={setCursor} events={monthEvents} />
              <div className="side-filter">
                <div className="side-filter-t">{team ? '유형' : '매체'}</div>
                {['전체', ...chipChannels.map(c => c.id)].map(id => (
                  <button key={id} className={id === filter ? 'on' : ''} onClick={() => setFilter(id)}>
                    {id !== '전체' && <ChannelIcon id={id} />}
                    {id === '전체' ? '전체' : channelById(id).label}
                  </button>
                ))}
              </div>
            </aside>
          )}
          <div className="cal-main">
            {view === '월간' || team ? (
              <MonthGrid
                cursor={cursor} events={monthEvents} onSelect={e => setSelected(e.orig || e)}
                onDayClick={setDayDraft} wide={false}
                onMove={onMove} onGroup={setGroupSel} onDay={setDaySel}
                closedDays={closedDays}
              />
            ) : (
              <CampaignView
                events={filtered} focus={campFocus} onFocus={setCampFocus}
                onSelect={e => setSelected(e.orig || e)} onRename={onRename}
                perf={!shoot}
                cursor={cursor} onDayClick={setDayDraft} wide={false}
                onMove={onMove} onGroup={setGroupSel} onDay={setDaySel}
                closedDays={closedDays} />
            )}
          </div>
        </div>
      )}

      {!loading && !searching && !readOnly && storageMode === 'supabase' && (
        <DeletedLog shoot={shoot} team={team} />
      )}

      {selected && (
        <EventModal
          event={selected} campaigns={campaigns} readOnly={readOnly} onOpenSpec={onOpenSpec}
          onClose={() => setSelected(null)} onSave={onSave} onDelete={onDelete} onImages={onImages}
        />
      )}

      {dayDraft && !readOnly && (
        <EventModal
          isNew
          event={{ title: '', date: dayDraft, endDate: '', channel: team ? '연차' : shoot ? '인스타' : '기타', sub: '', campaign: '', owner: me, memo: '', kind: team ? '팀' : shoot ? '촬영' : null }}
          campaigns={campaigns}
          onClose={() => setDayDraft(null)} onCreate={onCreate}
        />
      )}

      {undo && !readOnly && (
        <div className="undo-bar">
          <span className="undo-msg">
            "{displayTitle(undo.title, undo.channel)}"{undo.n > 1 ? ` ×${undo.n}` : ''} {fmtDot(undo.from)}에서 {fmtDot(undo.to)}로 이동됨
          </span>
          <button className="undo-btn" onClick={onUndo}>실행 취소</button>
        </div>
      )}

      {daySel && (
        <DaySheet
          iso={daySel} events={monthEvents} readOnly={readOnly}
          closedDays={closedDays} canUnclose={!!closedEvt[daySel]} onUnclose={removeClosed}
          onClose={() => setDaySel(null)}
          onSelect={e => { setDaySel(null); setSelected(e.orig || e) }}
          onRegister={() => { setDayDraft(daySel); setDaySel(null) }}
        />
      )}

      {groupSel && (
        <ModalShell onClose={() => setGroupSel(null)}>
            <div className="md-ch"><ChannelIcon id="타겟APP" /> 타겟APP {groupSel.length}개 매체 동시 집행</div>
            <div className="md-title">{displayTitle(groupSel[0].title, groupSel[0].channel)}</div>
            <dl className="md-grid"><dt>일자</dt><dd>{fmtRange(groupSel[0])}</dd></dl>
            <div className="group-list">
              {groupSel.map(e => (
                <button key={e.id} className="group-item" onClick={() => { setGroupSel(null); setSelected(e) }}>
                  <span className="gi-sub">{e.sub || '세부 미지정'}</span>
                  <span className="gi-go">상세</span>
                </button>
              ))}
            </div>
            <div className="md-actions">
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={() => setGroupSel(null)}>닫기</button>
            </div>
        </ModalShell>
      )}

    </div>
  )
}

/* 로그인 게이트는 App.jsx(사이트 전체 락)에서 처리 — 여기 도달했다면 이미 인증된 상태.
   readOnly(?view=mirror)는 뷰어 계정용 UI — 쓰기 권한은 RLS의 team_writers 등록 여부가 결정
   (setup.md 4장) */
export default function CalendarPage({ readOnly = false, onOpenSpec, shoot = false, team = false, initialView = null }) {
  const [session, setSession] = useState(getSession())
  useEffect(() => onAuthChange(setSession), [])

  return <CalendarApp session={session} readOnly={readOnly} onOpenSpec={onOpenSpec} shoot={shoot} team={team} initialView={initialView} />
}
