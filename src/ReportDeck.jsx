/* 월간 운영 리포트 덱 ('26.7.31) — 시안(scratch 12장) 실구현
   수치 = src/lib/reportDeck.js 계산값 그대로, 서술 = api/report-narrate.js (모델).
   원칙: 데이터 없는 슬라이드 자동 생략, 서술 속 미확인 숫자는 경고 배지, 스냅샷 저장 시 수치 동결.
   어드민 전용 진입 (AdminPage) — 미러·외부에는 없다 */
import React, { useEffect, useMemo, useState } from 'react'
import { listEvents } from './lib/store.js'
import { listTargetApp } from './lib/targetappStore.js'
import { listRmn } from './lib/rmnStore.js'
import { getReport, saveReport } from './lib/reportStore.js'
import { buildReportDeck, fmtMan } from './lib/reportDeck.js'
import { getAccessToken } from './lib/auth.js'
import { YTA } from './data/sns/ytAnalytics.js'
import { YT } from './data/sns/youtube.js'
import { IG } from './data/sns/instagram.js'
import { UGC } from './data/sns/ugc.js'
import { TREND } from './data/sns/trend.js'
import { trafficKo } from './data/sns/ytLabels.js'
import { toast } from './lib/toast.js'

/* **강조** 를 <b>로 — 모델 출력의 유일한 마크업 */
const Rich = ({ text }) => (
  <>{(text || '').split(/\*\*/).map((s, i) => (i % 2 ? <b key={i}>{s}</b> : <span key={i}>{s}</span>))}</>
)

function Hbars({ rows, unit = '' }) {
  const max = Math.max(...rows.map(r => r.v), 1)
  return (
    <div className="rpt-hbars">
      {rows.map((r, i) => (
        <div className="rpt-hb" key={i}>
          <span className="n">{r.name}</span>
          <div className="t"><div className={'f' + (r.v === max ? ' max' : '') + (r.tone === 'lilac' ? ' lilac' : '')} style={{ width: `${Math.max((r.v / max) * 100, 1.5)}%` }} /></div>
          <span className="v">{r.disp ?? r.v.toLocaleString()}{unit}</span>
        </div>
      ))}
    </div>
  )
}

function Insight({ no, text, warn, busy, onRedo }) {
  return (
    <div className="rpt-insight">
      <div className="no">{no}</div>
      <div className="body">
        {text
          ? <p><Rich text={text} /></p>
          : <p className="empty">{busy ? '서술 생성 중' : '서술 생성 전, 상단의 서술 생성 버튼을 누르세요'}</p>}
        {warn?.length > 0 && <div className="rpt-warn">수치 확인 필요 {warn.join(', ')}</div>}
      </div>
      {onRedo && text && <button className="rpt-redo" onClick={onRedo} disabled={busy}>다시 쓰기</button>}
    </div>
  )
}

