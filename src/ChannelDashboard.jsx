/* 채널 성과 대시보드 ('26.7.29) — 모니터링 탭 채널명 클릭 시 진입.
   형식: **가로형 PPT 덱** ('26.7.29 2차 — 사용자 지시 "움직이는 효과가 있는 PPT처럼,
   가로형 슬라이드를 넘겨 보는 느낌"). 스크롤 리포트가 아니라 16:9 슬라이드 단위로,
   좌우 화살표·키보드(←→)·스와이프로 넘기고 전환 애니메이션이 붙는다. 전체화면 지원.

   디자인 기준은 유지 — 흑백 + 현대그린 1색, 가로선, 타이포 위계, 대형 tabular-nums,
   차트는 의존성 0 인라인 SVG (원본 리포트의 채널별 컬러·글로우·그라데이션은 미사용).

   데이터 2층:
   ① 수집 지표(항상) — youtube.js(주간 수집) + trend.js(스냅샷)
   ② 스튜디오 지표(선택) — ytAnalytics.js (YouTube Analytics API 연동 시 슬라이드 자동 추가)
   노출수·CTR은 API 미제공이라 표기하지 않는다 (수치 날조 금지) */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { LogoLockup } from './Logo.jsx'
import { YT } from './data/sns/youtube.js'
import { YTA } from './data/sns/ytAnalytics.js'
import { trafficKo, deviceKo, demoSplit, aggregateStudio } from './data/sns/ytLabels.js'
import { TREND } from './data/sns/trend.js'
import { REPORT } from './data/sns/channelReport.js'

