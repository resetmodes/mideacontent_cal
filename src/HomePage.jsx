import React, { useState, useEffect, useMemo } from 'react'
import { listEvents } from './lib/store.js'
import { channelById } from './data/channels.js'
import { HOLIDAYS } from './data/holidays.js'
import { toISO, fromISO, displayTitle } from './lib/parse.js'
import { YT } from './data/sns/youtube.js'
import { IG } from './data/sns/instagram.js'
import { buildHighlights } from './MonitorPage.jsx'
import ChannelIcon from './ChannelIcon.jsx'

/* 홈 ('26.7) — 접속 첫 화면. 중요도순: ⓪ 이번 주 요약 히어로(큰 숫자) ① 오늘·내일 팀원 근태
   ② 주요 콘텐츠 D-day(캠페인) ③ 이번 주 촬영 ④ 채널 이슈(모니터링 하이라이트 재사용)
   ⑤ 이번 주 하이라이트(수집 콘텐츠 중 반응 상위, 유튜브 썸네일).
   섹션은 데이터 없으면 숨김(근태만 "부재 없음" 상태 문구 유지 — 상태 자체가 정보).
   ※ 추후 섹션 추가 자리: 아래 SECTIONS 순서에 컴포넌트만 끼우면 됨 */

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d) }
const fmtK = iso => { const d = fromISO(iso); return `${d.getMonth() + 1}.${d.getDate()} (${DOW_KO[d.getDay()]})` }
const compact = n => {
  if (n == null) return '—'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(1) + '만'
  return n.toLocaleString('ko-KR')
}

/* ── 이번 주 요약 계산 — 히어로 카드·인사 헤드라인이 공유 (v2 2차) ── */
function useWeekStats(events, today) {
  return useMemo(() => {
    const end7 = addDays(today, 7)
    const media = events.filter(e => !e.kind)
    const posts = media.filter(e => e.date >= today && e.date <= end7).length
    const todayPosts = media.filter(e => e.date === today).length
    const campaigns = new Set(
      media.filter(e => e.campaign && (e.endDate || e.date) >= today && e.date <= addDays(today, 21))
        .map(e => e.campaign)
    ).size
    const shoots = events.filter(e => e.kind === '촬영' && e.date >= today && e.date <= end7).length
    const todayShoots = events.filter(e => e.kind === '촬영' && e.date === today).length
    /* 부재는 "오늘" 기준 ('26.7 변경) — 오늘이 기간에 포함되는 근태만 (기념일·업무 일정 제외) */
    const away = events.filter(e =>
      e.kind === '팀' && e.channel !== '기념일' && e.channel !== '업무' &&
      e.date <= today && (e.endDate || e.date) >= today
    ).length
    return { posts, todayPosts, campaigns, shoots, todayShoots, away }
  }, [events, today])
}

/* ── ⓪ 이번 주 요약 히어로 — KPI 글래스 카드 4개 (모니터링 탭과 동일 카드 언어).
   각 지표 클릭 시 해당 탭으로 이동 (게시 예정·캠페인→매체 캘린더, 촬영→촬영 캘린더, 부재→팀 일정) */
function WeekHero({ s, onGo }) {
  const stats = [
    { label: '이번 주 게시 예정', value: s.posts, unit: '건', sub: '오늘부터 7일', to: 'calendar' },
    { label: '진행·예정 캠페인', value: s.campaigns, unit: '개', sub: '3주 내 기준', to: 'calendar' },
    { label: '이번 주 촬영', value: s.shoots, unit: '건', sub: '유튜브·인스타', to: 'shoot' },
    { label: '오늘 팀원 부재', value: s.away, unit: '건', sub: '연차·외근·출장·교육', to: 'team' },
  ]

  return (
    <div className="mon-hero home-hero">
      {stats.map(st => (
        <button key={st.label} className="mon-stat home-stat" onClick={() => onGo(st.to)}>
          <div className="mon-label">{st.label}</div>
          <div className="mon-value">{st.value}<small>{st.unit}</small></div>
          <div className="mon-sub">{st.sub} <span className="home-stat-go">→</span></div>
        </button>
      ))}
    </div>
  )
}

