import React from 'react'

/* 공용 차트 (v2 3차 '26.7.29 — 대시보드 확장) — 의존성 0, 인라인 SVG·DOM.
   컬러 원칙: 시리즈는 그린 명도 계단(--s1~--s5)만, 비교군(작년 등)은 라일락(--lilac-bar),
   형광은 최대값 1개 전용. 스타일은 index.css "공용 차트" 섹션 */

/* 시리즈 팔레트 ('26.7.29 확장) — 그린 앵커 + 라일락·세이지·샌드·슬레이트 파스텔.
   그린 단색 계단은 인접 조각 구분이 안 된다는 지적으로 교체 (브랜드 그린·라일락 우선) */
export const SERIES = ['#0B4336', '#C9A0BE', '#7FA795', '#D9C6A5', '#9BA8C4']

const nf = n => (n == null ? '—' : Number(n).toLocaleString('ko-KR'))

/* ── 스파크라인 — KPI 카드 하단 미니 추세 ── */
export function Spark({ data }) {
  const d = (data || []).filter(v => v != null)
  if (d.length < 2) return null
  const mx = Math.max(...d), mn = Math.min(...d), sp = (mx - mn) || 1
  const pad = mn - sp * 0.4, rng = (mx - pad) * 1.12 - pad * 0.12 || 1
  const pt = d.map((v, i) => [i * (200 / (d.length - 1)), 38 - ((v - pad) / ((mx - pad) * 1.12 || 1)) * 36])
  const line = pt.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  return (
    <svg className="spark" viewBox="0 0 200 38" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L200 38 L0 38 Z`} fill="rgba(11,67,54,.10)" />
      <path d={line} fill="none" stroke="#0B4336" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={pt.at(-1)[0]} cy={pt.at(-1)[1].toFixed(1)} r="2.6" fill="#0B4336" />
    </svg>
  )
}

/* ── 도넛 + 범례 — data: [[라벨, 값]] ── */
export function Donut({ data, center, sub = '합계', size = 148, fmt = nf }) {
  const rows = (data || []).filter(d => d[1] > 0)
  const total = rows.reduce((a, b) => a + b[1], 0)
  if (!total) return null
  const r = size / 2 - 13, c = size / 2, C = 2 * Math.PI * r
  let off = 0
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {rows.map((d, i) => {
            const frac = d[1] / total
            const dash = `${Math.max(0, C * frac - 2).toFixed(1)} ${(C - C * frac + 2).toFixed(1)}`
            const el = (
              <circle key={d[0]} cx={c} cy={c} r={r} fill="none" stroke={SERIES[i % SERIES.length]}
                strokeWidth="20" strokeDasharray={dash} strokeDashoffset={(-off).toFixed(1)}
                transform={`rotate(-90 ${c} ${c})`} />
            )
            off += C * frac
            return el
          })}
        </svg>
        <div className="donut-ctr"><b className="num">{center}</b><span>{sub}</span></div>
      </div>
      <div className="donut-leg">
        {rows.map((d, i) => (
          <div key={d[0]} className="dleg-row">
            <span className="dleg-dot" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="dleg-n">{d[0]}</span>
            <span className="dleg-v num">{fmt(d[1])}</span>
            <span className="dleg-p num">{Math.round(d[1] / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 수평 랭킹 바 — rows: [{name, sub?, value, disp?, unit?}], sqrt: 이상치 완화 ── */
export function HBars({ rows, sqrt = false, unit = '' }) {
  const list = (rows || []).filter(r => r.value != null)
  if (list.length === 0) return null
  const max = Math.max(...list.map(r => r.value)) || 1
  const w = v => Math.max(3, (sqrt ? Math.sqrt(v) / Math.sqrt(max) : v / max) * 100)
  return (
    <div className="hbars">
      {list.map((r, i) => (
        <div key={r.name + i} className="hb">
          <span className="hb-n">{r.name}{r.sub && <small>{r.sub}</small>}</span>
          <span className="hb-t"><span className={'hb-f' + (i === 0 ? ' max' : '')} style={{ width: w(r.value) + '%' }} /></span>
          <span className="hb-v num">{r.disp ?? nf(r.value)}{(r.unit ?? unit) && <em>{r.unit ?? unit}</em>}</span>
        </div>
      ))}
    </div>
  )
}

/* ── 월별 이중 막대 — data: [[라벨, 올해, 작년?]] · 작년(b)은 라일락 ── */
export function DuoBars({ data, fmt = nf, legendA, legendB }) {
  const rows = (data || []).filter(d => d[1] != null || d[2] != null)
  if (rows.length === 0) return null
  const max = Math.max(...rows.flatMap(d => [d[1] || 0, d[2] || 0])) || 1
  const hasB = rows.some(d => d[2] != null)
  return (
    <>
      <div className="duo-bars">
        {rows.map(([l, a, b]) => (
          <div key={l} className="duo-col">
            <div className="duo-v num">{fmt(a || 0)}</div>
            <div className="duo-track">
              <span className={'duo-fill' + ((a || 0) === max ? ' max' : '')} style={{ height: ((a || 0) / max * 100) + '%' }} />
              {hasB && <span className="duo-fill alt" style={{ height: ((b || 0) / max * 100) + '%' }} />}
            </div>
            <div className="duo-l">{l}</div>
          </div>
        ))}
      </div>
      {legendA && (
        <div className="ch-legend">
          <span className="ch-lg"><i />{legendA}</span>
          {hasB && legendB && <span className="ch-lg alt"><i />{legendB}</span>}
        </div>
      )}
    </>
  )
}

/* ── 다중 꺾은선 (순증) — series: [[이름, [값...]]], 첫 값 대비 누적 증가로 정규화 ── */
export function TrendLines({ dates, series, delta = true, fmt = nf }) {
  const S = (series || []).filter(s => s[1] && s[1].length >= 2)
  if (S.length === 0 || !dates || dates.length < 2) return null
  const D = delta ? S.map(s => [s[0], s[1].map(v => v - s[1][0])]) : S
  const all = D.flatMap(s => s[1])
  const hi = Math.max(...all) * 1.15 || 1, lo = Math.min(0, ...all)
  const W = 640, H = 220, PL = 58, PR = 14, PT = 14, PB = 26
  const x = i => PL + i * ((W - PL - PR) / (dates.length - 1))
  const y = v => PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB)
  const used = []
  return (
    <div>
      <svg className="tl-svg" viewBox={`0 0 ${W} ${H}`}>
        {[0, 1, 2, 3].map(k => {
          const v = lo + (hi - lo) * k / 3, yy = y(v)
          return (
            <g key={k}>
              <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="rgba(19,32,25,.07)" />
              <text x={PL - 8} y={yy + 4} textAnchor="end" fontSize="10.5" fill="#88968E">
                {delta && v >= 0 ? '+' : ''}{Math.round(v).toLocaleString()}
              </text>
            </g>
          )
        })}
        {D.map((s, i) => {
          const pts = s[1].map((v, j) => [x(j), y(v)])
          const d = pts.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
          let ly = pts.at(-1)[1] - 9
          while (used.some(u => Math.abs(u - ly) < 13)) ly += 13
          used.push(ly)
          return (
            <g key={s[0]}>
              {i === 0 && <path d={`${d} L${x(dates.length - 1)} ${y(0)} L${PL} ${y(0)} Z`} fill="rgba(11,67,54,.08)" />}
              <path d={d} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth={i === 0 ? 2.6 : 1.8} strokeLinejoin="round" />
              {pts.map((p, j) => (
                <circle key={j} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={i === 0 ? 3 : 2.4}
                  fill="#fff" stroke={SERIES[i % SERIES.length]} strokeWidth="1.8" />
              ))}
              <text x={pts.at(-1)[0] - 4} y={ly} textAnchor="end" fontSize="11.5" fontWeight="800" fill={SERIES[i % SERIES.length]}>
                {delta && s[1].at(-1) >= 0 ? '+' : ''}{fmt(s[1].at(-1))}
              </text>
            </g>
          )
        })}
        {dates.map((d, i) => (
          <text key={d + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#88968E">{d}</text>
        ))}
      </svg>
      <div className="ch-legend">
        {D.map((s, i) => (
          <span key={s[0]} className="ch-lg"><i style={{ background: SERIES[i % SERIES.length] }} />{s[0]}</span>
        ))}
      </div>
    </div>
  )
}

/* ── 링 게이지 — pct 0~100 ── */
export function Gauge({ pct, label, sub, statusFull = '마감', statusOpen = '판매 중' }) {
  const p = Math.max(0, Math.min(100, pct))
  const r = 44, c = 56, C = 2 * Math.PI * r
  const full = p >= 100
  return (
    <div className="gau">
      <div className="gau-ring">
        <svg viewBox="0 0 112 112">
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(19,32,25,.07)" strokeWidth="13" />
          <circle cx={c} cy={c} r={r} fill="none" stroke={full ? '#0B4336' : '#5C8C7B'} strokeWidth="13"
            strokeLinecap="round" strokeDasharray={`${(C * p / 100).toFixed(1)} ${C.toFixed(1)}`}
            transform={`rotate(-90 ${c} ${c})`} />
        </svg>
        <div className="gau-v"><b className="num">{Math.round(p)}%</b><span>{full ? statusFull : statusOpen}</span></div>
      </div>
      <div className="gau-n">{label}</div>
      {sub && <div className="gau-s">{sub}</div>}
    </div>
  )
}

/* ── 상태 파이프라인 — steps: [[라벨, 건수]] ── */
export function Pipeline({ steps }) {
  const rows = steps || []
  const max = Math.max(1, ...rows.map(s => s[1]))
  return (
    <div className="pipe">
      {rows.map(([l, n], i) => (
        <React.Fragment key={l}>
          {i > 0 && <span className="pipe-arr">›</span>}
          <div className="pipe-step">
            <div className="pipe-bar" style={{ height: 34 + n / max * 58, background: SERIES[Math.min(i, 4)] }}>
              <span className="pipe-cnt num" style={{ color: i < 3 ? '#fff' : '#132019' }}>{n}</span>
            </div>
            <div className="pipe-lab">{l}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

/* ── KPI 카드 (스파크 포함) — 페이지들이 공유하는 카드 한 장 ── */
export function Kpi({ label, value, unit, delta, deltaUp, sub, spark }) {
  return (
    <div className="mon-stat">
      <div className="mon-label">{label}</div>
      <div className="mon-value">
        {value}{unit && <small>{unit}</small>}
        {delta != null && <span className={'kpi-dl' + (deltaUp ? ' up' : '')}>{delta}</span>}
      </div>
      {sub && <div className="mon-sub">{sub}</div>}
      {spark && <Spark data={spark} />}
    </div>
  )
}
