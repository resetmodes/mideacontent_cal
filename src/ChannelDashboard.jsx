/* 채널 성과 대시보드 ('26.7.29) — 모니터링 탭 채널 행 클릭 시 진입.
   원본(외부 제작 HTML 리포트)의 정보 구조를 우리 디자인 기준으로 재구성:
   ─ 컬러: 흑백 + 현대그린 1색 (채널별 컬러 코딩·글로우·그라데이션 제거)
   ─ 위계: 타이포 크기·굵기 대비, 규격/지표 숫자는 대형 tabular-nums
   ─ 표는 가로선만, 카드 그림자·과잉 radius·이모지 없음
   ─ 차트는 의존성 0 인라인 SVG (Chart.js 미사용 — 번들·톤 모두 불필요)

   데이터 2층:
   ① 수집 지표(항상) — youtube.js(Apify 주간 수집) + trend.js(스냅샷 추이)
   ② 스튜디오 지표(선택) — ytAnalytics.js (YouTube Analytics API, 연동 후 자동 표시)
   노출수·CTR은 Analytics API 미제공이라 "스튜디오 확인"으로만 안내 (수치 날조 금지) */
import React, { useMemo } from 'react'
import { YT } from './data/sns/youtube.js'
import { YTA } from './data/sns/ytAnalytics.js'
import { TREND } from './data/sns/trend.js'

