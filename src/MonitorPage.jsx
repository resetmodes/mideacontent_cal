import React, { useState, useMemo, useEffect } from 'react'
import { IG } from './data/sns/instagram.js'
import { YT } from './data/sns/youtube.js'
import { YTA } from './data/sns/ytAnalytics.js'
import { trafficKo, deviceKo, ageKo, genderKo } from './data/sns/ytLabels.js'
import { UGC } from './data/sns/ugc.js'
import { TREND } from './data/sns/trend.js'
import { TA_GROUPS } from './data/targetapp.js'
import { listTargetApp } from './lib/targetappStore.js'
import ChannelDashboard from './ChannelDashboard.jsx'
import { Donut, HBars, DuoBars, TrendLines, Kpi } from './Charts.jsx'

/* 직전 수집 스냅샷 (현재 수집일보다 앞선 것 중 최신) — 없으면 증감 미표시 */
const prevSnapshot = cur => {
  const older = TREND.filter(t => t.date < cur)
  return older.length ? older[older.length - 1] : null
}

/* 전기 대비 증감 — ▲ 현대그린 / ▼ 그레이 (빨강은 경고 전용 원칙) */
function Delta({ d }) {
  if (d == null || d === 0) return null
  return (
    <small className={'delta ' + (d > 0 ? 'up' : 'down')}>
      {d > 0 ? '▲' : '▼'}{Math.abs(d).toLocaleString('ko-KR')}
    </small>
  )
}

/* ── 하이라이트 자동 요약 ('26.7) — 규칙 기반, AI·비용 없음 ─────────
   ① 팔로워 급증·급감 (직전 수집 대비 1% 또는 50명 이상) ② 새로 휴면 진입
   ③ 유튜브 조회 급등 (최근 3주 내 게시 & 채널 평균 3배 이상)
   직전 스냅샷이 없으면 ①②는 생략 — 표시할 게 없으면 섹션 자체를 숨김.
   export: 홈 화면 "채널 시그널" 섹션도 같은 로직 재사용 (HomePage.jsx) */
export function buildHighlights() {
  const items = []

  const prevIG = prevSnapshot((IG.generatedAt || '').slice(0, 10))?.ig
  if (prevIG) {
    for (const a of IG.accounts || []) {
      const p = prevIG[a.handle]
      if (!p) continue
      if (p.f != null && a.followers != null) {
        const d = a.followers - p.f
        if (Math.abs(d) >= Math.max(50, Math.round(p.f * 0.01))) {
          items.push({
            up: d > 0, mark: d > 0 ? '▲' : '▼',
            text: `${a.name} 팔로워 ${d > 0 ? '+' : ''}${d.toLocaleString('ko-KR')}, 현재 ${num(a.followers)}`,
            weight: Math.abs(d),
          })
        }
      }
      if (p.d === false && a.dormant) {
        items.push({ mark: '', text: `${a.name} 새로 휴면 진입 (30일 이상 미게시)`, weight: 40 })
      }
    }
  }

  /* 유튜브 조회 급등 — 상대 게시시점("N days/weeks ago")이 3주 이내인 것만 */
  const chAvg = Object.fromEntries((YT.channels || []).map(c => [c.key, c.avgViews || 0]))
  const chName = Object.fromEntries((YT.channels || []).map(c => [c.key, c.name]))
  for (const v of YT.videos || []) {
    const m = (v.date || '').match(/(\d+)\s*(day|week)s?\s+ago/)
    if (!m) continue
    const days = +m[1] * (m[2] === 'week' ? 7 : 1)
    if (days > 21) continue
    const avg = chAvg[v.channel]
    if (avg > 0 && v.views >= avg * 3) {
      const t = v.title.length > 42 ? v.title.slice(0, 42) : v.title
      items.push({
        up: true, mark: '▲', url: v.url,
        text: `${chName[v.channel] || v.channel} 조회 급등 ${t} (${compact(v.views)}, 평균의 ${Math.round(v.views / avg)}배)`,
        weight: v.views / avg * 100,
      })
    }
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, 6)
}

function Highlights() {
  const items = useMemo(buildHighlights, [])
  if (items.length === 0) return null
  return (
    <div className="mon-hl mon-hl-feature">
      <div className="mon-hl-head">
        <span className="mon-hl-title">이번 주 하이라이트</span>
        <span className="mon-hl-count">{items.length}건</span>
      </div>
      {items.map((it, i) => (
        <div key={i} className="mon-hl-row">
          <span className={'hl-mark' + (it.up ? ' up' : '')}>{it.mark}</span>
          {it.url
            ? <a href={it.url} target="_blank" rel="noreferrer">{it.text}</a>
            : <span>{it.text}</span>}
        </div>
      ))}
    </div>
  )
}

const num = n => (n == null ? '' : n.toLocaleString('ko-KR'))
/* 스튜디오 지표 표기 — 시청시간은 시간 단위, 지속시간은 분:초 (채널 덱과 같은 규칙) */
const hours = m => (m == null ? '' : `${Math.round(m / 60).toLocaleString('ko-KR')}h`)
const mmss = sec => {
  if (sec == null) return ''
  const m = Math.floor(sec / 60), ss = String(Math.round(sec % 60)).padStart(2, '0')
  return `${m}:${ss}`
}
const ymdDot = s => (s ? s.slice(0, 10).replace(/-/g, '.') : '')
const compact = n => {
  if (n == null) return ''
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(1) + '만'
  return n.toLocaleString('ko-KR')
}
const fmtDate = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '')

