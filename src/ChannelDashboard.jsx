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
import { YT } from './data/sns/youtube.js'
import { YTA } from './data/sns/ytAnalytics.js'
import { TREND } from './data/sns/trend.js'

const num = n => (n == null ? '—' : Math.round(n).toLocaleString('ko-KR'))
const compact = n => {
  if (n == null) return '—'
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만`
  return Math.round(n).toLocaleString('ko-KR')
}
const hours = min => (min == null ? '—' : `${Math.round(min / 60).toLocaleString('ko-KR')}h`)
const ymd = s => (s ? s.slice(0, 10).replace(/-/g, '.') : '—')
const monthLabel = m => `${Number(m.slice(5, 7))}월`
const isISO = s => /^\d{4}-\d{2}-\d{2}/.test(s || '')
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
const UNIT_KO = { second: '초', minute: '분', hour: '시간', day: '일', week: '주', month: '개월', year: '년' }
const postDate = s => {
  if (!s) return '—'
  if (isISO(s)) return ymd(s)
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
  return m ? `${m[1]}${UNIT_KO[m[2]]} 전` : s
}

/* ── 막대 (그린 단색 · 축 가로선만) ─────────────────────────── */
function BarChart({ rows, unit = '회' }) {
  const max = Math.max(...rows.map(r => r.v), 1)
  return (
    <div className="dk-chart">
      <div className="dk-bars">
        {rows.map((r, i) => (
          <div className="dk-bar-col" key={i}>
            <div className="dk-bar-v">{compact(r.v)}</div>
            <div className="dk-bar-track">
              <div className="dk-bar-fill" style={{ height: `${Math.max((r.v / max) * 100, r.v > 0 ? 1.5 : 0)}%`, animationDelay: `${i * 70}ms` }} />
            </div>
            <div className="dk-bar-l">{r.label}</div>
          </div>
        ))}
      </div>
      <div className="dk-unit">단위: {unit}</div>
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

function Kpi({ label, value, unit, sub }) {
  return (
    <div className="dk-kpi">
      <div className="dk-kpi-l">{label}</div>
      <div className="dk-kpi-v">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="dk-kpi-s">{sub}</div>}
    </div>
  )
}

export default function ChannelDashboard({ channelKey, onBack }) {
  const ch = YT.channels.find(c => c.key === channelKey)
  const sa = YTA?.channels?.[channelKey] || null
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
      out.push([`수집분의 ${Math.round((shorts.length / mine.length) * 100)}%가 쇼츠`, `쇼츠 ${shorts.length}편 · 롱폼 ${mine.length - shorts.length}편`])
    }
    if (ch.avgViewsVideo && ch.avgViewsShorts) {
      const hi = ch.avgViewsVideo >= ch.avgViewsShorts
      out.push([`${hi ? '롱폼이' : '쇼츠가'} 평균 조회 우위`, `롱폼 ${compact(ch.avgViewsVideo)} · 쇼츠 ${compact(ch.avgViewsShorts)}`])
    }
    if (subTrend.length >= 2) {
      const d = subTrend[subTrend.length - 1].v - subTrend[0].v
      out.push([`관측 기간 구독자 ${d >= 0 ? '+' : ''}${num(d)}`, `${subTrend[0].label} → ${subTrend[subTrend.length - 1].label} 스냅샷`])
    }
    if (sa) {
      out.push([`기간 시청시간 ${hours(sa.totals.minutes)}`, `구독자 순증감 ${sa.totals.subsNet >= 0 ? '+' : ''}${num(sa.totals.subsNet)} · 평균 시청 ${mmss(sa.totals.avgViewSec)}`])
    }
    return out.slice(0, 4)
  }, [mine, topVideos, ch, subTrend, sa])

  /* ── 슬라이드 구성 (데이터 있는 것만) ── */
  const slides = []
  slides.push({
    key: 'cover', label: '표지',
    node: (
      <div className="dk-cover">
        <div className="dk-eyebrow">Channel Performance</div>
        <h2 className="dk-title">{ch?.name}</h2>
        <div className="dk-cover-meta">
          유튜브 · {ch?.channelName} · {ymd(YT.generatedAt)} 수집
          {sa && ` · 스튜디오 ${ymd(YTA.range.start)}~${ymd(YTA.range.end)}`}
        </div>
        <div className="dk-cover-nums">
          <div><b>{compact(ch?.subscribers)}</b><span>구독자</span></div>
          <div><b>{compact(ch?.totalViews)}</b><span>총 조회수</span></div>
          <div><b>{num(ch?.totalVideos)}</b><span>영상</span></div>
        </div>
      </div>
    ),
  })
  slides.push({
    key: 'kpi', label: '핵심 지표',
    node: (
      <>
        <div className="dk-h">핵심 지표 <small>주간 수집 기준</small></div>
        <div className="dk-kpis">
          <Kpi label="구독자" value={compact(ch?.subscribers)} sub={`${num(ch?.subscribers)}명`} />
          <Kpi label="총 조회수" value={compact(ch?.totalViews)} sub="채널 누적" />
          <Kpi label="총 영상" value={num(ch?.totalVideos)} unit="개" />
          <Kpi label="최근 평균 조회" value={compact(ch?.avgViews)} sub={`롱폼 ${compact(ch?.avgViewsVideo)} · 쇼츠 ${compact(ch?.avgViewsShorts)}`} />
          <Kpi label="조회 / 1k구독" value={num(ch?.viewsPer1kSubs)} sub="구독 1천 명당" />
          <Kpi label="최대 조회" value={compact(ch?.maxViews)} sub="수집분 최고" />
        </div>
      </>
    ),
  })
  if (sa) {
    slides.push({
      key: 'studio', label: '스튜디오 지표',
      node: (
        <>
          <div className="dk-h">스튜디오 지표 <small>{ymd(YTA.range.start)} ~ {ymd(YTA.range.end)}</small></div>
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
      key: 'studio-monthly', label: '월별 추이',
      node: (
        <>
          <div className="dk-h">월별 조회수 <small>스튜디오 기준</small></div>
          <BarChart rows={sa.monthly.map(m => ({ label: monthLabel(m.month), v: m.views }))} />
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
  if (subTrend.length >= 2) {
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
  if (byMonth.length > 1) {
    slides.push({
      key: 'months', label: '게시월별',
      node: (
        <>
          <div className="dk-h">게시월별 조회수 <small>수집 영상의 게시일 기준 · 채널 전체 조회수 아님</small></div>
          <BarChart rows={byMonth} />
        </>
      ),
    })
  }
  slides.push({
    key: 'top', label: '상위 영상',
    node: (
      <>
        <div className="dk-h">조회수 상위 영상 <small>최근 수집분</small></div>
        <div className="dk-top">
          {topVideos.map((v, i) => (
            <a key={v.url} className="dk-top-row" href={v.url} target="_blank" rel="noreferrer" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="dk-rank">{i + 1}</span>
              {v.thumb && <img className="dk-thumb" loading="lazy" src={v.thumb} alt="" />}
              <span className="dk-top-t">{v.title}</span>
              <span className="dk-top-m">{v.type === 'Shorts' ? '쇼츠' : '롱폼'} · {postDate(v.date)}</span>
              <span className="dk-top-v">{num(v.views)}</span>
            </a>
          ))}
        </div>
      </>
    ),
  })
  if (insights.length) {
    slides.push({
      key: 'insight', label: '요약',
      node: (
        <>
          <div className="dk-h">요약 <small>수집 데이터에서 계산된 값</small></div>
          <ul className="dk-insight">
            {insights.map(([head, sub], i) => (
              <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
                <b>{head}</b>
                <span>{sub}</span>
              </li>
            ))}
          </ul>
          {!sa && (
            <div className="dk-foot-note">
              시청시간·구독자 증감·월별 추이는 YouTube Analytics 연동 후 슬라이드가 자동 추가됩니다
              (docs/yt-analytics-setup.md). 노출수·노출 클릭률은 API 미제공이라 스튜디오에서 확인해야 합니다.
            </div>
          )}
        </>
      ),
    })
  }

  const total = slides.length
  const go = useCallback(d => {
    setIdx(i => {
      const n = Math.min(Math.max(i + d, 0), total - 1)
      if (n !== i) setDir(d)
      return n
    })
  }, [total])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Escape' && !document.fullscreenElement) onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onBack])

  const full = () => {
    const el = stage.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.()
  }

  if (!ch) return null
  const cur = slides[Math.min(idx, total - 1)]

  return (
    <div className="dk">
      <div className="dk-bar">
        <button className="dk-back" onClick={onBack}>‹ 채널 지표로</button>
        <div className="dk-bar-r">
          <span className="dk-count">{idx + 1} / {total}</span>
          <button className="dk-btn" onClick={full}>전체화면</button>
        </div>
      </div>

      <div
        className="dk-stage" ref={stage}
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

        <div className="dk-dots">
          {slides.map((s, i) => (
            <button key={s.key} className={'dk-dot' + (i === idx ? ' on' : '')}
              onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i) }} title={s.label} aria-label={s.label} />
          ))}
        </div>
      </div>

      <div className="dk-hint">← → 키 · 스와이프로 넘김 · {cur.label}</div>
    </div>
  )
}