const num = n => (n == null ? '—' : n.toLocaleString('ko-KR'))
const compact = n => {
  if (n == null) return '—'
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만`
  return n.toLocaleString('ko-KR')
}
const hours = min => (min == null ? '—' : `${Math.round(min / 60).toLocaleString('ko-KR')}h`)
const ymd = s => (s ? s.slice(0, 10).replace(/-/g, '.') : '—')
const monthLabel = m => `${Number(m.slice(5, 7))}월`   // "2026-07" → "7월"
const isISO = s => /^\d{4}-\d{2}-\d{2}/.test(s || '')
/* 게시일 표기 — 스크레이퍼 carry-forward 데이터는 "3 months ago" 상대 표기가 섞임 */
const UNIT_KO = { second: '초', minute: '분', hour: '시간', day: '일', week: '주', month: '개월', year: '년' }
const postDate = s => {
  if (!s) return '—'
  if (isISO(s)) return ymd(s)
  const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
  return m ? `${m[1]}${UNIT_KO[m[2]]} 전` : s
}

/* ── 인라인 SVG 막대 (그린 단색, 축 가로선만) ───────────────── */
function BarChart({ rows, height = 168, unit = '회' }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map(r => r.v), 1)
  const W = 100, gap = 2.4
  const bw = (W - gap * (rows.length - 1)) / rows.length
  return (
    <div className="cd-chart">
      <svg viewBox={`0 0 ${W} 46`} preserveAspectRatio="none" style={{ height }} role="img">
        <line x1="0" y1="45.6" x2={W} y2="45.6" className="cd-axis" />
        {rows.map((r, i) => {
          const h = Math.max((r.v / max) * 40, r.v > 0 ? 0.8 : 0)
          return <rect key={i} x={i * (bw + gap)} y={45.6 - h} width={bw} height={h} className="cd-bar" />
        })}
      </svg>
      <div className="cd-xaxis">
        {rows.map((r, i) => (
          <div key={i} className="cd-xtick">
            <b>{compact(r.v)}</b>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
      <div className="cd-unit">단위: {unit}</div>
    </div>
  )
}

/* ── 인라인 SVG 꺾은선 (스냅샷 추이) ───────────────────────── */
function LineChart({ rows, height = 132 }) {
  if (rows.length < 2) return null
  const max = Math.max(...rows.map(r => r.v)), min = Math.min(...rows.map(r => r.v))
  const span = max - min || 1
  const pt = (r, i) => [(i / (rows.length - 1)) * 100, 38 - ((r.v - min) / span) * 32]
  const d = rows.map((r, i) => `${i ? 'L' : 'M'}${pt(r, i).map(n => n.toFixed(2)).join(' ')}`).join(' ')
  return (
    <div className="cd-chart">
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" style={{ height }} role="img">
        <line x1="0" y1="41.6" x2="100" y2="41.6" className="cd-axis" />
        <path d={d} className="cd-line" vectorEffect="non-scaling-stroke" />
        {rows.map((r, i) => {
          const [x, y] = pt(r, i)
          return <circle key={i} cx={x} cy={y} r="0.9" className="cd-dot" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <div className="cd-xaxis">
        {rows.map((r, i) => (
          <div key={i} className="cd-xtick"><b>{compact(r.v)}</b><span>{r.label}</span></div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, unit, sub }) {
  return (
    <div className="cd-stat">
      <div className="cd-stat-label">{label}</div>
      <div className="cd-stat-value">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="cd-stat-sub">{sub}</div>}
    </div>
  )
}

export default function ChannelDashboard({ channelKey, onBack }) {
  const ch = YT.channels.find(c => c.key === channelKey)
  const sa = YTA?.channels?.[channelKey] || null

  /* 구독자 추이 — 주간 스냅샷 (수집 시마다 1점 누적) */
  const subTrend = useMemo(() => (TREND || [])
    .filter(s => s.yt?.[channelKey]?.s != null)
    .map(s => ({ label: ymd(s.date).slice(5), v: s.yt[channelKey].s })), [channelKey])

  /* 게시월별 조회수 — 수집분의 게시일 기준. 상대 표기("3 months ago")가 섞인
     carry-forward 행은 월을 특정할 수 없어 제외하고, 최근 6개월만 표시 */
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

  const topVideos = useMemo(() => (YT.videos || [])
    .filter(v => v.channel === channelKey)
    .sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5), [channelKey])

  if (!ch) return null

  return (
    <div className="cd">
      <button className="cd-back" onClick={onBack}>‹ 채널 지표로</button>

      <div className="cd-head">
        <h2>{ch.name}</h2>
        <div className="cd-meta">
          유튜브 · <a href={ch.url} target="_blank" rel="noreferrer">{ch.channelName}</a>
          {' · '}{ymd(YT.generatedAt)} 수집
          {sa && ` · 스튜디오 지표 ${ymd(sa && YTA.range.start)}~${ymd(YTA.range.end)}`}
        </div>
      </div>

      {/* ① 수집 지표 — 항상 표시 */}
      <div className="cd-stats">
        <Stat label="구독자" value={compact(ch.subscribers)} sub={`${num(ch.subscribers)}명`} />
        <Stat label="총 조회수" value={compact(ch.totalViews)} sub="채널 누적" />
        <Stat label="총 영상" value={num(ch.totalVideos)} unit="개" />
        <Stat label="최근 평균 조회" value={compact(ch.avgViews)} sub={`롱폼 ${compact(ch.avgViewsVideo)} · 쇼츠 ${compact(ch.avgViewsShorts)}`} />
        <Stat label="조회 / 1k구독" value={num(ch.viewsPer1kSubs)} sub="구독 1천 명당 조회" />
      </div>

      {/* ② 스튜디오 지표 — Analytics 연동 시 */}
      {sa ? (
        <>
          <div className="group-label">스튜디오 지표 <small className="cd-note-inline">{YTA.range.start.replace(/-/g, '.')} ~ {YTA.range.end.replace(/-/g, '.')}</small></div>
          <div className="cd-stats">
            <Stat label="기간 조회수" value={compact(sa.totals.views)} sub={`${num(sa.totals.views)}회`} />
            <Stat label="시청시간" value={hours(sa.totals.minutes)} sub="추정 시청시간" />
            <Stat label="구독자 증감" value={(sa.totals.subsNet > 0 ? '+' : '') + num(sa.totals.subsNet)} sub="기간 순증감" />
            <Stat label="평균 시청" value={`${Math.floor(sa.totals.avgViewSec / 60)}:${String(sa.totals.avgViewSec % 60).padStart(2, '0')}`} sub={sa.totals.avgViewPct != null ? `영상 길이의 ${sa.totals.avgViewPct}%` : null} />
            <Stat label="반응" value={compact(sa.totals.likes)} sub={`댓글 ${num(sa.totals.comments)} · 공유 ${num(sa.totals.shares)}`} />
          </div>

          <div className="group-label">월별 조회수</div>
          <BarChart rows={sa.monthly.map(m => ({ label: monthLabel(m.month), v: m.views }))} />

          <div className="group-label">월별 시청시간 · 구독자 증감</div>
          <div className="mon-scroll">
            <table className="mon-table">
              <thead><tr><th>월</th><th>조회수</th><th>시청시간</th><th>구독자 증감</th><th>평균 시청</th></tr></thead>
              <tbody>
                {sa.monthly.map(m => (
                  <tr key={m.month}>
                    <td className="mon-acc"><b>{m.month.replace('-', '.')}</b></td>
                    <td className="strong">{num(m.views)}</td>
                    <td>{hours(m.minutes)}</td>
                    <td className={m.subsNet < 0 ? 'mute' : 'strong'}>{(m.subsNet > 0 ? '+' : '') + num(m.subsNet)}</td>
                    <td className="mute">{Math.floor(m.avgViewSec / 60)}:{String(m.avgViewSec % 60).padStart(2, '0')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mon-note cd-pending">
          <b>스튜디오 지표(시청시간·구독자 증감·월별 추이)는 YouTube Analytics 연동 후 표시됩니다.</b><br />
          채널 소유 계정 1회 인증이 필요합니다 — 절차는 docs/yt-analytics-setup.md.
          노출수·노출 클릭률(CTR)은 API가 제공하지 않아 스튜디오에서 직접 확인해야 합니다.
        </div>
      )}

      {/* ③ 추이 — 수집 스냅샷 */}
      {subTrend.length >= 2 && (
        <>
          <div className="group-label">구독자 추이 <small className="cd-note-inline">주간 수집 스냅샷</small></div>
          <LineChart rows={subTrend} />
        </>
      )}

      {byMonth.length > 1 && (
        <>
          <div className="group-label">게시월별 조회수 <small className="cd-note-inline">수집된 영상의 게시일 기준 · 채널 전체 조회수가 아님</small></div>
          <BarChart rows={byMonth} />
        </>
      )}

      {/* ④ 상위 영상 */}
      <div className="group-label">조회수 상위 영상</div>
      <div className="cd-top">
        {topVideos.map((v, i) => (
          <a key={v.url} className="cd-top-row" href={v.url} target="_blank" rel="noreferrer">
            <span className="cd-rank">{i + 1}</span>
            {v.thumb && <img className="cd-thumb" loading="lazy" src={v.thumb} alt="" />}
            <span className="cd-top-title">{v.title}</span>
            <span className="cd-top-meta">{v.type === 'Shorts' ? '쇼츠' : '롱폼'} · {postDate(v.date)}</span>
            <span className="cd-top-views">{num(v.views)}</span>
          </a>
        ))}
      </div>
      {sa?.top?.length > 0 && (
        <div className="mon-note">
          스튜디오 기준 상위: {sa.top.slice(0, 3).map(t => `${t.title} (${num(t.views)})`).join(' · ')}
        </div>
      )}
    </div>
  )
}