export default function ReportDeck() {
  const now = new Date()
  const defYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [ymSel, setYmSel] = useState(defYm)
  const [deck, setDeck] = useState(null)
  const [narr, setNarr] = useState({ paragraphs: {}, finals: [], warnings: {} })
  const [frozen, setFrozen] = useState(false)
  const [busy, setBusy] = useState(null)   /* 'gen' | 슬라이드 key | null */
  const [idx, setIdx] = useState(0)
  const [err, setErr] = useState(null)

  useEffect(() => { load(ymSel) }, [ymSel])   // eslint-disable-line

  async function load(ym) {
    setErr(null); setDeck(null); setIdx(0); setFrozen(false)
    setNarr({ paragraphs: {}, finals: [], warnings: {} })
    try {
      const saved = await getReport(ym)
      if (saved?.data) {
        setDeck(saved.data)
        setNarr(saved.narration || { paragraphs: {}, finals: [], warnings: {} })
        setFrozen(true)
        return
      }
      const [year, month] = ym.split('-').map(Number)
      const [events, ta, rmn] = await Promise.all([
        listEvents().catch(() => []),
        listTargetApp().catch(() => null),
        listRmn().catch(() => null),
      ])
      setDeck(buildReportDeck({
        year, month, events: events || [],
        yta: YTA, trend: TREND, ig: IG, ugc: UGC, yt: YT,
        targetRows: ta?.rows || null, rmnRows: rmn || null,
      }))
    } catch (e) { setErr(e.message) }
  }

  const slides = useMemo(() => deck ? buildSlides(deck, narr, busy, redoOne) : [], [deck, narr, busy])   // eslint-disable-line

  async function callNarrate(body) {
    const token = await getAccessToken()
    const r = await fetch('/api/report-narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `서술 생성 실패 ${r.status}`)
    return j
  }

  async function genAll() {
    if (!deck) return
    setBusy('gen'); setErr(null)
    try {
      const keys = ['summary', 'exec', 'campaigns', 'youtube', 'traffic', 'instagram', 'ugc', 'target', 'rmn', 'next']
        .filter(k => k === 'summary' ? true : !!deck[k])
      const out = await callNarrate({ mode: 'all', digest: deck.digest, keys })
      setNarr({ paragraphs: out.paragraphs || {}, finals: out.finals || [], warnings: out.warnings || {} })
      toast('서술 생성 완료')
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  async function redoOne(key) {
    setBusy(key)
    try {
      const out = await callNarrate({ mode: 'one', key, digest: deck.digest, current: narr.paragraphs[key] })
      setNarr(n => ({
        ...n,
        paragraphs: { ...n.paragraphs, [key]: out.text },
        warnings: { ...n.warnings, [key]: out.warnings?.text || [] },
      }))
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  async function freeze() {
    try {
      await saveReport(`${deck.year}-${String(deck.month).padStart(2, '0')}`, deck, narr)
      setFrozen(true)
      toast('리포트가 저장됐습니다, 수치가 이 시점으로 고정됩니다')
    } catch (e) { setErr(e.message) }
  }

  const months = useMemo(() => {
    const out = []
    const d = new Date()
    for (let i = 0; i < 12; i++) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() - 1)
    }
    return out
  }, [])

  return (
    <div className="rpt-wrap">
      <div className="rpt-bar">
        <select value={ymSel} onChange={e => setYmSel(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
        </select>
        {frozen
          ? <span className="rpt-frozen">저장된 리포트, 수치 고정</span>
          : <>
              <button className="btn-solid" onClick={genAll} disabled={!deck || busy === 'gen'}>
                {busy === 'gen' ? '생성 중' : narr.finals.length ? '서술 전체 다시 생성' : '서술 생성'}
              </button>
              <button onClick={freeze} disabled={!deck || !narr.finals.length}>저장</button>
            </>}
        <button onClick={() => { document.body.classList.add('rpt-printing'); setTimeout(() => { window.print(); document.body.classList.remove('rpt-printing') }, 60) }} disabled={!deck}>인쇄</button>
      </div>
      {err && <div className="qa-err">{err}</div>}
      {deck && slides.length > 0 && (
        <>
          <div className="rpt-stage">
            {slides.map((s, i) => (
              <section className={'rpt-slide' + (i === idx ? ' on' : '')} key={s.key}>{s.node}</section>
            ))}
          </div>
          <div className="rpt-nav">
            <div className="rpt-dots">
              {slides.map((s, i) => (
                <button key={s.key} className={'rpt-dot' + (i === idx ? ' on' : '')} title={s.label} onClick={() => setIdx(i)} />
              ))}
            </div>
            <div className="rpt-nav-r">
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
              <span>{idx + 1} / {slides.length}</span>
              <button onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1}>›</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── 슬라이드 구성 — deck 의 null 섹션은 자동 생략 ── */
function buildSlides(d, narr, busy, redoOne) {
  const P = narr.paragraphs, W = narr.warnings
  const S = []
  let no = 0
  const ins = key => {
    no += 1
    return <Insight no={String(no).padStart(2, '0')} text={P[key]} warn={W[key]} busy={busy === key || busy === 'gen'} onRedo={() => redoOne(key)} />
  }

  S.push({ key: 'cover', label: '표지', node: (
    <div className="rpt-cover">
      <div className="lg">미디어콘텐츠룸</div>
      <h1>{d.year}년 {d.month}월<br />미디어 운영 리포트</h1>
      <div className="sub">집행과 채널 성과, 고객 반응을 한 달 단위로 묶은 정기 보고<br />수집 지표는 각 슬라이드에 기준 병기</div>
      <div className="ft">미디어콘텐츠팀</div>
    </div>
  ) })

  S.push({ key: 'summary', label: '요약', node: (
    <>
      <div className="rpt-head"><span className="t">이달의 요약</span><span className="b">{d.month}월 매체 집행 기준, 팀 일정 제외</span></div>
      <div className="rpt-hero sm"><div className="v">{d.summary.exec}<small>건 집행</small></div><div className="ub" /></div>
      <div className="rpt-kpis">
        <div><b>{d.summary.shoots}</b><span>촬영</span></div>
        {d.summary.ytViews != null && <div><b>{fmtMan(d.summary.ytViews)}</b><span>유튜브 조회</span></div>}
        {d.summary.ugcPosts != null && <div><b>{d.summary.ugcPosts}</b><span>고객 게시물</span></div>}
        <div><b>{d.summary.confirmed}</b><span>실적 확정</span></div>
      </div>
      {ins('summary')}
    </>
  ) })

  if (d.exec) S.push({ key: 'exec', label: '집행', node: (
    <>
      <div className="rpt-head"><span className="t">집행 현황</span><span className="b">시작일 기준 귀속, 촬영 제외</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.exec.topShare}<small>%</small></div><div className="ub" />
          <div className="l">{d.exec.topChannel?.[0]} 집중도</div>
          <div className="s">집행 {d.exec.total}건 중 {d.exec.topChannel?.[1]}건{d.exec.prevTotal != null ? `, 전월 ${d.exec.prevTotal}건` : ''}</div>
        </div>
        <Hbars rows={Object.entries(d.exec.byChannel).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, v, disp: `${v}건` }))} />
      </div>
      {ins('exec')}
    </>
  ) })

  if (d.campaigns) S.push({ key: 'campaigns', label: '캠페인', node: (
    <>
      <div className="rpt-head"><span className="t">캠페인</span><span className="b">캠페인 태그 기준</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.campaigns.tagged}<small>건</small></div><div className="ub" />
          <div className="l">태그된 집행</div>
          <div className="s">전체의 {d.campaigns.taggedShare}%, 미지정 {d.campaigns.noCampaign}건</div>
        </div>
        <div className="rpt-list">
          {d.campaigns.list.slice(0, 5).map(c => (
            <div className="li" key={c.name}><span><b>{c.name}</b> {c.channels.join(', ')}</span><span className="m">{c.count}건</span></div>
          ))}
          {d.campaigns.list.length === 0 && <div className="li"><span className="m">태그된 캠페인이 없습니다</span></div>}
        </div>
      </div>
      {ins('campaigns')}
    </>
  ) })

  if (d.youtube) S.push({ key: 'youtube', label: '유튜브', node: (
    <>
      <div className="rpt-head"><span className="t">유튜브</span><span className="b">스튜디오 API, {d.month}월 월 버킷</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{fmtMan(d.youtube.total)}</div><div className="ub" />
          <div className="l">{d.youtube.chans.length}채널 {d.month}월 조회</div>
          {d.youtube.prevTotal != null && <div className="s">전월 {fmtMan(d.youtube.prevTotal)}에서 {d.youtube.delta >= 0 ? '+' : ''}{d.youtube.delta}%</div>}
        </div>
        <table className="rpt-table">
          <thead><tr><th>채널</th><th className="r">조회</th><th className="r">전월 대비</th><th className="r">구독 순증</th></tr></thead>
          <tbody>
            {d.youtube.chans.map((c, i) => (
              <tr key={c.key}>
                <td>{c.name}</td><td className="r">{fmtMan(c.views)}</td>
                <td className={'r' + (i === 0 && c.delta > 0 ? ' up' : '')}>{c.delta != null ? `${c.delta >= 0 ? '+' : ''}${c.delta}%` : ''}</td>
                <td className={'r' + (c.subsNet < 0 ? ' dn' : '')}>{c.subsNet >= 0 ? '+' : ''}{c.subsNet.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ins('youtube')}
    </>
  ) })

  if (d.traffic) S.push({ key: 'traffic', label: '유입', node: (
    <>
      <div className="rpt-head"><span className="t">유튜브 유입 구조</span><span className="b">대표 채널, {d.traffic.range?.start}부터 {d.traffic.range?.end}</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.traffic.topShare}<small>%</small></div><div className="ub" />
          <div className="l">{trafficKo(d.traffic.topSource)} 유입 비중</div>
          <div className="s">조회 {fmtMan(d.traffic.total)} 기준</div>
        </div>
        <Hbars rows={d.traffic.rows.map(t => ({ name: trafficKo(t.source), v: t.views, disp: fmtMan(t.views) }))} />
      </div>
      {ins('traffic')}
    </>
  ) })

  if (d.instagram) S.push({ key: 'instagram', label: '인스타', node: (
    <>
      <div className="rpt-head"><span className="t">인스타그램</span><span className="b">스냅샷 {d.instagram.from}부터 {d.instagram.to}</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.instagram.total >= 0 ? '+' : ''}{d.instagram.total.toLocaleString()}<small>명</small></div><div className="ub" />
          <div className="l">전 계정 팔로워 순증</div>
        </div>
        <Hbars rows={d.instagram.groups.map(g => ({ name: g.name, v: Math.max(g.v, 0), disp: `${g.v >= 0 ? '+' : ''}${g.v.toLocaleString()}` }))} />
      </div>
      {ins('instagram')}
    </>
  ) })

  if (d.ugc) S.push({ key: 'ugc', label: '고객 게시물', node: (
    <>
      <div className="rpt-head"><span className="t">고객 게시물</span><span className="b">해시태그 수집, {d.ugc.windowSince}부터</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.ugc.posts}<small>건</small></div><div className="ub" />
          <div className="l">고객 발행 게시물</div>
          <div className="s">총 반응 {d.ugc.engagement.toLocaleString()}, 인플루언서 {d.ugc.influencer}건, 협찬 표기 {d.ugc.ad}건</div>
        </div>
        <div className="rpt-list">
          {d.ugc.top && <div className="li"><span><b>최다 반응</b> {d.ugc.top.caption}</span><span className="m">좋아요 {d.ugc.top.likes.toLocaleString()}</span></div>}
          {d.ugc.sentiment && Object.entries(d.ugc.sentiment).map(([k, v]) => (
            <div className="li" key={k}><span>{k}</span><span className="m">{v}건</span></div>
          ))}
        </div>
      </div>
      {ins('ugc')}
    </>
  ) })

  if (d.target) S.push({ key: 'target', label: '타겟APP', node: (
    <>
      <div className="rpt-head"><span className="t">타겟APP</span><span className="b">{d.month}월 실적 대장 {d.target.rows}행</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{fmtMan(d.target.exp)}</div><div className="ub" />
          <div className="l">월 노출 합계</div>
          <div className="s">클릭 {fmtMan(d.target.clk)}{d.target.ctr != null ? `, 클릭률 ${d.target.ctr}%` : ''}</div>
        </div>
        <Hbars rows={d.target.medias.slice(0, 5).map(m => ({ name: m.name, v: m.v, disp: fmtMan(m.v) }))} />
      </div>
      {ins('target')}
    </>
  ) })

  if (d.rmn) S.push({ key: 'rmn', label: 'RMN', node: (
    <>
      <div className="rpt-head"><span className="t">RMN 판매</span><span className="b">부킹 대장, 시작일 기준</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.rmn.amountK.toLocaleString()}<small>천원</small></div><div className="ub" />
          <div className="l">{d.month}월 광고비 합계</div>
          <div className="s">부킹 {d.rmn.count}건, 광고주 {d.rmn.advertisers}곳</div>
        </div>
        <div className="rpt-list">
          <div className="li"><span><b>부킹</b></span><span className="m">{d.rmn.count}건</span></div>
          <div className="li"><span><b>광고주</b></span><span className="m">{d.rmn.advertisers}곳</span></div>
          <div className="li"><span><b>세금계산서 대기</b></span><span className="m">{d.rmn.taxPending}건</span></div>
        </div>
      </div>
      {ins('rmn')}
    </>
  ) })

  if (d.next) S.push({ key: 'next', label: '다음 달', node: (
    <>
      <div className="rpt-head"><span className="t">{d.next.month}월 예정</span><span className="b">등록된 일정 기준</span></div>
      <div className="rpt-cols">
        <div className="rpt-hero">
          <div className="v">{d.next.total}<small>건</small></div><div className="ub" />
          <div className="l">매체 집행 예정</div>
          <div className="s">{Object.entries(d.next.byChannel).map(([k, v]) => `${k} ${v}`).join(', ')}</div>
        </div>
        <div className="rpt-list">
          {d.next.campaigns.slice(0, 5).map(c => (
            <div className="li" key={c.name}><span><b>{c.name}</b></span><span className="m">{c.count}건</span></div>
          ))}
          {d.next.campaigns.length === 0 && <div className="li"><span className="m">태그된 예정 캠페인이 없습니다</span></div>}
        </div>
      </div>
      {ins('next')}
    </>
  ) })

  S.push({ key: 'finals', label: '인사이트', node: (
    <>
      <div className="rpt-head"><span className="t">이달의 인사이트</span><span className="b">수치 근거는 각 슬라이드 참조</span></div>
      <div className="rpt-fin">
        {narr.finals.length === 0 && <p className="empty">{busy === 'gen' ? '서술 생성 중' : '서술 생성을 누르면 이달의 인사이트 3개가 채워집니다'}</p>}
        {narr.finals.map((f, i) => (
          <div className="row" key={i}>
            <div className="no">{String(i + 1).padStart(2, '0')}</div>
            <div>
              <h3>{f.title}</h3>
              <p><Rich text={f.body} /></p>
              {W[`final${i}`]?.length > 0 && <div className="rpt-warn">수치 확인 필요 {W[`final${i}`].join(', ')}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  ) })

  return S
}