/* "3 days ago" 류 상대 표기 → 한글, ISO 날짜 → 점 표기 */
const koDate = s => {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return fmtDate(s)
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
  if (!m) return s
  const unit = { second: '초', minute: '분', hour: '시간', day: '일', week: '주', month: '개월', year: '년' }[m[2]]
  return `${m[1]}${unit} 전`
}

function Hero({ stats }) {
  return (
    <div className="mon-hero">
      {stats.map(s => (
        <div key={s.label} className="mon-stat">
          <div className="mon-label">{s.label}</div>
          <div className="mon-value">{s.value}<small>{s.unit}</small></div>
          {s.sub && <div className="mon-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

const IG_GROUP_ORDER = ['본사', '사업소', '아울렛', '콘텐츠 IP', '해외']

function InstagramView() {
  const main = IG.accounts.find(a => a.isMain)
  const prev = prevSnapshot((IG.generatedAt || '').slice(0, 10))?.ig || null
  const groups = useMemo(() => {
    const inData = [...new Set(IG.accounts.map(a => a.group))]
    const order = [...IG_GROUP_ORDER.filter(g => inData.includes(g)), ...inData.filter(g => !IG_GROUP_ORDER.includes(g))]
    return order.map(g => ({
      name: g,
      list: IG.accounts.filter(a => a.group === g).sort((a, b) => b.followers - a.followers),
    }))
  }, [])
  const competitors = IG.competitors || []
  const dormantCount = IG.accounts.filter(a => a.dormant).length
  const posts30 = IG.accounts.reduce((s, a) => s + (a.postsLast30 || 0), 0)

  /* 차트 데이터 (v2 3차) — 전부 수집분 실데이터 (경쟁사 제외) */
  const totalFollowers = IG.accounts.reduce((s, a) => s + (a.followers || 0), 0)
  const groupMix = groups.map(g => [g.name, g.list.reduce((s, a) => s + (a.followers || 0), 0)])
  const engRank = [...IG.accounts].filter(a => a.engagementPer1k != null && !a.dormant)
    .sort((a, b) => b.engagementPer1k - a.engagementPer1k).slice(0, 6)
    .map(a => ({ name: a.name, sub: '@' + a.handle, value: a.engagementPer1k, disp: String(a.engagementPer1k), unit: '참여/1k' }))
  const postRank = [...IG.accounts].sort((a, b) => (b.postsLast30 || 0) - (a.postsLast30 || 0)).slice(0, 8)
    .map(a => ({ name: a.name, value: a.postsLast30 || 0, unit: '건' }))
  const reelsRank = [...IG.accounts].filter(a => (a.postsLast30 || 0) > 0 && a.reelsShare != null)
    .sort((a, b) => b.reelsShare - a.reelsShare).slice(0, 8)
    .map(a => ({ name: a.name, value: a.reelsShare, disp: a.reelsShare + '%', unit: '릴스 비중' }))

  return (
    <>
      <Hero stats={[
        { label: '대표계정 팔로워', value: compact(main?.followers), sub: '@' + main?.handle },
        { label: '운영 계정', value: IG.accounts.length, unit: '개' },
        { label: '30일 게시물 합계', value: posts30, unit: '건' },
        { label: '휴면 계정', value: dormantCount, unit: '개', sub: '30일+ 미게시' },
      ]} />

      {/* 차트 행 (v2 3차 '26.7.29) */}
      <div className="dash-grid g23">
        <div className="dash-panel">
          <div className="group-label">참여도 순위</div>
          <div className="dash-d">팔로워 1천 명당 반응, 막대는 제곱근 스케일이며 휴면 계정 제외</div>
          <HBars sqrt rows={engRank} />
        </div>
        <div className="dash-panel flat">
          <div className="group-label">팔로워 구성</div>
          <div className="dash-d">그룹별 합계, 자사 계정만</div>
          <Donut data={groupMix} center={compact(totalFollowers)} fmt={compact} />
        </div>
      </div>
      <div className="dash-grid g32">
        <div className="dash-panel">
          <div className="group-label">게시 활동</div>
          <div className="dash-d">최근 30일 게시 수, 상위 8개 계정</div>
          <HBars rows={postRank} />
        </div>
        <div className="dash-panel">
          <div className="group-label">릴스 비중</div>
          <div className="dash-d">30일 게시 중 릴스 비율, 게시 있는 계정만</div>
          <HBars rows={reelsRank} />
        </div>
      </div>

      {groups.map(g => (
        <div key={g.name}>
          <div className="group-label">{g.name}</div>
          <AccountTable list={g.list} prev={prev} />
        </div>
      ))}

      {competitors.length > 0 && (
        <div>
          <div className="group-label">경쟁사 (참고)</div>
          <AccountTable list={[...competitors].sort((a, b) => b.followers - a.followers)} prev={prev} />
        </div>
      )}

      <div className="mon-note">
        참여/1k는 팔로워 1,000명당 평균 반응(좋아요와 댓글)으로 규모가 다른 계정을 비교하는 기준 {IG.note}
      </div>
    </>
  )
}

function AccountTable({ list, prev = null }) {
  return (
    <div className="mon-scroll">
      <table className="mon-table">
        <thead>
          <tr>
            <th>계정</th><th>팔로워</th><th>30일 게시</th><th>평균 좋아요</th>
            <th>평균 댓글</th><th>참여/1k</th><th>릴스 비중</th><th>최근 게시</th>
          </tr>
        </thead>
        <tbody>
          {list.map(a => (
            <tr key={a.handle} className={a.dormant ? 'dormant' : ''}>
              <td className="mon-acc">
                <b>{a.name}</b>
                <a href={a.profileUrl} target="_blank" rel="noreferrer">@{a.handle}</a>
                {a.dormant && <span className="mon-flag">휴면</span>}
              </td>
              <td className="strong">
                {num(a.followers)}
                {prev?.[a.handle]?.f != null && a.followers != null && <Delta d={a.followers - prev[a.handle].f} />}
              </td>
              <td>{num(a.postsLast30)}</td>
              <td>{a.likesVisible === 0 ? <span className="mute">비공개</span> : num(a.avgLikes)}</td>
              <td>{num(a.avgComments)}</td>
              <td>{a.engagementPer1k ?? ''}</td>
              <td>{a.reelsShare != null ? a.reelsShare + '%' : ''}</td>
              <td className="mute">{a.daysSinceLastPost != null ? `${a.daysSinceLastPost}일 전` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── 스튜디오 지표 대시보드 ('26.7.30) — YouTube Analytics API 수집분(ytAnalytics.js).
   공개 스크레이핑으로는 못 얻는 값(시청시간·구독자 증감·평균 시청)을 채널 비교로 보여준다.
   미수집 상태(YTA 없음)에서는 연동 안내만 — 수치를 지어내지 않는다.
   노출수·노출 클릭률은 API가 제공하지 않아 표기하지 않음 */
function StudioBoard() {
  const chans = YTA?.channels || null
  const keys = chans ? Object.keys(chans) : []
  /* 채널마다 성격이 달라 합산하면 묻힌다 ('26.7.30) — 칩으로 채널을 전환해 개별 분석.
     기본 선택은 대표 채널 (전 채널 합계는 비교용이라 칩 맨 뒤) */
  const mainKey = YT.channels?.find(c => c.isMain)?.key
  const [sel, setSel] = useState(() => (keys.includes(mainKey) ? mainKey : keys[0] || '전체'))
  if (!keys.length) {
    return (
      <div className="mon-note" style={{ marginBottom: 16 }}>
        스튜디오 지표는 아직 연동 전입니다. 채널 관리 계정이 1회 동의하면 시청시간과
        구독자 증감, 평균 시청 지속시간이 여기에 자동으로 채워집니다 (docs/yt-analytics-setup.md).
      </div>
    )
  }
  const nameOf = k => YT.channels?.find(c => c.key === k)?.name || k
  const scope = sel === '전체' ? keys : keys.filter(k => k === sel)
  const sum = f => scope.reduce((a, k) => a + (f(chans[k]) || 0), 0)
  const totalMin = sum(c => c.totals?.minutes)
  const totalViews = sum(c => c.totals?.views)
  const totalSubs = sum(c => c.totals?.subsNet)
  const scopeLabel = sel === '전체' ? `채널 ${keys.length}개 합계` : nameOf(sel)
  /* 월별 (선택 채널 기준) */
  const months = [...new Set(scope.flatMap(k => (chans[k].monthly || []).map(m => m.month)))].sort()
  const monthMin = months.map(m => [m.slice(5) + '월',
    scope.reduce((a, k) => a + ((chans[k].monthly || []).find(x => x.month === m)?.minutes || 0), 0)])
  const watchRank = keys.map(k => ({
    name: nameOf(k), sub: `조회 ${compact(chans[k].totals?.views)}`,
    value: chans[k].totals?.minutes || 0, disp: hours(chans[k].totals?.minutes),
  })).sort((a, b) => b.value - a.value)
  const holdRank = keys.map(k => ({
    name: nameOf(k), sub: `평균 ${mmss(chans[k].totals?.avgViewSec)}`,
    value: chans[k].totals?.avgViewPct || 0, disp: (chans[k].totals?.avgViewPct ?? 0) + '%',
  })).sort((a, b) => b.value - a.value)

  /* 유입 경로 — 선택 채널 상위 7 */
  const tMap = {}
  scope.forEach(k => (chans[k].traffic || []).forEach(t => { tMap[t.source] = (tMap[t.source] || 0) + (t.views || 0) }))
  const tTotal = Object.values(tMap).reduce((a, v) => a + v, 0)
  /* 1위가 99%를 먹는 채널이 있어 반올림하면 나머지가 전부 0%로 뭉개진다 ('26.7.31) —
     작은 비중일수록 자릿수를 늘려 6.9만과 1.1만이 구분되게 한다 */
  const sharePct = v => {
    if (!tTotal) return ''
    const s = v / tTotal * 100
    return (s >= 10 ? Math.round(s) : s >= 1 ? s.toFixed(1) : s.toFixed(2)) + '%'
  }
  const traffic = Object.entries(tMap).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([src, v]) => ({
    name: trafficKo(src), value: v, disp: compact(v), unit: sharePct(v),
  }))
  /* 기기 */
  const dMap = {}
  scope.forEach(k => (chans[k].device || []).forEach(d => { dMap[d.type] = (dMap[d.type] || 0) + (d.views || 0) }))
  const devices = Object.entries(dMap).sort((a, b) => b[1] - a[1]).map(([t, v]) => [deviceKo(t), v])
  const deviceTotal = Object.values(dMap).reduce((a, v) => a + v, 0)
  /* 시청자 구성 — 채널별 viewerPercentage를 단순 평균 (채널 규모 가중은 API가 주지 않음) */
  const withDemo = scope.filter(k => (chans[k].demo || []).length)
  const aMap = {}, gMap = {}
  withDemo.forEach(k => (chans[k].demo || []).forEach(d => {
    aMap[d.age] = (aMap[d.age] || 0) + (d.pct || 0) / withDemo.length
    gMap[d.gender] = (gMap[d.gender] || 0) + (d.pct || 0) / withDemo.length
  }))
  const ages = Object.entries(aMap).sort((a, b) => a[0].localeCompare(b[0])).map(([a, v]) => ({
    name: ageKo(a), value: v, disp: v.toFixed(1) + '%',
  }))
  /* 성별은 미상이 빠져 합이 100 미만 — 도넛이 자체 재정규화하면 범례 숫자와 어긋나므로
     여기서 성별 확인된 시청자 기준으로 환산해 표기를 맞춘다 */
  const gSum = Object.values(gMap).reduce((a, v) => a + v, 0) || 1
  const genders = Object.entries(gMap).sort((a, b) => b[1] - a[1])
    .map(([g, v]) => [genderKo(g), +(v / gSum * 100).toFixed(1)])

  return (
    <>
      <div className="group-label" style={{ marginTop: 22 }}>
        스튜디오 지표 <small className="cd-note-inline">{ymdDot(YTA.range?.start)} ~ {ymdDot(YTA.range?.end)}</small>
      </div>
      {/* 채널 전환 ('26.7.30) — 아래 지표 전체에 적용. 합계는 비교용이라 맨 뒤 */}
      <div className="std-chips">
        {[...keys, '전체'].map(k => (
          <button key={k} className={sel === k ? 'on' : ''} onClick={() => setSel(k)}>
            {k === '전체' ? '전 채널 합계' : nameOf(k)}
          </button>
        ))}
      </div>
      <div className="mon-hero">
        <Kpi label="시청시간" value={hours(totalMin)} sub={scopeLabel} />
        <Kpi label="조회수" value={compact(totalViews)} sub="수집 기간 합계" />
        <Kpi label="구독자 순증" value={(totalSubs >= 0 ? '+' : '') + num(totalSubs)} unit="명" sub="가입에서 해지를 뺀 값" />
        <Kpi label="평균 시청" value={mmss(Math.round(scope.reduce((a, k) => a + (chans[k].totals?.avgViewSec || 0), 0) / (scope.length || 1)))}
          sub={sel === '전체' ? '채널 평균' : (chans[sel]?.totals?.avgViewPct != null ? `길이의 ${chans[sel].totals.avgViewPct}%` : '영상당 지속시간')} />
      </div>
      <div className="dash-grid g23">
        <div className="dash-panel">
          <div className="group-label">월별 시청시간</div>
          <div className="dash-d">{scopeLabel}, 시간</div>
          <DuoBars data={monthMin.map(([m, v]) => [m, Math.round(v / 60)])} fmt={n => num(n) + 'h'} />
        </div>
        <div className="dash-panel">
          <div className="group-label">채널별 시청시간</div>
          <div className="dash-d">전 채널 비교, 막대는 제곱근 스케일</div>
          <HBars sqrt rows={watchRank} />
        </div>
      </div>
      <div className="dash-panel" style={{ marginTop: 16 }}>
        <div className="group-label">시청 지속률</div>
        <div className="dash-d">전 채널 비교, 영상 길이 대비 평균 시청 비율</div>
        <HBars rows={holdRank} />
      </div>

      {/* 유입 경로 ('26.7.30) — 선택 채널 상위 7개 */}
      {traffic.length > 0 && (
        <div className="dash-grid g23">
          <div className="dash-panel">
            <div className="group-label">유입 경로</div>
            <div className="dash-d">조회수 기준 상위 경로, {sel === '전체' ? '전 채널 합계' : nameOf(sel)}</div>
            <HBars rows={traffic} />
          </div>
          <div className="dash-panel flat">
            <div className="group-label">기기</div>
            <div className="dash-d">조회 비중</div>
            <Donut data={devices} center={compact(deviceTotal)} sub="조회" fmt={compact} />
          </div>
        </div>
      )}

      {/* 시청자 구성 ('26.7.30) — 시청자 수가 적으면 구글이 값을 주지 않아 섹션째 숨김 */}
      {ages.length === 0 && sel !== '전체' && (
        <div className="mon-note" style={{ marginTop: 16 }}>
          {nameOf(sel)}는 시청자 수가 적어 구글이 연령과 성별을 제공하지 않습니다
        </div>
      )}
      {ages.length > 0 && (
        <div className="dash-grid g23" style={{ marginTop: 16 }}>
          <div className="dash-panel">
            <div className="group-label">시청자 연령</div>
            <div className="dash-d">{sel === '전체' ? `시청 비중, 채널 ${withDemo.length}개 평균` : `${nameOf(sel)} 시청 비중`}</div>
            <HBars rows={ages} />
          </div>
          <div className="dash-panel flat">
            <div className="group-label">시청자 성별</div>
            <div className="dash-d">성별이 확인된 시청자 기준</div>
            <Donut data={genders} center={genders[0] ? `${Math.round(genders[0][1])}%` : ''} sub={genders[0]?.[0] || ''} fmt={v => Math.round(v) + '%'} />
          </div>
        </div>
      )}

      <div className="mon-note" style={{ marginTop: 12 }}>
        노출수와 노출 클릭률은 Analytics API가 제공하지 않아 표기하지 않습니다.
        해당 수치는 유튜브 스튜디오에서 직접 확인해 주세요.
      </div>
    </>
  )
}

function YoutubeView() {
  const [chFilter, setChFilter] = useState('전체')
  const [detail, setDetail] = useState(null)   // 채널 대시보드 ('26.7.29)
  const main = YT.channels.find(c => c.isMain)
  const prev = prevSnapshot((YT.generatedAt || '').slice(0, 10))?.yt || null
  const chName = key => YT.channels.find(c => c.key === key)?.name || key

  const videos = useMemo(() => {
    const list = chFilter === '전체' ? YT.videos : YT.videos.filter(v => v.channel === chFilter)
    return [...list].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20)
  }, [chFilter])

  /* 차트 데이터 (v2 3차) — 구독자 순증은 trend.js 스냅샷 (전 시점 값 있는 채널만) */
  const ytDates = TREND.map(x => x.date.slice(5).replace('-', '.'))
  const ytSeries = YT.channels
    .map(c => [c.name, TREND.map(x => x.yt?.[c.key]?.s).filter(v => v != null)])
    .filter(s => s[1].length === TREND.length && s[1].length >= 2)
  const totalSubs = YT.channels.reduce((s, c) => s + (c.subscribers || 0), 0)
  const subMix = [...YT.channels].sort((a, b) => b.subscribers - a.subscribers).map(c => [c.name, c.subscribers || 0])
  const avgRank = [...YT.channels].sort((a, b) => (b.avgViews || 0) - (a.avgViews || 0))
    .map(c => ({ name: c.name, sub: `영상 ${num(c.totalVideos)}개`, value: c.avgViews || 0, disp: compact(c.avgViews), unit: '평균 조회' }))

  if (detail) return <ChannelDashboard channelKey={detail} onBack={() => setDetail(null)} />

  return (
    <>
      <Hero stats={[
        { label: '대표채널 구독자', value: compact(main?.subscribers), sub: main?.name },
        { label: '운영 채널', value: YT.channels.length, unit: '개' },
        { label: '대표채널 총 조회', value: compact(main?.totalViews), sub: `영상 ${num(main?.totalVideos)}개` },
        { label: '평균 조회 (대표)', value: compact(main?.avgViews), sub: '최근 수집분' },
      ]} />

      <StudioBoard />

      {/* 차트 행 (v2 3차 '26.7.29) */}
      <div className="dash-grid g23">
        <div className="dash-panel">
          <div className="group-label">구독자 순증</div>
          <div className="dash-d">첫 수집({ytDates[0]}) 대비 누적 증가 (명)</div>
          <TrendLines dates={ytDates} series={ytSeries} />
        </div>
        <div className="dash-panel flat">
          <div className="group-label">구독자 구성</div>
          <div className="dash-d">채널별 비중</div>
          <Donut data={subMix} center={compact(totalSubs)} fmt={compact} />
        </div>
      </div>
      <div className="dash-panel" style={{ marginTop: 16 }}>
        <div className="group-label">평균 조회 비교</div>
        <div className="dash-d">영상당 평균 조회수, 막대는 제곱근 스케일</div>
        <HBars sqrt rows={avgRank} />
      </div>

      <div className="group-label">
        채널 지표 <small className="cd-note-inline">채널명을 누르면 성과 대시보드</small>
        <button className="cd-report" onClick={() => setDetail('__overview')}>종합 리포트</button>
      </div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead>
            <tr>
              <th>채널</th><th>구독자</th><th>총 영상</th><th>평균 조회</th>
              <th>롱폼 평균</th><th>쇼츠 평균</th><th>조회/1k구독</th><th>최대 조회</th>
            </tr>
          </thead>
          <tbody>
            {[...YT.channels].sort((a, b) => b.subscribers - a.subscribers).map(c => (
              <tr key={c.key}>
                <td className="mon-acc">
                  <button className="cd-open" onClick={() => setDetail(c.key)}>{c.name}</button>
                  <a href={c.url} target="_blank" rel="noreferrer">{c.channelName}</a>
                </td>
                <td className="strong">
                  {num(c.subscribers)}
                  {prev?.[c.key]?.s != null && c.subscribers != null && <Delta d={c.subscribers - prev[c.key].s} />}
                </td>
                <td>{num(c.totalVideos)}</td>
                <td>{num(c.avgViews)}</td>
                <td>{num(c.avgViewsVideo)}</td>
                <td>{num(c.avgViewsShorts)}</td>
                <td>{num(c.viewsPer1kSubs)}</td>
                <td>{num(c.maxViews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="group-label">조회수 상위 영상 (최근 수집분)</div>
      <div className="filters">
        {['전체', ...YT.channels.map(c => c.key)].map(k => (
          <button key={k} className={k === chFilter ? 'on' : ''} onClick={() => setChFilter(k)}>
            {k === '전체' ? '전체' : chName(k)}
          </button>
        ))}
      </div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead>
            <tr><th>제목</th><th>채널</th><th>유형</th><th>조회수</th><th>길이</th><th>게시</th></tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <tr key={v.url + i}>
                <td className="mon-title"><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a></td>
                <td className="mute">{chName(v.channel)}</td>
                <td>{v.type === 'Shorts' ? '쇼츠' : '롱폼'}</td>
                <td className="strong">{num(v.views)}</td>
                <td className="mute">{v.duration || ''}</td>
                <td className="mute">{koDate(v.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mon-note">{YT.note}</div>
    </>
  )
}

/* ── UGC — 고객·인플루언서 게시물 동향 ('26.7) ──────────────────
   데이터: src/data/sns/ugc.js (해시태그 수집 + Claude 감정·주제 분석)
   첫 수집 전(UGC=null)에는 세그먼트 자체가 숨겨짐. 감정·요약은 분석이
   있을 때만 노출 (ANTHROPIC_API_KEY 미설정 시 정량 지표만) */
function UgcView() {
  const positiveShare = UGC.sentiment
    ? Math.round(UGC.sentiment['긍정'] / Math.max(1, UGC.sentiment['긍정'] + UGC.sentiment['중립'] + UGC.sentiment['부정']) * 100)
    : null

  return (
    <>
      <Hero stats={[
        { label: '한 달 게시물', value: num(UGC.totalPosts), unit: '건', sub: UGC.tags.map(t => '#' + t).join(' ') },
        { label: '반응 합계', value: compact(UGC.totalEngagement), sub: '좋아요+댓글' },
        positiveShare != null
          ? { label: '긍정 비율', value: positiveShare, unit: '%', sub: `부정 ${UGC.sentiment['부정']}건` }
          : { label: '광고와 협찬', value: num(UGC.adPosts), unit: '건' },
        { label: '인플루언서 게시물', value: num(UGC.influencerPosts), unit: '건', sub: '팔로워 1만+' },
      ]} />

      {UGC.summary?.length > 0 && (
        <div className="mon-hl">
          <div className="group-label">동향 요약</div>
          {UGC.summary.map((s, i) => (
            <div key={i} className="mon-hl-row"><span>{s}</span></div>
          ))}
        </div>
      )}

      {/* 차트 행 (v2 3차) — 감정 도넛 + 주제 랭킹 (Claude 분석분 있을 때만) */}
      {(UGC.sentiment || UGC.topics?.length > 0) && (
        <div className="dash-grid g32">
          {UGC.sentiment && (
            <div className="dash-panel">
              <div className="group-label">감정 분포</div>
              <div className="dash-d">게시물별 감정 분류</div>
              <Donut
                data={['긍정', '중립', '부정'].map(k => [k, UGC.sentiment[k] || 0])}
                center={num(UGC.totalPosts)} sub="게시물" />
            </div>
          )}
          {UGC.topics?.length > 0 && (
            <div className="dash-panel">
              <div className="group-label">주제 분포</div>
              <div className="dash-d">게시물 주제별 건수</div>
              <HBars rows={UGC.topics.map(t => ({ name: t.name, value: t.count, unit: '건' }))} />
            </div>
          )}
        </div>
      )}

      {(UGC.sentiment || UGC.topics?.length > 0) && (
        <>
          <div className="group-label">감정과 주제 분포</div>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>구분</th><th>건수</th><th>비중</th></tr></thead>
              <tbody>
                {UGC.sentiment && ['긍정', '중립', '부정'].map(k => {
                  const total = UGC.sentiment['긍정'] + UGC.sentiment['중립'] + UGC.sentiment['부정']
                  return (
                    <tr key={k}>
                      <td className="mon-acc"><b>{k}</b></td>
                      <td className="strong">{num(UGC.sentiment[k])}</td>
                      <td className="mute">{total ? Math.round(UGC.sentiment[k] / total * 100) + '%' : ''}</td>
                    </tr>
                  )
                })}
                {(UGC.topics || []).map(t => (
                  <tr key={t.name}>
                    <td className="mon-acc mute">{t.name}</td>
                    <td>{num(t.count)}</td>
                    <td className="mute">{UGC.totalPosts ? Math.round(t.count / UGC.totalPosts * 100) + '%' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="group-label">반응 상위 게시물</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead>
            <tr><th>게시물</th><th>작성자</th><th>팔로워</th><th>좋아요</th><th>댓글</th>{UGC.sentiment && <th>감정</th>}<th>게시</th></tr>
          </thead>
          <tbody>
            {(UGC.topPosts || []).map((p, i) => (
              <tr key={p.url + i}>
                <td className="mon-title">
                  <a href={p.url} target="_blank" rel="noreferrer">{p.caption || '(캡션 없음)'}</a>
                  {p.isAd && <span className="mon-flag">광고 협찬</span>}
                </td>
                <td className="mute">@{p.owner}</td>
                <td>{p.followers != null ? compact(p.followers) : ''}</td>
                <td className="strong">{p.likes === null ? <span className="mute">비공개</span> : num(p.likes)}</td>
                <td>{num(p.comments)}</td>
                {UGC.sentiment && <td className="mute">{p.sentiment || ''}</td>}
                <td className="mute">{fmtDate(p.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="group-label">주요 작성자 (반응 순)</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead><tr><th>작성자</th><th>팔로워</th><th>게시물</th><th>반응 합계</th></tr></thead>
          <tbody>
            {(UGC.creators || []).map(c => (
              <tr key={c.owner}>
                <td className="mon-acc">
                  <a href={`https://www.instagram.com/${c.owner}/`} target="_blank" rel="noreferrer">@{c.owner}</a>
                  {c.influencer && <span className="mon-flag">인플루언서</span>}
                </td>
                <td className="strong">{c.followers != null ? num(c.followers) : ''}</td>
                <td>{num(c.posts)}</td>
                <td>{num(c.engagement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mon-note">{UGC.note}</div>
    </>
  )
}

/* ── 타겟APP — 캠페인 실적 (수기 입력, '26.7) ──────────────────
   데이터: Supabase targetapp_stats(캠페인 행)·targetapp_media(매체별 누적 스냅샷) —
   내부 전용(RLS: 로그인 계정만, anon 정책 없음 → 미러에서 접근 불가).
   API 자동 연동이 없어 매월 초 전월 실적을 수기 입력 (입력 폼은 어드민 2차) */
/* 매체명 → 구분(그룹) 라벨 — 세부 매체 열람 시 분류 표기 */
const MEDIA_GROUP = Object.fromEntries(TA_GROUPS.flatMap(g => g.media.map(m => [m, g.g])))

function TargetAppView() {
  const [data, setData] = useState(undefined)   // undefined=로딩 · null=미설정/빈 데이터
  const [monFilter, setMonFilter] = useState('전체')
  const [openCamp, setOpenCamp] = useState(() => new Set())   // 펼친 캠페인 id (세부 매체 열람)
  const toggleCamp = id => setOpenCamp(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  useEffect(() => { listTargetApp().then(setData) }, [])

  if (data === undefined) return <div className="empty">불러오는 중</div>
  if (!data) return (
    <div className="mon-note">
      타겟APP 실적 데이터가 아직 없습니다. Supabase SQL Editor에서 <b>data/targetapp-seed.sql</b>을
      1회 실행하면 '26.1~4월 이관분이 채워집니다 (절차는 data/supabase-setup.md 7장).
      이후 매월 실적은 어드민에서 입력합니다.
    </div>
  )

  const { rows, media } = data
  const total = k => rows.reduce((a, r) => a + (r[k] || 0), 0)
  const ctr = (clk, exp) => (exp ? (clk / exp * 100).toFixed(2) + '%' : '')
  const offices = [...new Set(rows.map(r => r.office))]
  const monthKeys = [...new Set(rows.map(r => `${r.year}.${r.month}`))]
  const byMonth = monthKeys.map(k => {
    const list = rows.filter(r => `${r.year}.${r.month}` === k)
    const t = kk => list.reduce((a, r) => a + (r[kk] || 0), 0)
    return { k, cnt: list.length, exp: t('exp'), clk: t('clk'), vis: t('vis'), inst: t('inst') }
  })
  const filtered = monFilter === '전체' ? rows : rows.filter(r => `${r.year}.${r.month}` === monFilter)
  const offGroups = offices
    .map(o => ({ o, list: filtered.filter(r => r.office === o), cnt: rows.filter(r => r.office === o).length }))
    .filter(g => g.list.length > 0)
    .sort((a, b) => b.cnt - a.cnt || a.o.localeCompare(b.o))
  const mediaByName = Object.fromEntries(media.map(m => [m.name, m]))

  return (
    <>
      <Hero stats={[
        { label: '캠페인', value: num(rows.length), unit: '건', sub: "'26.1월~ 누적" },
        { label: '총 노출', value: compact(total('exp')), sub: `클릭 ${compact(total('clk'))}, 클릭율 ${ctr(total('clk'), total('exp'))}` },
        { label: '총 방문', value: num(total('vis')), unit: '명' },
        { label: '앱설치', value: num(total('inst')), unit: '건', sub: `사업소와 행사 ${offices.length}개 단위` },
      ]} />

      {/* 차트 행 (v2 3차) — 월별 노출 막대 + 매체 구분별 노출 비중 */}
      <div className="dash-grid g23">
        <div className="dash-panel">
          <div className="group-label">월별 노출</div>
          <div className="dash-d">캠페인 시작월 기준 합계</div>
          <DuoBars data={byMonth.map(m => [m.k, m.exp])} fmt={compact} />
        </div>
        {media.length > 0 && (
          <div className="dash-panel flat">
            <div className="group-label">매체 구분별 노출</div>
            <div className="dash-d">누적 {media[0]?.basis || ''}</div>
            <Donut
              data={TA_GROUPS.map(g => [g.g, g.media.reduce((s, name) => s + (mediaByName[name]?.exp || 0), 0)])}
              center={compact(total('exp'))} sub="총 노출" fmt={compact} />
          </div>
        )}
      </div>

      <div className="group-label">월별 추이</div>
      <div className="mon-scroll">
        <table className="mon-table">
          <thead><tr><th>월</th><th>캠페인</th><th>노출</th><th>클릭</th><th>클릭율</th><th>방문</th><th>앱설치</th></tr></thead>
          <tbody>
            {byMonth.map(m => (
              <tr key={m.k}>
                <td className="mon-acc">{m.k}월</td>
                <td>{m.cnt}건</td>
                <td>{compact(m.exp)}</td>
                <td>{compact(m.clk)}</td>
                <td className="mute">{ctr(m.clk, m.exp)}</td>
                <td>{num(m.vis)}</td>
                <td className="strong">{num(m.inst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {media.length > 0 && (
        <>
          <div className="group-label">매체별 누적 <small className="ta-basis">{media[0]?.basis}</small></div>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>구분</th><th>매체</th><th>역할</th><th>노출</th><th>클릭</th><th>클릭율</th><th>방문</th><th>앱설치</th><th>캠페인</th></tr></thead>
              <tbody>
                {TA_GROUPS.flatMap(g => g.media.map(name => {
                  const m = mediaByName[name]
                  if (!m) return null
                  return (
                    <tr key={name}>
                      <td className="mute">{g.g}</td>
                      <td className="mon-acc">{m.name}</td>
                      <td className="mute">{m.role}</td>
                      <td>{compact(m.exp)}</td>
                      <td>{compact(m.clk)}</td>
                      <td className="mute">{ctr(m.clk, m.exp)}</td>
                      <td>{num(m.vis)}</td>
                      <td className="strong">{num(m.inst)}</td>
                      <td className="mute">{m.cam}건</td>
                    </tr>
                  )
                })).filter(Boolean)}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="group-label">사업소별 캠페인</div>
      <div className="filters">
        {['전체', ...monthKeys].map(k => (
          <button key={k} className={k === monFilter ? 'on' : ''} onClick={() => setMonFilter(k)}>
            {k === '전체' ? `전체 (${rows.length}건)` : `${k.split('.')[1]}월`}
          </button>
        ))}
      </div>
      {offGroups.map(g => (
        <details className="ta-office" key={g.o}>
          <summary>
            <span className="ta-name">{g.o}</span>
            <span className="ta-cnt">{g.cnt}회 집행</span>
            <span className="ta-sum">노출 {compact(g.list.reduce((a, r) => a + r.exp, 0))}, 설치 {num(g.list.reduce((a, r) => a + r.inst, 0))}</span>
          </summary>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>월</th><th>캠페인</th><th>기간</th><th>매체</th><th>노출</th><th>클릭</th><th>클릭율</th><th>방문</th><th>앱설치</th></tr></thead>
              <tbody>
                {g.list.map(r => {
                  const mediaList = r.media || []
                  const open = openCamp.has(r.id)
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={'ta-camp-row' + (open ? ' open' : '')} onClick={() => mediaList.length && toggleCamp(r.id)}>
                        <td className="mute">{r.month}월</td>
                        <td className="mon-acc">
                          {mediaList.length > 0 && <span className="ta-chev" aria-hidden>{open ? '▾' : '▸'}</span>}
                          {r.name}
                        </td>
                        <td className="mute">{r.period}</td>
                        <td className="mute">{mediaList.length ? `${mediaList.length}개 매체` : ''}</td>
                        <td>{compact(r.exp)}</td>
                        <td>{compact(r.clk)}</td>
                        <td className="mute">{ctr(r.clk, r.exp)}</td>
                        <td>{num(r.vis)}</td>
                        <td className="strong">{num(r.inst)}</td>
                      </tr>
                      {open && (
                        <tr className="ta-detail">
                          <td colSpan={9}>
                            <div className="ta-media-list">
                              {mediaList.map(name => (
                                <div className="ta-media-item" key={name}>
                                  <span className="ta-media-grp">{MEDIA_GROUP[name] || '기타'}</span>
                                  <span className="ta-media-name">{name}</span>
                                  {mediaByName[name]?.role && <span className="mute ta-media-role">{mediaByName[name].role}</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {[...new Set(g.list.map(r => r.note).filter(Boolean))].map((n, i) => (
            <div className="ta-note" key={i}>{n}</div>
          ))}
        </details>
      ))}

      <div className="mon-note">
        랜딩이 자사 페이지가 아니면(네이버 예약 등 외부 랜딩) 방문과 앱설치가 자사 트래킹에
        집계되지 않습니다. 방문 0건은 대부분 이 경우입니다. 신규 실적은 매월 초 전월분을 수기 입력합니다.
      </div>
    </>
  )
}

export default function MonitorPage() {
  const [platform, setPlatform] = useState('instagram')
  const generatedAt =
    platform === 'instagram' ? IG.generatedAt : platform === 'youtube' ? YT.generatedAt : UGC?.generatedAt

  const segments = [['instagram', '인스타그램'], ['youtube', '유튜브'], ...(UGC ? [['ugc', '고객 게시물']] : []), ['targetapp', '타겟APP']]

  return (
    <div className="wrap cal-wrap">
      <header>
        <h1>매체 모니터링</h1>
        <div className="masthead-sub">
          {platform === 'targetapp'
            ? '타겟형 매체 캠페인 실적 (매월 수기 갱신, 팀 내부 전용)'
            : `최근 1개월 기준, ${fmtDate(generatedAt)} 수집`}
        </div>
      </header>

      <Highlights />

      <div className="cal-controls">
        <div className="seg">
          {segments.map(([k, label]) => (
            <button key={k} className={platform === k ? 'on' : ''} onClick={() => setPlatform(k)}>{label}</button>
          ))}
        </div>
      </div>

      {platform === 'instagram' ? <InstagramView />
        : platform === 'youtube' ? <YoutubeView />
        : platform === 'targetapp' ? <TargetAppView />
        : <UgcView />}
    </div>
  )
}