const num = n => (n == null ? '' : Math.round(n).toLocaleString('ko-KR'))
const compact = n => {
  if (n == null) return ''
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만`
  return Math.round(n).toLocaleString('ko-KR')
}
const manWon = n => `${Math.round(n / 10000).toLocaleString('ko-KR')}만원`
const hours = min => (min == null ? '' : `${Math.round(min / 60).toLocaleString('ko-KR')}h`)
const ymd = s => (s ? s.slice(0, 10).replace(/-/g, '.') : '')
const monthLabel = m => `${Number(m.slice(5, 7))}월`
const isISO = s => /^\d{4}-\d{2}-\d{2}/.test(s || '')
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const UNIT_KO = { second: '초', minute: '분', hour: '시간', day: '일', week: '주', month: '개월', year: '년' }
const postDate = s => {
  if (!s) return ''
  if (isISO(s)) return ymd(s)
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
  return m ? `${m[1]}${UNIT_KO[m[2]]} 전` : s
}

/* 숫자 카운트업 ('26.7.29 리디자인) — 문자열에서 숫자만 뽑아 0→값으로 올림.
   "3,154,134" "11.76%" "-676" "1,086,300원" 모두 접두·접미를 보존한다.
   prefers-reduced-motion이면 즉시 최종값 */
function useCountUp(text, ms = 900) {
  const [out, setOut] = useState(text)
  useEffect(() => {
    const m = String(text).match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/)
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!m || reduce) { setOut(text); return }
    const [, pre, numStr, post] = m
    const target = parseFloat(numStr.replace(/,/g, ''))
    if (!isFinite(target)) { setOut(text); return }
    const dec = (numStr.split('.')[1] || '').length
    const t0 = performance.now()
    let raf
    const tick = now => {
      const p = Math.min((now - t0) / ms, 1)
      const e = 1 - Math.pow(1 - p, 3)
      const v = target * e
      setOut(pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('ko-KR')) + post)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, ms])
  return out
}

/* 슬라이드의 주인공 숫자 — 한 장에 하나, 형광 언더바 */
function Hero({ value, label, sub, hl = true }) {
  const v = useCountUp(value)
  return (
    <div className="dk-hero">
      <div className={'dk-hero-v' + (hl ? ' hl' : '')}>{v}</div>
      <div className="dk-hero-l">{label}</div>
      {sub && <div className="dk-hero-s">{sub}</div>}
    </div>
  )
}

/* **강조** 마크업 → <b> (리포트 문구용) */
const em = t => t.split('**').map((seg, i) => (i % 2 ? <b key={i}>{seg}</b> : seg))

/* ── 막대 (그린 단색 · 축 가로선만) ─────────────────────────── */
/* sqrt = 한 항목이 나머지를 압도할 때 ('26.7.31 유입 경로 — 광고가 99%라 나머지 다섯이
   전부 바닥 선으로 눌렸다). 눈금을 바꾸면 단위 줄에 명시한다 */
function BarChart({ rows, unit = '회', series = null, baseline = true, delta = true, sqrt = false }) {
  const sc = v => (sqrt ? Math.sqrt(Math.max(0, v)) : v)
  const max = Math.max(...rows.flatMap(r => [r.v, r.v2 || 0]), 1)
  const avg = rows.reduce((s, r) => s + r.v, 0) / (rows.length || 1)
  return (
    <div className="dk-chart">
      {series && (
        <div className="dk-legend">
          {series.map((s, i) => <span key={s} className={'dk-lg' + (i ? ' alt' : '')}>{s}</span>)}
        </div>
      )}
      <div className="dk-bars">
        {baseline && rows.length > 1 && (
          <div className="dk-baseline" style={{ bottom: `calc(${(avg / max) * 100}% * 0.78 + 30px)` }}>
            <span>평균 {compact(Math.round(avg))}</span>
          </div>
        )}
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].v : null
          const d = prev ? Math.round(((r.v - prev) / prev) * 100) : null
          return (
          <div className="dk-bar-col" key={i}>
            <div className="dk-bar-v">
              {compact(r.v)}
              {r.v2 != null && <em>{compact(r.v2)}</em>}
              {delta && d != null && r.v2 == null && (
                <i className={d >= 0 ? 'up' : ''}>{d >= 0 ? '▲' : '▼'}{Math.abs(d)}%</i>
              )}
            </div>
            <div className="dk-bar-track">
              <div className={'dk-bar-fill' + (r.v === max ? ' max' : '')} style={{ height: `${Math.max((sc(r.v) / sc(max)) * 100, r.v > 0 ? 1.5 : 0)}%`, animationDelay: `${i * 70}ms` }} />
              {r.v2 != null && (
                <div className="dk-bar-fill alt" style={{ height: `${Math.max((sc(r.v2) / sc(max)) * 100, r.v2 > 0 ? 1.5 : 0)}%`, animationDelay: `${i * 70 + 40}ms` }} />
              )}
            </div>
            <div className="dk-bar-l">{r.label}</div>
          </div>
        )})}
      </div>
      <div className="dk-unit">단위: {unit}{sqrt ? ', 세로축 제곱근 눈금' : ''}</div>
    </div>
  )
}

/* ── 꺾은선 (스냅샷 추이) ──────────────────────────────────── */
function LineChart({ rows }) {
  if (rows.length < 2) return null
  const max = Math.max(...rows.map(r => r.v)), min = Math.min(...rows.map(r => r.v))
  const span = max - min || 1
  /* 세로 축에 여유를 둬 변화 폭을 과장하지 않음 (구독자처럼 변동이 작은 지표 대비).
     좌우 2% 여백은 양 끝 점이 뷰박스에 잘리지 않게 하는 용도 */
  const lo = min - span * 0.6, hi = max + span * 0.6
  const pt = (r, i) => [2 + (i / (rows.length - 1)) * 96, 34 - ((r.v - lo) / (hi - lo)) * 26]
  const d = rows.map((r, i) => `${i ? 'L' : 'M'}${pt(r, i).map(n => n.toFixed(2)).join(' ')}`).join(' ')
  return (
    <div className="dk-chart">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="dk-line-svg" role="img">
        <line x1="0" y1="39.7" x2="100" y2="39.7" className="dk-axis" />
        <path d={d} className="dk-line" vectorEffect="non-scaling-stroke" />
        {rows.map((r, i) => {
          const [x, y] = pt(r, i)
          return <circle key={i} cx={x} cy={y} r="0.7" className="dk-pt" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <div className="dk-xaxis">
        {rows.map((r, i) => (
          <div key={i} className="dk-xtick"><b>{compact(r.v)}</b><span>{r.label}</span></div>
        ))}
      </div>
    </div>
  )
}

/* ── 월별 조회수 추이 ('26.7.30 사용자 지시 "막대 말고 선형으로, 추이가 확실히 보이게") ──
   막대는 각 달의 크기는 읽히지만 오르내림이 눈에 안 들어온다. 꺾은선으로 바꾸고
   채널이 여럿이면 한 판에 겹쳐 그려 서로 비교되게 한다.

   선은 SVG(가로로 늘어나도 굵기 유지), 점과 값 라벨은 HTML로 겹쳐 올린다 —
   viewBox를 가로로 늘이면 원이 타원이 되고 글자가 찌그러지기 때문.
   무대가 어두우므로 형광은 쓰지 않는다 (강조 전용 원칙) */
/* 어두운 무대 위에서 서로 구분되는 4색. 공식 라일락(#F0E4ED)은 흰 선과 거의 붙어 보여
   차트용 라일락(--lilac-bar 계열)을 조금 밝힌 톤을 쓴다 ('26.7.30) */
const TREND_C = ['#FFFFFF', '#DDA3C6', '#8FD3B6', '#E8CE96', 'rgba(255,255,255,.5)']

function TrendChart({ series, labels, fmt = compact, unit = '회', scale = 'linear' }) {
  const rows = (series || []).filter(s => (s.values || []).some(v => v != null))
  if (!rows.length || labels.length < 2) return null
  const all = rows.flatMap(s => s.values.filter(v => v != null))
  const max = Math.max(...all), min = Math.min(...all)
  /* 위아래 여유 — 선이 테두리에 붙으면 변화 폭이 과장돼 보인다.
     값이 하나뿐이거나 전부 같으면 폭을 값 기준으로 잡아 0으로 나누지 않게 */
  const pad = (max - min) * 0.22 || Math.abs(max) * 0.15 || 1
  const hi = max + pad, lo = Math.max(0, min - pad)
  /* 채널 규모가 100배씩 벌어지면 작은 채널이 바닥에 눌려 추이가 안 보인다 —
     그때만 제곱근 눈금 (슬라이드 부제에 표기) */
  const f = scale === 'sqrt' ? Math.sqrt : (v => v)
  const fLo = f(lo), fHi = f(hi)
  const x = i => (i / (labels.length - 1)) * 100
  const y = v => 100 - ((f(v) - fLo) / (fHi - fLo || 1)) * 100
  /* 눈금선에 실제 값 표기 — 제곱근 눈금이면 간격이 고르지 않다는 게 숫자로 보인다 */
  const inv = t => (scale === 'sqrt' ? Math.pow(fLo + (fHi - fLo) * t, 2) : lo + (hi - lo) * t)
  const path = s => s.values
    .map((v, i) => (v == null ? '' : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`))
    .join(' ')
  const single = rows.length === 1

  return (
    <div className="dk-trend">
      <div className="dk-trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="dk-trend-svg" aria-hidden="true">
          {[0, 25, 50, 75, 100].map(g => (
            <line key={g} x1="0" y1={g} x2="100" y2={g} className="dk-trend-grid" />
          ))}
          {rows.map((s, i) => (
            <path key={s.name} d={path(s)} className="dk-trend-line"
              style={{ stroke: TREND_C[i % TREND_C.length] }} />
          ))}
        </svg>
        {[0, 25, 50, 75, 100].map(g => (
          <span key={'g' + g} className="dk-trend-ytick" style={{ top: `${g}%` }}>{fmt(inv(1 - g / 100))}</span>
        ))}
        {rows.map((s, i) => s.values.map((v, j) => (v == null ? null : (
          <span key={s.name + j} className="dk-trend-dot"
            style={{ left: `${x(j)}%`, top: `${y(v)}%`, background: TREND_C[i % TREND_C.length],
              animationDelay: `${j * 70 + 420}ms` }} />
        ))))}
        {/* 값 라벨 — 한 채널이면 모든 점에, 여러 채널이면 마지막 점에만 (겹침 방지) */}
        {rows.map((s, i) => s.values.map((v, j) => {
          if (v == null) return null
          const last = j === s.values.length - 1
          if (!single && !last) return null
          return (
            <span key={'v' + s.name + j} className={'dk-trend-val' + (last ? ' last' : '')}
              style={{ left: `${x(j)}%`, top: `${y(v)}%`, color: TREND_C[i % TREND_C.length],
                animationDelay: `${j * 70 + 560}ms` }}>{fmt(v)}</span>
          )
        }))}
      </div>
      <div className="dk-trend-x">
        {labels.map(l => <span key={l}>{l}</span>)}
      </div>
      <div className="dk-trend-foot">
        {rows.length > 1 && (
          <div className="dk-trend-leg">
            {rows.map((s, i) => (
              <span key={s.name} style={{ '--c': TREND_C[i % TREND_C.length] }}>{s.name}</span>
            ))}
          </div>
        )}
        <div className="dk-unit">단위: {unit}{scale === 'sqrt' ? ', 세로축 제곱근 눈금' : ''}</div>
      </div>
    </div>
  )
}

