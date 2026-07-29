import React, { useState, useEffect, useMemo } from 'react'
import { fetchShareMeta, fetchShare } from './lib/shareStore.js'
import { Kpi, Donut, HBars, DuoBars } from './Charts.jsx'

/* 광고주 공유 리포트 ('26.7.29) — ?share=<token> 진입, 로그인 없음.
   발급 시점 스냅샷(해당 캠페인 데이터만)을 RPC로 열람 — 30일 만료·임시 비밀번호.
   내용 = 엑셀 결과보고서 항목(일별 노출·클릭·CTR) + 구좌별 비교·요일 인사이트·하이라이트 */

const nf = n => (n == null ? '—' : Number(n).toLocaleString('ko-KR'))
const compact = n => {
  if (n == null) return '—'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) {
    const v = n / 10000
    return (v >= 100 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(1)) + '만'
  }
  return n.toLocaleString('ko-KR')
}
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const fmtD = iso => { const d = new Date(iso + 'T00:00:00'); return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})` }
const slotName = s => (s || '').replace(/^통합앱_/, '')
const ctrOf = (clk, imp) => (imp > 0 ? (clk / imp * 100) : null)
const ctrDisp = v => (v == null ? '—' : v.toFixed(2) + '%')
const fmtDT = iso => {
  if (!iso) return null
  const d = new Date(iso)
  const t = d.getHours() || d.getMinutes() ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  return `${d.getMonth() + 1}.${d.getDate()}${t}`
}

/* GA 미측정 매체 한 줄 요약 ('26.7.29) — 매체사가 노출·클릭을 주지 않는 상품(카카오톡·푸쉬·
   인스타)은 집행 사실(발송 건수·게시 구성·일자)만 표기한다. 지표 추정·환산은 하지 않음 */
const UNMEASURED_NOTE = {
  카카오톡: '오픈·클릭률은 카카오 정책상 미제공',
  푸쉬: '수신 후 반응은 앱 지표에 합산',
  인스타그램: '게시물 반응은 별도 공유',
}
function execLine(p) {
  if (p.sendQty) return `발송 ${nf(p.sendQty)}건${fmtDT(p.sendAt) ? ` · ${fmtDT(p.sendAt)}` : ''}`
  if (p.option) return `${p.option}${p.start ? ` · ${fmtD(p.start)}` : ''}`
  if (p.start) return p.end && p.end !== p.start ? `${fmtD(p.start)} ~ ${fmtD(p.end)}` : fmtD(p.start)
  return '집행'
}

function Report({ d }) {
  const c = useMemo(() => {
    const daily = d.daily || []
    const imp = daily.reduce((a, r) => a + (r.imp || 0), 0)
    const clk = daily.reduce((a, r) => a + (r.clk || 0), 0)
    /* 일별 합산 (구좌 합) */
    const byDate = {}
    for (const r of daily) {
      const v = (byDate[r.date] = byDate[r.date] || { imp: 0, clk: 0 })
      v.imp += r.imp || 0; v.clk += r.clk || 0
    }
    const dates = Object.keys(byDate).sort()
    const days = dates.length
    /* 구좌별 합산 */
    const bySlot = {}
    for (const r of daily) {
      const v = (bySlot[r.slot] = bySlot[r.slot] || { imp: 0, clk: 0 })
      v.imp += r.imp || 0; v.clk += r.clk || 0
    }
    const slots = Object.entries(bySlot).sort((a, b) => b[1].imp - a[1].imp)
    /* 요일 평균 (노출 있는 날만) */
    const byDow = Array.from({ length: 7 }, () => ({ imp: 0, n: 0 }))
    for (const dt of dates) {
      const w = new Date(dt + 'T00:00:00').getDay()
      byDow[w].imp += byDate[dt].imp; byDow[w].n++
    }
    const dowAvg = byDow.map((v, i) => ({ name: DOW[i] + '요일', value: v.n ? Math.round(v.imp / v.n) : null }))
      .filter(v => v.value != null).sort((a, b) => b.value - a.value)
    /* 하이라이트 */
    const peak = dates.reduce((best, dt) => (!best || byDate[dt].imp > byDate[best].imp ? dt : best), null)
    const peakCtr = dates.filter(dt => byDate[dt].imp > 500)
      .reduce((best, dt) => {
        const v = ctrOf(byDate[dt].clk, byDate[dt].imp)
        return (!best || v > best.v) ? { dt, v } : best
      }, null)
    return { imp, clk, ctr: ctrOf(clk, imp), byDate, dates, days, slots, dowAvg, peak, peakCtr }
  }, [d])

  const spend = d.spend || null
  const period = `${fmtD(d.start)} ~ ${fmtD(d.end)}`
  const until = d.expiresAt ? new Date(d.expiresAt) : null
  /* GA 미측정 매체 ('26.7.29). measured 필드가 없는 구 스냅샷은 종전대로 표기하지 않음 */
  const prods = d.products || []
  const unmeasured = prods.filter(p => p.measured === false)
  const sendTotal = unmeasured.reduce((a, p) => a + (p.sendQty || 0), 0)
  const hasDaily = c.dates.length > 0

  return (
    <div className="wrap shr-wrap">
      <header>
        <div className="shr-brand">THE HYUNDAI 미디어콘텐츠팀 · 캠페인 결과 리포트</div>
        <h1 className="home-greet">{d.advertiser}{d.campaign ? ` — ${d.campaign}` : ''}</h1>
        <div className="masthead-sub">
          집행 {period} · {(d.products || []).map(p => slotName(p.product)).join(' · ')}
          {until && ` · 본 리포트는 ${until.getMonth() + 1}월 ${until.getDate()}일까지 열람 가능합니다`}
        </div>
      </header>

      {hasDaily ? (
        <div className="mon-hero">
          <Kpi label="총 노출" value={compact(c.imp)} sub={`일 평균 ${compact(c.days ? Math.round(c.imp / c.days) : 0)}`} />
          <Kpi label="총 클릭" value={compact(c.clk)} sub={`일 평균 ${compact(c.days ? Math.round(c.clk / c.days) : 0)}`} />
          <Kpi label="클릭률 (CTR)" value={c.ctr != null ? c.ctr.toFixed(2) : '—'} unit="%" sub="클릭 ÷ 노출" />
          {spend
            ? <Kpi label="광고비" value={compact(spend)} unit="원"
                sub={`CPM ${c.imp ? nf(Math.round(spend / c.imp * 1000)) : '—'}원 · CPC ${c.clk ? nf(Math.round(spend / c.clk)) : '—'}원`} />
            : <Kpi label="집행 기간" value={c.days} unit="일" sub={`구좌 ${c.slots.length}개`} />}
        </div>
      ) : (
        /* 앱 구좌 실적이 없는 캠페인 (발송·게시형만 집행) — 확정 수치만 표기 */
        <div className="mon-hero">
          <Kpi label="집행 매체" value={prods.length} unit="개" sub={period} />
          {sendTotal > 0 && <Kpi label="총 발송" value={compact(sendTotal)} unit="건" sub="메시지 발송 완료" />}
          {spend && <Kpi label="광고비" value={compact(spend)} unit="원" sub="집행 기준" />}
        </div>
      )}

      {hasDaily && (c.peak || c.peakCtr) && (
        <div className="dash-panel shr-hl">
          <div className="group-label">하이라이트</div>
          <ul className="shr-points">
            {c.peak && (
              <li><b>{fmtD(c.peak)}</b>에 노출이 가장 많았습니다 — {nf(c.byDate[c.peak].imp)}회
                (캠페인 일 평균의 {c.days && c.imp ? (c.byDate[c.peak].imp / (c.imp / c.days)).toFixed(1) : '—'}배)</li>
            )}
            {c.peakCtr && (
              <li><b>{fmtD(c.peakCtr.dt)}</b>의 클릭률이 가장 높았습니다 — {ctrDisp(c.peakCtr.v)}</li>
            )}
            {c.slots.length > 1 && c.imp > 0 && (
              <li>노출의 <b>{Math.round(c.slots[0][1].imp / c.imp * 100)}%</b>가
                {' '}<b>{slotName(c.slots[0][0])}</b> 구좌에서 발생했습니다</li>
            )}
          </ul>
        </div>
      )}

      {hasDaily && <>
      <div className="dash-grid g23">
        <div className="dash-panel">
          <div className="group-label">일별 노출</div>
          <div className="dash-d">구좌 합산 · 회</div>
          <DuoBars data={c.dates.map(dt => [fmtD(dt).split(' ')[0], c.byDate[dt].imp])} fmt={compact} />
        </div>
        <div className="dash-panel flat">
          <div className="group-label">구좌별 노출 비중</div>
          <div className="dash-d">집행 구좌 합산</div>
          <Donut data={c.slots.map(([s, v]) => [slotName(s), v.imp])} center={compact(c.imp)} sub="총 노출" fmt={compact} />
        </div>
      </div>

      <div className="dash-grid g32">
        <div className="dash-panel">
          <div className="group-label">구좌별 성과</div>
          <div className="dash-d">노출 막대 · 우측 = 클릭률</div>
          <HBars rows={c.slots.map(([s, v]) => ({
            name: slotName(s), sub: `클릭 ${nf(v.clk)}`, value: v.imp, disp: ctrDisp(ctrOf(v.clk, v.imp)), unit: 'CTR',
          }))} />
        </div>
        <div className="dash-panel">
          <div className="group-label">요일별 평균 노출</div>
          <div className="dash-d">집행일 기준 평균 · 회</div>
          <HBars rows={c.dowAvg.map(v => ({ name: v.name, value: v.value, disp: compact(v.value) }))} />
        </div>
      </div>

      <div className="dash-panel" style={{ marginTop: 16 }}>
        <div className="group-label">일별 상세</div>
        <div className="dash-d">결과보고서 원장 — 노출 · 클릭 · 클릭률</div>
        <div className="mon-scroll shr-table">
          <table className="mon-table">
            <thead><tr><th>일자</th><th>노출</th><th>클릭</th><th>클릭률</th></tr></thead>
            <tbody>
              {c.dates.map(dt => (
                <tr key={dt}>
                  <td className="mon-acc">{fmtD(dt)}</td>
                  <td className="strong">{nf(c.byDate[dt].imp)}</td>
                  <td>{nf(c.byDate[dt].clk)}</td>
                  <td className="mute">{ctrDisp(ctrOf(c.byDate[dt].clk, c.byDate[dt].imp))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>}

      {/* 매체사 미제공 매체 ('26.7.29) — 집행 사실만 표기. 지표 추정·환산 없음 */}
      {unmeasured.length > 0 && (
        <div className="dash-panel" style={{ marginTop: 16 }}>
          <div className="group-label">그 외 집행 매체</div>
          <div className="dash-d">
            아래 매체는 매체사에서 노출·클릭 데이터를 제공하지 않아 집행 내역만 표기합니다
            {hasDaily && ' (위 성과 수치에는 포함되지 않습니다)'}
          </div>
          <div className="mon-scroll shr-table">
            <table className="mon-table">
              <thead><tr><th>매체</th><th>집행 내역</th><th>비고</th></tr></thead>
              <tbody>
                {unmeasured.map((p, i) => (
                  <tr key={i}>
                    <td className="mon-acc">{slotName(p.product)}{p.qty > 1 ? ` ×${p.qty}` : ''}</td>
                    <td className="strong">{execLine(p)}</td>
                    <td className="mute">{UNMEASURED_NOTE[p.product] || '매체사 지표 미제공'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <footer>
        본 페이지는 광고주 확인용 임시 리포트입니다 (기한 경과 시 자동 만료) ·
        {hasDaily ? ' 노출·클릭 기준: Google Analytics 4 ·' : ' 집행 내역 기준 ·'}
        {' '}문의: 현대백화점 미디어콘텐츠팀
      </footer>
    </div>
  )
}

export default function ShareReport({ token }) {
  const [meta, setMeta] = useState(undefined)   // undefined=로딩 · null=없음
  const [data, setData] = useState(null)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchShareMeta(token).then(m => {
      setMeta(m || null)
      if (m && !m.needsPw && !m.expired) unlock(null)
    }).catch(() => setMeta(null))
  }, [token])

  const unlock = async pwVal => {
    setBusy(true); setErr(null)
    try {
      const d = await fetchShare(token, pwVal)
      if (!d) { setErr('비밀번호가 올바르지 않습니다'); return }
      setData(d)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (data) return <Report d={data} />

  return (
    <div className="wrap shr-wrap">
      <header>
        <div className="shr-brand">THE HYUNDAI 미디어콘텐츠팀 · 캠페인 결과 리포트</div>
        <h1>{meta === undefined ? '리포트 확인 중…' : meta === null ? '리포트를 찾을 수 없습니다'
          : `${meta.advertiser}${meta.campaign ? ` — ${meta.campaign}` : ''}`}</h1>
        {meta === null && <div className="masthead-sub">링크가 잘못되었거나 회수된 리포트입니다 — 담당자에게 문의해 주세요</div>}
        {meta?.expired && <div className="masthead-sub">열람 기간이 만료된 리포트입니다 — 담당자에게 문의해 주세요</div>}
      </header>
      {meta && !meta.expired && meta.needsPw && (
        <form className="login-card" onSubmit={e => { e.preventDefault(); unlock(pw.trim()) }}>
          <label>전달받은 비밀번호
            <input type="password" autoComplete="off" value={pw} onChange={e => setPw(e.target.value)} required />
          </label>
          {err && <div className="qa-err">{err}</div>}
          <button className="btn-solid" type="submit" disabled={busy}>{busy ? '확인 중…' : '리포트 열람'}</button>
        </form>
      )}
    </div>
  )
}