/* ── ① 오늘의 팀 — 근태·부재 (kind='팀', 업무 제외). 매체 일정과 패널 분리 (v2 2차 —
   시안에서 팀·매체가 한 리스트에 섞여 보인다는 지적 → 전용 패널 2개로 구분) ── */
function TeamStatus({ events, today, onGo }) {
  const tomorrow = addDays(today, 1)
  const covers = (e, iso) => (e.channel === '기념일'
    ? e.date.slice(5) === iso.slice(5)
    : e.date <= iso && iso <= (e.endDate || e.date))
  const team = events.filter(e => e.kind === '팀' && e.channel !== '업무')   // 업무 일정은 전용 섹션에
  const rows = [
    { label: '오늘', iso: today, list: team.filter(e => covers(e, today)) },
    { label: '내일', iso: tomorrow, list: team.filter(e => covers(e, tomorrow)) },
  ]
  const empty = rows.every(r => r.list.length === 0)

  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        오늘의 팀
        <button className="home-more" onClick={() => onGo('team')}>팀 일정 전체 →</button>
      </div>
      <div className="home-sec-d">근태·부재 — 연차·반차·외근·출장·교육 (팀 일정 기준)</div>
      {empty ? (
        <div className="home-allin">오늘·내일 부재 일정 없음 — 전원 근무</div>
      ) : rows.map(r => r.list.length > 0 && (
        <div key={r.label} className="home-day">
          <span className="home-daylabel">{r.label} <small>{fmtK(r.iso)}</small></span>
          <div className="home-dayrows">
            {r.list.map(e => (
              <div key={e.id + r.label} className="home-trow">
                <ChannelIcon id={e.channel} />
                <span className="home-ttl">{displayTitle(e.title, e.channel)}</span>
                {e.endDate && e.endDate !== e.date && (
                  <span className="home-sub">{fmtK(e.date)}~{fmtK(e.endDate)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/* ── ①-a 오늘·내일 게시·촬영 — 매체 캘린더(kind 없음) + 촬영(kind='촬영')만.
   팀 근태와 명확히 분리된 매체 실행 패널 (v2 2차) ── */
function MediaToday({ events, today, onGo }) {
  const tomorrow = addDays(today, 1)
  const covers = (e, iso) => e.date <= iso && iso <= (e.endDate || e.date)
  const media = events.filter(e => (!e.kind || e.kind === '촬영') && e.channel !== '휴점')
  const rows = [
    { label: '오늘', iso: today, list: media.filter(e => covers(e, today)) },
    { label: '내일', iso: tomorrow, list: media.filter(e => covers(e, tomorrow)) },
  ]
  const empty = rows.every(r => r.list.length === 0)

  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        오늘·내일 게시
        <button className="home-more" onClick={() => onGo('calendar')}>매체 캘린더 →</button>
      </div>
      <div className="home-sec-d">매체 집행·촬영 일정 (매체 캘린더·촬영일정 탭 기준)</div>
      {empty ? (
        <div className="home-allin">오늘·내일 예정된 게시·촬영 없음</div>
      ) : rows.map(r => r.list.length > 0 && (
        <div key={r.label} className="home-day">
          <span className="home-daylabel">{r.label} <small>{fmtK(r.iso)}</small></span>
          <div className="home-dayrows">
            {r.list.slice(0, 6).map(e => (
              <div key={e.id + r.label} className="home-trow">
                <ChannelIcon id={e.channel} />
                <span className="home-ttl">{displayTitle(e.title, e.channel)}</span>
                <span className="home-sub">
                  {e.kind === '촬영' ? '촬영' : e.date === r.iso ? '게시' : '진행중'}
                  {e.campaign ? ` · #${e.campaign}` : ''}
                </span>
              </div>
            ))}
            {r.list.length > 6 && <div className="home-allin">외 {r.list.length - 6}건 — 매체 캘린더에서 확인</div>}
          </div>
        </div>
      ))}
    </section>
  )
}

/* ── ①-b 주요 업무·마감 ('26.7) — 팀 일정의 "업무" 유형(회의·자료 마감 등)만 모아
   D-day로 표시. 근태 섹션과 분리 — 부재가 아니라 팀 공용 할 일이므로.
   오늘~3주 내(진행중 포함) 최대 6건, 임박순 */
function WorkDeadlines({ events, today, onGo }) {
  const list = useMemo(() => {
    const horizon = addDays(today, 21)
    return events
      .filter(e => e.kind === '팀' && e.channel === '업무')
      .filter(e => (e.endDate || e.date) >= today && e.date <= horizon)
      .map(e => {
        const ongoing = e.date <= today
        const dday = ongoing ? 0 : Math.round((fromISO(e.date) - fromISO(today)) / 86400000)
        return { ...e, ongoing, dday }
      })
      .sort((a, b) => a.dday - b.dday || a.date.localeCompare(b.date))
      .slice(0, 6)
  }, [events, today])

  if (list.length === 0) return null
  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        주요 업무·마감
        <button className="home-more" onClick={() => onGo('team')}>팀 일정 전체 →</button>
      </div>
      <div className="home-sec-d">팀 공용 업무 D-day — 회의·보고·자료 마감 (3주 내)</div>
      {list.map(e => (
        <div key={e.id} className="home-trow">
          <span className={'home-dday' + (e.dday === 0 ? ' run' : '')}>
            {e.ongoing && e.endDate ? '진행중' : e.dday === 0 ? '오늘' : `D-${e.dday}`}
          </span>
          <span className="home-ttl"><ChannelIcon id="업무" /> {e.title}</span>
          <span className="home-sub">{e.endDate && e.endDate !== e.date ? `${fmtK(e.date)}~${fmtK(e.endDate)}` : fmtK(e.date)}</span>
        </div>
      ))}
    </section>
  )
}

/* ── ② 주요 콘텐츠 — 캠페인 단위 D-day ─────────────────────── */
function CampaignDday({ events, today, onGo }) {
  const groups = useMemo(() => {
    const horizon = addDays(today, 21)
    const map = {}
    for (const e of events) {
      if (e.kind || !e.campaign) continue
      const end = e.endDate || e.date
      if (end < today || e.date > horizon) continue   // 지난 것·3주 밖 제외
      ;(map[e.campaign] = map[e.campaign] || []).push(e)
    }
    return Object.entries(map).map(([name, list]) => {
      list.sort((a, b) => a.date.localeCompare(b.date))
      const next = list.find(e => e.date >= today)
      const ongoing = list.some(e => e.date <= today && today <= (e.endDate || e.date))
      const dday = next ? Math.round((fromISO(next.date) - fromISO(today)) / 86400000) : null
      return { name, list, next, ongoing, dday }
    }).sort((a, b) => (a.dday ?? -1) - (b.dday ?? -1)).slice(0, 6)
  }, [events, today])

  if (groups.length === 0) return null
  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        주요 콘텐츠
        <button className="home-more" onClick={() => onGo('calendar')}>매체 캘린더 →</button>
      </div>
      <div className="home-sec-d">캠페인 단위 D-day — 다음 게시 기준 (3주 내)</div>
      {groups.map(g => (
        <div key={g.name} className="home-trow camp">
          <span className={'home-dday' + (g.ongoing && (g.dday == null || g.dday > 0) ? ' run' : '')}>
            {g.ongoing && (g.dday == null || g.dday > 0) ? '진행중' : g.dday === 0 ? 'D-day' : `D-${g.dday}`}
          </span>
          <span className="home-camp">#{g.name}</span>
          {g.next && (
            <span className="home-ttl">
              <ChannelIcon id={g.next.channel} /> {displayTitle(g.next.title, g.next.channel)}
            </span>
          )}
          <span className="home-sub">{g.next ? fmtK(g.next.date) : ''}{g.list.length > 1 ? ` 외 ${g.list.length - 1}건` : ''}</span>
        </div>
      ))}
    </section>
  )
}

/* ── ③ 이번 주 촬영 — 촬영일정 탭 미리보기 (놓치기 쉬운 분리 탭 보완) ── */
function ShootWeek({ events, today, onGo }) {
  const list = useMemo(() => {
    const end7 = addDays(today, 7)
    return events
      .filter(e => e.kind === '촬영' && e.date >= today && e.date <= end7)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
  }, [events, today])

  if (list.length === 0) return null
  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        이번 주 촬영
        <button className="home-more" onClick={() => onGo('shoot')}>촬영일정 전체 →</button>
      </div>
      <div className="home-sec-d">유튜브·인스타 촬영 스케줄 (오늘부터 7일)</div>
      {list.map(e => (
        <div key={e.id} className="home-trow">
          <span className="home-dday">{e.date === today ? '오늘' : fmtK(e.date)}</span>
          <span className="home-ttl">
            <ChannelIcon id={e.channel} /> {displayTitle(e.title, e.channel)}
          </span>
          {e.sub && <span className="home-sub">{e.sub}</span>}
        </div>
      ))}
    </section>
  )
}

/* ── ④ 채널 이슈 — 모니터링 하이라이트 재사용 (팔로워 급변·휴면·조회 급등) ── */
function ChannelSignals({ onGo }) {
  /* 유튜브 조회 급등(url 있는 항목)은 아래 "이번 주 하이라이트"와 중복이라 제외 —
     여기서는 계정 단위 신호(팔로워 급증·급감, 새 휴면)만 최대 3건 */
  const items = useMemo(() => buildHighlights().filter(it => !it.url).slice(0, 3), [])
  if (items.length === 0) return null
  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        채널 이슈
        <button className="home-more" onClick={() => onGo('monitor')}>매체 모니터링 →</button>
      </div>
      <div className="home-sec-d">자사 계정 신호 — 팔로워 급증·급감, 새 휴면 진입</div>
      {items.map((it, i) => (
        <div key={i} className="home-trow">
          <span className={'hl-mark' + (it.up ? ' up' : '')}>{it.mark}</span>
          <span className="home-ttl">{it.text}</span>
        </div>
      ))}
    </section>
  )
}

/* ── ⑤ 이번 주 하이라이트 — 수집 콘텐츠 중 반응 상위 ─────────── */
const relDays = s => {
  const m = (s || '').match(/(\d+)\s*(second|minute|hour|day|week)s?\s+ago/)
  if (!m) return null
  const n = +m[1]
  return m[2] === 'week' ? n * 7 : m[2] === 'day' ? n : 0
}

function Highlight({ onGo }) {
  const yt = useMemo(() => {
    const avg = Object.fromEntries((YT.channels || []).map(c => [c.key, c.avgViews || 0]))
    const name = Object.fromEntries((YT.channels || []).map(c => [c.key, c.name]))
    return (YT.videos || [])
      .map(v => ({ ...v, days: relDays(v.date), chName: name[v.channel] }))
      .filter(v => v.days != null && v.days <= 7 && v.views > 0)
      .map(v => ({ ...v, ratio: avg[v.channel] > 0 ? v.views / avg[v.channel] : 1 }))
      .sort((a, b) => b.ratio - a.ratio || b.views - a.views)
      .slice(0, 3)
  }, [])

  const ig = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000
    return (IG.posts || [])
      .filter(p => new Date(p.ts).getTime() >= weekAgo)
      .map(p => ({ ...p, eng: (p.likes || 0) + (p.comments || 0) }))
      .sort((a, b) => b.eng - a.eng)
      .slice(0, 3)
  }, [])

  if (yt.length === 0 && ig.length === 0) return null
  return (
    <section className="home-sec">
      <div className="group-label home-gl">
        이번 주 하이라이트
        <button className="home-more" onClick={() => onGo('monitor')}>매체 모니터링 →</button>
      </div>
      <div className="home-sec-d">최근 7일 반응 상위 콘텐츠 — 유튜브 조회·인스타 반응 (수집분)</div>
      {yt.length > 0 && (
        <div className="home-vids">
          {yt.map(v => (
            <a key={v.url} className="home-vid" href={v.url} target="_blank" rel="noreferrer">
              {v.thumb
                ? <img src={v.thumb} alt="" loading="lazy" />
                : <span className="home-vid-noimg"><ChannelIcon id="유튜브" /></span>}
              <span className="home-vid-body">
                <b>{v.title}</b>
                <small>
                  {v.chName} · 조회 {compact(v.views)}
                  {v.ratio >= 2 && ` · 평균의 ${Math.round(v.ratio)}배`}
                </small>
              </span>
            </a>
          ))}
        </div>
      )}
      {ig.map(p => (
        <a key={p.url} className="home-trow link" href={p.url} target="_blank" rel="noreferrer">
          <ChannelIcon id="인스타" />
          <span className="home-ttl">{p.caption || '(캡션 없음)'}</span>
          <span className="home-sub">{p.likes == null ? '좋아요 비공개' : `좋아요 ${compact(p.likes)}`} · 댓글 {p.comments}</span>
        </a>
      ))}
    </section>
  )
}

/* ── 정산 배지 ('26.7 — SETTLE_EMAILS 3인 전용): 내 증빙 미첨부 건 알림 ── */
function SettleBadge({ onGo }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    Promise.all([
      import('./lib/settleStore.js'), import('./data/settle.js'), import('./lib/auth.js'),
    ]).then(([store, data, auth]) => store.listSettle().then(rows => {
      if (!alive || !Array.isArray(rows)) return
      const me = (auth.getSession()?.email || '').toLowerCase()
      setCount(rows.filter(r => !r.recurring && (r.owner_email || '').toLowerCase() === me && data.isMissingFiles(r)).length)
    })).catch(() => {})
    return () => { alive = false }
  }, [])
  if (!count) return null
  return (
    <button className="stl-badge" onClick={() => onGo('settle')}>
      정산 증빙 첨부 필요 <b>{count}건</b> — 정산 탭에서 첨부 →
    </button>
  )
}

/* RMN 영업 현황 카드는 '26.7.28 사용자 지시로 홈에서 제거 — 매출·미수금은 RMN 탭에서만 */

/* ── 홈 셸 ─────────────────────────────────────────────────── */
export default function HomePage({ onGo, canSettle }) {
  const [events, setEvents] = useState([])
  useEffect(() => { listEvents().then(setEvents).catch(() => {}) }, [])
  const today = toISO(new Date())
  const d = fromISO(today)
  const hol = HOLIDAYS[today]
  const s = useWeekStats(events, today)

  /* 인사 헤드라인 (v2 2차 시안): "M월 D일 X요일, 오늘 게시 N건 · 촬영 N건이 있습니다" */
  const todayBits = [
    s.todayPosts > 0 && `게시 ${s.todayPosts}건`,
    s.todayShoots > 0 && `촬영 ${s.todayShoots}건`,
  ].filter(Boolean)
  const greetLine = todayBits.length > 0
    ? `오늘 ${todayBits.join(' · ')}이 있습니다`
    : '오늘 예정된 게시·촬영이 없습니다'
  const subBits = [
    `팀원 부재 ${s.away}명`,
    `진행 중 캠페인 ${s.campaigns}개`,
    hol && `공휴일 · ${hol}`,
  ].filter(Boolean)

  return (
    <div className="wrap home-wrap">
      <header>
        <h1 className="home-greet">
          {d.getMonth() + 1}월 {d.getDate()}일 {DOW_KO[d.getDay()]}요일,<br />
          {greetLine}
        </h1>
        <div className="masthead-sub">{subBits.join(' · ')}</div>
      </header>

      {canSettle && <SettleBadge onGo={onGo} />}
      <WeekHero s={s} onGo={onGo} />
      <div className="home-cols">
        <div className="home-main">
          <TeamStatus events={events} today={today} onGo={onGo} />
          <MediaToday events={events} today={today} onGo={onGo} />
          <WorkDeadlines events={events} today={today} onGo={onGo} />
          <CampaignDday events={events} today={today} onGo={onGo} />
          <ShootWeek events={events} today={today} onGo={onGo} />
        </div>
        <div className="home-side">
          <Highlight onGo={onGo} />
          <ChannelSignals onGo={onGo} />
        </div>
      </div>

      {/* ── 추후 섹션 자리 ── home-main / home-side 안에 컴포넌트를 추가하면 됨
          (예: 소재 요청 D-day 레이더 / 작년 이맘때 / UGC 협업 후보 / 채널 공백 경보) */}
    </div>
  )
}