function Kpi({ label, value, unit, sub }) {
  const v = useCountUp(value)
  return (
    <div className="dk-kpi">
      <div className="dk-kpi-l">{label}</div>
      <div className="dk-kpi-v">{v}{unit && <small>{unit}</small>}</div>
      {sub && <div className="dk-kpi-s">{sub}</div>}
    </div>
  )
}


/* ── 종합 리포트 덱 (개요) — 채널 4개를 한 화면에서 비교 ───────────────── */
function overviewSlides() {
  const chs = Object.entries(REPORT.channels)
  const maxV = Math.max(...REPORT.adValue.rows.map(r => r.v))
  return [
    {
      key: 'ov-cover', label: '표지',
      node: (
        <div className="dk-cover">
          <div className="dk-eyebrow">채널 성과 리포트 {REPORT.period}</div>
          <h2 className="dk-title">{REPORT.headline}</h2>
          <div className="dk-lede">{REPORT.lede}</div>
          <div className="dk-cover-nums wide">
            {REPORT.kpis.slice(0, 3).map((k, i) => (
              <div key={i}><b>{k.v}</b><span>{k.l}</span></div>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: 'ov-kpi', label: '종합 지표',
      node: (
        <>
          <div className="dk-h">종합 성과 <small>{REPORT.period}</small></div>
          <div className="dk-kpis">
            {REPORT.kpis.map((k, i) => <Kpi key={i} label={k.l} value={k.v} sub={k.s} />)}
          </div>
        </>
      ),
    },
    {
      key: 'ov-compare', label: '채널 비교',
      node: (
        <>
          <div className="dk-h">개월 차별 조회수 추이 <small>{REPORT.compareNote}</small></div>
          <TrendChart labels={REPORT.monthLabels} scale="sqrt"
            series={chs.map(([k, c]) => ({ name: c.title, values: c.monthly }))} />
        </>
      ),
    },
    {
      key: 'ov-value', label: '광고가치',
      node: (
        <>
          <div className="dk-h">광고비 없이 만든 조회 효과 <small>{REPORT.adValue.note}</small></div>
          <div className="dk-hbars">
            {REPORT.adValue.rows.map((r, i) => (
              <div className="dk-hbar-row" key={r.k} style={{ animationDelay: `${i * 80}ms` }}>
                <span className="dk-hbar-l">{r.label}</span>
                <span className="dk-hbar-track">
                  <span className={'dk-hbar-fill' + (r.actual ? ' alt' : (r.v === maxV ? ' max' : ''))} style={{ width: `${(r.v / maxV) * 100}%` }} />
                </span>
                <span className="dk-hbar-v">{manWon(r.v)}</span>
              </div>
            ))}
          </div>
          <div className="dk-total">{REPORT.adValue.total}</div>
        </>
      ),
    },
    {
      key: 'ov-plan', label: '향후 계획',
      node: (
        <>
          <div className="dk-h">3분기 이후 채널별 운영 방향 <small>{REPORT.planNote}</small></div>
          <div className="dk-plans">
            {REPORT.plan.map((p, i) => (
              <div className="dk-plan-card" key={p.k} style={{ animationDelay: `${i * 90}ms` }}>
                <div className="dk-plan-brand">{p.brand}</div>
                <div className="dk-plan-k sm">{p.title}</div>
                <div className="dk-plan-goal sm">{p.goal}</div>
                <ul className="dk-plan-acts">
                  {p.actions.map(([when, what], j) => <li key={j}><b>{when}</b> {what}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </>
      ),
    },
  ]
}

export default function ChannelDashboard({ channelKey, onBack }) {
  const overview = channelKey === '__overview'
  const ch = YT.channels.find(c => c.key === channelKey)
  const sa = YTA?.channels?.[channelKey] || null
  /* 종합 덱은 채널별 데이터가 없으므로 4채널 합산을 쓴다 ('26.7.30) */
  const agg = overview ? aggregateStudio(YTA?.channels || {}) : null
  const src = overview ? agg : sa
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const stage = useRef(null)
  const touch = useRef(null)

  const subTrend = useMemo(() => (TREND || [])
    .filter(s => s.yt?.[channelKey]?.s != null)
    .map(s => ({ label: ymd(s.date).slice(5), v: s.yt[channelKey].s })), [channelKey])

  const byMonth = useMemo(() => {
    const map = new Map()
    for (const v of YT.videos || []) {
      if (v.channel !== channelKey || !isISO(v.date)) continue
      const m = v.date.slice(0, 7)
      const cur = map.get(m) || { views: 0, n: 0 }
      cur.views += v.views || 0; cur.n += 1
      map.set(m, cur)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([m, o]) => ({ label: monthLabel(m), v: o.views, n: o.n }))
  }, [channelKey])

  const mine = useMemo(() => (YT.videos || []).filter(v => v.channel === channelKey), [channelKey])
  const topVideos = useMemo(() => [...mine].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5), [mine])

  /* 인사이트 — 수집값에서 계산되는 사실만 (추정·날조 없음) */
  const insights = useMemo(() => {
    const out = []
    const total = mine.reduce((s, v) => s + (v.views || 0), 0)
    const top = topVideos[0]
    if (top && total > 0) {
      out.push([`상위 1편이 수집분 조회의 ${Math.round((top.views / total) * 100)}%`, `"${top.title}" ${num(top.views)}회`])
    }
    const shorts = mine.filter(v => v.type === 'Shorts')
    if (mine.length) {
      out.push([`수집분의 ${Math.round((shorts.length / mine.length) * 100)}%가 쇼츠`, `쇼츠 ${shorts.length}편, 롱폼 ${mine.length - shorts.length}편`])
    }
    if (ch?.avgViewsVideo && ch?.avgViewsShorts) {
      const hi = ch.avgViewsVideo >= ch.avgViewsShorts
      out.push([`${hi ? '롱폼이' : '쇼츠가'} 평균 조회 우위`, `롱폼 ${compact(ch.avgViewsVideo)}, 쇼츠 ${compact(ch.avgViewsShorts)}`])
    }
    if (subTrend.length >= 2) {
      const d = subTrend[subTrend.length - 1].v - subTrend[0].v
      out.push([`관측 기간 구독자 ${d >= 0 ? '+' : ''}${num(d)}`, `${subTrend[0].label}부터 ${subTrend[subTrend.length - 1].label}까지 스냅샷`])
    }
    if (sa) {
      out.push([`기간 시청시간 ${hours(sa.totals.minutes)}`, `구독자 순증감 ${sa.totals.subsNet >= 0 ? '+' : ''}${num(sa.totals.subsNet)}, 평균 시청 ${mmss(sa.totals.avgViewSec)}`])
    }
    return out.slice(0, 4)
  }, [mine, topVideos, ch, subTrend, sa])

  /* ── 슬라이드 구성 ──
     리포트(REPORT: 스튜디오·인사이트 기준 수기 값)가 있으면 분석 슬라이드를 먼저 싣고,
     그 뒤에 주간 자동 수집 지표를 붙인다. 기간·기준이 다르므로 각 슬라이드에 병기 */
  const slides = overview ? overviewSlides() : []
  const rp = overview ? null : (REPORT.channels[channelKey] || null)
  const plan = REPORT.plan.find(p => p.k === channelKey) || null

  if (!overview) slides.push({
    key: 'cover', label: '표지',
    node: (
      <div className="dk-cover">
        <LogoLockup height={30} color="#fff" className="dk-logo" />
        <div className="dk-eyebrow">채널 성과 리포트</div>
        <h2 className="dk-title">{rp?.title || ch?.name}</h2>
        {rp && <div className="dk-cover-tag">{rp.tag}</div>}
        <div className="dk-cover-meta">
          유튜브 {ch?.channelName}<br />{rp ? `리포트 ${rp.period}` : `${ymd(YT.generatedAt)} 수집`}
        </div>
        {(() => {
          const nums = rp ? rp.stats.slice(0, 3) : [
            { v: compact(ch?.subscribers), l: '구독자' },
            { v: compact(ch?.totalViews), l: '총 조회수' },
            { v: num(ch?.totalVideos), l: '영상' },
          ]
          return (
            <>
              <Hero value={nums[0].v} label={nums[0].l} />
              <div className="dk-cover-nums">
                {nums.slice(1).map((s, i) => <div key={i}><b>{s.v}</b><span>{s.l}</span></div>)}
              </div>
            </>
          )
        })()}
      </div>
    ),
  })

  if (rp) {
    slides.push({
      key: 'rp-stats', label: '기간 성과',
      node: (
        <>
          <div className="dk-h">기간 성과 <small>{rp.period} 유튜브 스튜디오 기준</small></div>
          <Hero value={rp.stats[0].v} label={rp.stats[0].l} />
          <div className="dk-kpis four tight">
            {rp.stats.slice(1).map((s, i) => <Kpi key={i} label={s.l} value={s.v} />)}
          </div>
        </>
      ),
    })
    slides.push({
      key: 'rp-monthly', label: '월별 조회수',
      node: (
        <>
          <div className="dk-h">월별 조회수 <small>{rp.period} 개월차 기준</small></div>
          <TrendChart labels={REPORT.monthLabels}
            series={[{ name: rp.title, values: rp.monthly }]} />
        </>
      ),
    })
    slides.push({
      key: 'rp-top', label: 'TOP 5',
      node: (
        <>
          <div className="dk-h">TOP 5 인기 영상 <small>{rp.period}</small></div>
          <div className="dk-top">
            {rp.top5.map(([t, v, id], i) => (
              <a key={id} className="dk-top-row" href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank" rel="noreferrer" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="dk-rank">{i + 1}</span>
                <img className="dk-thumb" loading="lazy" src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt=""
                  onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                <span className="dk-top-t">{t}</span>
                <span className="dk-top-v">{num(v)}</span>
              </a>
            ))}
          </div>
        </>
      ),
    })
    slides.push({
      key: 'rp-insight', label: 'Insight',
      node: (
        <>
          <div className="dk-h">Insight <small>{rp.period} 성과 해석</small></div>
          <ul className="dk-insight big">
            {rp.insights.map((t, i) => <li key={i} style={{ animationDelay: `${i * 90}ms` }}>{em(t)}</li>)}
          </ul>
        </>
      ),
    })
    if (rp.ppl) {
      slides.push({
        key: 'rp-ppl', label: 'PPL과 오프라인',
        node: (
          <>
            <div className="dk-h">PPL과 오프라인 연계 현황</div>
            <div className="dk-ppl">
              {rp.ppl.map((p, i) => (
                <div className="dk-ppl-row" key={i} style={{ animationDelay: `${i * 70}ms` }}>
                  <span className={'dk-ppl-s' + (p.s === '예정' ? ' next' : '')}>{p.s}</span>
                  <span className="dk-ppl-t">{p.t}</span>
                  <span className="dk-ppl-d">{p.d}</span>
                </div>
              ))}
            </div>
          </>
        ),
      })
    }
    if (rp.ig) {
      slides.push({
        key: 'ig-stats', label: '인스타 성과',
        node: (
          <>
            <div className="dk-h">인스타그램 성과 <small>{rp.period} 인사이트 기준</small></div>
            <Hero value={rp.ig.stats[0].v} label={rp.ig.stats[0].l} />
            <div className="dk-kpis four tight">
              {rp.ig.stats.slice(1).map((s, i) => <Kpi key={i} label={s.l} value={s.v} />)}
            </div>
          </>
        ),
      })
      slides.push({
        key: 'ig-trend', label: '인스타 추이',
        node: (
          <>
            <div className="dk-h">월별 도달과 조회수 <small>인스타그램</small></div>
            <BarChart
              rows={rp.ig.reach.map((v, i) => ({ label: REPORT.monthLabels[i], v, v2: rp.ig.views[i] }))}
              series={['도달', '조회수']} unit="회" />
          </>
        ),
      })
      slides.push({
        key: 'ig-funnel', label: '전환 퍼널',
        node: (
          <>
            <div className="dk-h">도달에서 방문, 팔로우까지 전환 퍼널 <small>인스타그램</small></div>
            <div className="dk-funnel">
              {rp.ig.funnel.map((f, i) => (
                <React.Fragment key={f.l}>
                  {i > 0 && <span className="dk-funnel-ar" aria-hidden>›</span>}
                  <div className="dk-funnel-step" style={{ animationDelay: `${i * 110}ms` }}>
                    <b>{f.v}</b><span>{f.l}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div className="dk-kpis three tight">
              {rp.ig.extra.map((s, i) => <Kpi key={i} label={s.l} value={s.v} />)}
            </div>
          </>
        ),
      })
      slides.push({
        key: 'ig-insight', label: '인스타 Insight',
        node: (
          <>
            <div className="dk-h">Insight <small>인스타그램</small></div>
            <ul className="dk-insight big">
              {rp.ig.insights.map((t, i) => <li key={i} style={{ animationDelay: `${i * 90}ms` }}>{em(t)}</li>)}
            </ul>
          </>
        ),
      })
    }
    if (plan) {
      slides.push({
        key: 'plan', label: '향후 계획',
        node: (
          <>
            <div className="dk-h">향후 운영 방향 <small>3분기 이후</small></div>
            <div className="dk-plan">
              <div className="dk-plan-k">{plan.title}</div>
              <div className="dk-plan-goal">{plan.goal}</div>
              <div className="dk-plan-label">주요 실행 과제</div>
              <ul className="dk-plan-acts">
                {plan.actions.map(([when, what], i) => (
                  <li key={i} style={{ animationDelay: `${i * 80}ms` }}><b>{when}</b> {what}</li>
                ))}
              </ul>
            </div>
          </>
        ),
      })
    }
  }

  /* ── 주간 자동 수집 지표 (리포트와 기간이 다름) ── */
  if (!overview) slides.push({
    key: 'kpi', label: '수집 지표',
    node: (
      <>
        <div className="dk-h">최근 수집 지표 <small>{ymd(YT.generatedAt)} 주간 자동 수집, 리포트 기간과 별개</small></div>
        <div className="dk-kpis">
          <Kpi label="구독자" value={compact(ch?.subscribers)} sub={`${num(ch?.subscribers)}명`} />
          <Kpi label="총 조회수" value={compact(ch?.totalViews)} sub="채널 누적" />
          <Kpi label="총 영상" value={num(ch?.totalVideos)} unit="개" />
          <Kpi label="최근 평균 조회" value={compact(ch?.avgViews)} sub={`롱폼 ${compact(ch?.avgViewsVideo)}, 쇼츠 ${compact(ch?.avgViewsShorts)}`} />
          <Kpi label="조회 / 1k구독" value={num(ch?.viewsPer1kSubs)} sub="구독 1천 명당" />
          <Kpi label="최대 조회" value={compact(ch?.maxViews)} sub="수집분 최고" />
        </div>
      </>
    ),
  })
  if (sa && !overview) {
    slides.push({
      key: 'studio', label: '스튜디오 지표',
      node: (
        <>
          <div className="dk-h">스튜디오 지표 (API) <small>{ymd(YTA.range.start)} ~ {ymd(YTA.range.end)}</small></div>
          <div className="dk-kpis">
            <Kpi label="기간 조회수" value={compact(sa.totals.views)} sub={`${num(sa.totals.views)}회`} />
            <Kpi label="시청시간" value={hours(sa.totals.minutes)} sub="추정" />
            <Kpi label="구독자 증감" value={`${sa.totals.subsNet >= 0 ? '+' : ''}${num(sa.totals.subsNet)}`} sub="기간 순증감" />
            <Kpi label="평균 시청" value={mmss(sa.totals.avgViewSec)} sub={sa.totals.avgViewPct != null ? `길이의 ${sa.totals.avgViewPct}%` : null} />
            <Kpi label="좋아요" value={compact(sa.totals.likes)} sub={`댓글 ${num(sa.totals.comments)}`} />
            <Kpi label="공유" value={compact(sa.totals.shares)} sub="기간 합계" />
          </div>
        </>
      ),
    })
    slides.push({
      key: 'studio-monthly', label: 'API 월별',
      node: (
        <>
          <div className="dk-h">월별 조회수 <small>스튜디오 API</small></div>
          <TrendChart labels={sa.monthly.map(m => monthLabel(m.month))}
            series={[{ name: '조회수', values: sa.monthly.map(m => m.views) }]} />
          <table className="dk-table">
            <thead><tr><th>월</th><th>조회수</th><th>시청시간</th><th>구독자 증감</th><th>평균 시청</th></tr></thead>
            <tbody>
              {sa.monthly.map(m => (
                <tr key={m.month}>
                  <td><b>{m.month.replace('-', '.')}</b></td>
                  <td className="n">{num(m.views)}</td>
                  <td className="n">{hours(m.minutes)}</td>
                  <td className="n">{m.subsNet >= 0 ? '+' : ''}{num(m.subsNet)}</td>
                  <td className="n mute">{mmss(m.avgViewSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    })
  }
  /* 유입 경로 ('26.7.30) — "어디서 보는가". 히어로는 1위 경로 비중 */
  if (src?.traffic?.length) {
    const tot = src.traffic.reduce((a, t) => a + (t.views || 0), 0) || 1
    const rows = src.traffic.slice(0, 6).map(t => ({ label: trafficKo(t.source), v: t.views || 0 }))
    const top1 = src.traffic[0]
    slides.push({
      key: 'traffic', label: '유입 경로',
      node: (
        <>
          <div className="dk-h">시청자는 어디서 들어오나 <small>{overview ? '전 채널 합계' : '조회수 기준'}</small></div>
          <Hero value={`${Math.round((top1.views / tot) * 100)}%`}
            label={`${trafficKo(top1.source)} 유입 비중`}
            sub={`${num(top1.views)}회, 전체 ${num(tot)}회 중 최다 경로`} />
          <BarChart rows={rows} baseline={false} delta={false} sqrt />
        </>
      ),
    })
  }

  /* 시청자 구성 ('26.7.30) — "누가 보는가". 슬라이드당 히어로 1개 원칙이라
     기기 비중은 표로 겹치지 않게 부제에 한 줄로 넣는다.
     시청자 수 임계 미달이면 API가 빈 값을 주므로 그때는 슬라이드 자체를 생략 */
  if (src?.demo?.length) {
    const { ages, genders } = demoSplit(src.demo)
    const topAge = [...ages].sort((a, b) => b.pct - a.pct)[0]
    const dTot = (src.device || []).reduce((a, d) => a + (d.views || 0), 0)
    const topDev = (src.device || [])[0]
    const subBits = [
      genders.map(g => `${g.label} ${g.pct}%`).join(', '),
      topDev && dTot ? `${deviceKo(topDev.type)} 시청 ${Math.round((topDev.views / dTot) * 100)}%` : null,
    ].filter(Boolean)
    slides.push({
      key: 'demo', label: '시청자 구성',
      node: (
        <>
          <div className="dk-h">누가 보고 있나 <small>{overview ? `채널 ${agg.channelsWithDemo}개 평균` : '시청 비중'}</small></div>
          <Hero value={`${topAge.pct}%`} label={`${topAge.label} 시청 비중`} sub={subBits.join(', ')} />
          <BarChart rows={ages.map(a => ({ label: a.label, v: a.pct }))} unit="%" baseline={false} delta={false} />
        </>
      ),
    })
  }

  if (subTrend.length >= 2 && !overview) {
    slides.push({
      key: 'subs', label: '구독자 추이',
      node: (
        <>
          <div className="dk-h">구독자 추이 <small>주간 수집 스냅샷</small></div>
          <LineChart rows={subTrend} />
        </>
      ),
    })
  }
  if (!overview) slides.push({
    key: 'top', label: '최근 상위 영상',
    node: (
      <>
        <div className="dk-h">최근 수집분 상위 영상 <small>{ymd(YT.generatedAt)} 기준</small></div>
        <div className="dk-top">
          {topVideos.map((v, i) => (
            <a key={v.url} className="dk-top-row" href={v.url} target="_blank" rel="noreferrer" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="dk-rank">{i + 1}</span>
              {v.thumb && <img className="dk-thumb" loading="lazy" src={v.thumb} alt=""
                onError={e => { e.currentTarget.style.visibility = 'hidden' }} />}
              <span className="dk-top-t">{v.title}</span>
              <span className="dk-top-m">{v.type === 'Shorts' ? '쇼츠' : '롱폼'} {postDate(v.date)}</span>
              <span className="dk-top-v">{num(v.views)}</span>
            </a>
          ))}
        </div>
        {!sa && !rp && (
          <div className="dk-foot-note">
            시청시간과 구독자 증감은 YouTube Analytics 연동 후 표시됩니다 (docs/yt-analytics-setup.md).
            노출수와 노출 클릭률은 API가 제공하지 않아 스튜디오에서 확인해야 합니다.
          </div>
        )}
      </>
    ),
  })

  const total = slides.length
  const go = useCallback(d => {
    setIdx(i => {
      const n = Math.min(Math.max(i + d, 0), total - 1)
      if (n !== i) setDir(d)
      return n
    })
  }, [total])

  /* 유사 전체화면 ('26.7.30) — iOS 사파리는 영상이 아닌 요소에 requestFullscreen을
     구현하지 않아 아이폰에서 버튼이 아무 일도 하지 않았다. 네이티브가 없으면
     무대를 화면 전체에 고정하는 방식으로 대체한다 */
  const [faux, setFaux] = useState(false)

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Escape') {
        if (faux) setFaux(false)
        else if (!document.fullscreenElement) onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onBack, faux])

  useEffect(() => {
    document.body.classList.toggle('dk-locked', faux)
    return () => document.body.classList.remove('dk-locked')
  }, [faux])

  const full = () => {
    const el = stage.current
    if (!el) return
    if (document.fullscreenElement) { document.exitFullscreen?.(); return }
    if (faux) { setFaux(false); return }
    if (typeof el.requestFullscreen === 'function') {
      /* 사파리는 메서드가 있어도 거부할 수 있어 실패하면 유사 전체화면으로 내려간다 */
      Promise.resolve(el.requestFullscreen()).catch(() => setFaux(true))
    } else setFaux(true)
  }

  if (!ch && !overview) return null
  const cur = slides[Math.min(idx, total - 1)]

  return (
    <div className="dk">
      <div className="dk-bar">
        <button className="dk-back" onClick={onBack}>채널 지표로</button>
        <div className="dk-bar-r">
          <span className="dk-count">{idx + 1} / {total}</span>
          <button className="dk-btn" onClick={full}>{faux ? '전체화면 끄기' : '전체화면'}</button>
        </div>
      </div>

      {faux && <button className="dk-exit" onClick={() => setFaux(false)}>닫기</button>}
      <div
        className={'dk-stage' + (faux ? ' faux' : '')} ref={stage}
        onTouchStart={e => { touch.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touch.current == null) return
          const dx = e.changedTouches[0].clientX - touch.current
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
          touch.current = null
        }}
      >
        <div className={`dk-slide ${dir > 0 ? 'from-r' : 'from-l'}`} key={cur.key}>
          {cur.node}
        </div>

        <button className="dk-nav prev" onClick={() => go(-1)} disabled={idx === 0} aria-label="이전 슬라이드">‹</button>
        <button className="dk-nav next" onClick={() => go(1)} disabled={idx === total - 1} aria-label="다음 슬라이드">›</button>

        <div className="dk-prog"><span style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
        <div className="dk-chapter">{cur.label.replace(/\s+/g, '')}</div>

        <div className="dk-dots">
          {slides.map((s, i) => (
            <button key={s.key} className={'dk-dot' + (i === idx ? ' on' : '')}
              onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i) }} title={s.label} aria-label={s.label} />
          ))}
        </div>
      </div>

      <div className="dk-hint">좌우 키나 스와이프로 넘김 {cur.label}</div>
    </div>
  )
}
