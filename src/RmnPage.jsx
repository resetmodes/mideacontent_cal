import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RMN_PRODUCTS, RMN_AGENCIES, RMN_STATUS, rmnProduct, rmnColor, statusIdx, nextStatus,
  slotAvailability, pushAvailability, canTentative, buildRmnNotices,
  applyDiscount, netAmount, fmtWon,
  groupCampaigns, campaignOn, periodDays, priceWeeks, PRICE_DAYS, bookingQty,
  INSTA_PRODUCTS, INSTA_FORMATS, instaPrice, kakaoPrice, MANUAL_PERF,
} from './data/rmn.js'
import { listRmn, createRmn, updateRmn, deleteRmn, listGaDaily } from './lib/rmnStore.js'
import { buildOrderXlsx, buildProposalXlsx, buildLedgerXlsx, DOC_NAME, DOC_ORDER } from './lib/rmnDocs.js'
import { toISO, fromISO } from './lib/parse.js'
import { HOLIDAYS } from './data/holidays.js'
import ImageAttach from './ImageAttach.jsx'
import { Kpi, Donut, HBars, DuoBars, Gauge, Pipeline } from './Charts.jsx'
import { toast } from './lib/toast.js'
import { createShare, listShares, deleteShare, genPw, shareUrl } from './lib/shareStore.js'

/* RMN — 현대백화점 APP 광고 판매(부킹·재고·상태·정산) 관리 탭 ('26.7 1차, GA 연동 전).
   팀 전체 노출(내부 로그인) — 미러·외부 뷰에는 탭 자체가 없음.
   상태: 가부킹→부킹→집행→결과 리포트→세금계산서→입금 확인→완료 (+취소, 취소만 재고 해제) */

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const todayISO = () => toISO(new Date())
const fmtD = iso => {
  if (!iso) return ''
  const d = fromISO(iso.slice(0, 10))
  return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`
}
const fmtRange = b => (b.end_date && b.end_date !== b.start_date ? `${fmtD(b.start_date)} ~ ${fmtD(b.end_date)}` : fmtD(b.start_date))
const addDaysISO = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d) }
/* 상품 이니셜 칩 — 상품별 저채도 구분색 ('26.7, rmn.js color) */
const initialOf = id => id === '헤드라인 뉴스' ? '헤' : id === '이벤트 메뉴' ? '이' : id[0]
const Ini = ({ id }) => <span className="rmn-ini" style={{ background: rmnColor(id) }}>{initialOf(id)}</span>

/* 공유 필드(광고주·캠페인·판매사·상태·메모). 기간·수량·할인·가격은 상품별 lines로 분리 ('26.7) */
const EMPTY = {
  advertiser: '', campaign: '', product: '메인배너',
  agency: '', agency_custom: '', agency_manager: '', agency_phone: '', agency_email: '',
  status: '부킹', memo: '',
}
/* 상품 라인 기본값 — 구좌: 시작~+6(7일 1주) + 분할 세그먼트 / 푸쉬: 발송일·시간·발송량.
   discount·price는 양방향 동기 ('26.7): 할인율 입력 → 실판가 자동 / 실판가 입력 → 할인율 자동
   own=false면 캠페인 기간을 따라감(일괄), 라인 날짜를 직접 고치면 own=true(상품별 개별 기간) */
const defaultLine = () => ({
  start: todayISO(), end: addDaysISO(todayISO(), PRICE_DAYS - 1), segs: [], own: false,
  qty: 1, discount: '', price: '',
  send_date: '', send_time: '10:00', push_units: 1, msg_count: '',   // msg_count: 카카오 발송 건수(직접 입력)
  target: false,                                        // 카카오톡: 타겟팅 (10% 할증)
  insta_prod: INSTA_PRODUCTS[0], insta_fmt: INSTA_FORMATS[0],   // 인스타: 구성·형식
})
const isSlot = id => { const p = rmnProduct(id); return p && !p.push && !p.insta }
const num = v => Number(String(v).replace(/,/g, '')) || 0
/* 상품별 구분 점 (캘린더 캠페인 칩) */
const Dot = ({ id }) => <span className="rmn-dot" style={{ background: rmnColor(id) }} title={id} />
const productsOn = (g, iso) => [...new Set(g.items.filter(b => b.start_date <= iso && (b.end_date || b.start_date) >= iso).map(b => b.product))]

/* ── 탭 접속 알림 팝업 — 가부킹 전환 + 세금계산서 (하루 1회) ── */
function RmnNotice({ notices, onConvert, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="md-ch">RMN 확인 필요</div>
        {notices.tentative.length > 0 && (
          <>
            <div className="rmn-nt">부킹 전환 필요 <small>집행 시작 3개월 이내 진입</small></div>
            {notices.tentative.map(b => (
              <div key={b.id} className="rmn-nrow">
                <Ini id={b.product} />
                <span className="rmn-nttl">{b.advertiser} {b.product} <small className="mute">{fmtRange(b)}</small></span>
                <button className="btn-solid sm" onClick={() => onConvert(b)}>부킹 전환</button>
              </div>
            ))}
          </>
        )}
        {notices.tax.length > 0 && (
          <>
            <div className="rmn-nt">세금계산서 미교부 <small>이번 달 종료 캠페인 중 교부 단계 미도달</small></div>
            {notices.tax.map(b => (
              <div key={b.id} className="rmn-nrow">
                <Ini id={b.product} />
                <span className="rmn-nttl">{b.advertiser} {b.product} <small className="mute">{fmtRange(b)} 현재 {b.status}</small></span>
              </div>
            ))}
          </>
        )}
        <div className="md-actions">
          <div className="md-spacer" />
          <button className="btn-ghost" onClick={onClose}>오늘 그만 보기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 캠페인 제안서 만들기 ('26.7 3차) — 상품·기간·할인율 입력 → xlsx 다운로드.
   예상 노출·클릭은 rmnAgencies.js RMN_BENCH(까르띠에 제안서 수치) 기준, 기준값 없는 상품은 "-" ── */
function ProposalMaker() {
  const [open, setOpen] = useState(false)
  const [p, setP] = useState({
    advertiser: '', start: '', end: '', discount: 15,
    products: ['스플래시', '메인배너', '하단배너', '푸쉬'], pushUnits: 4,
  })
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }))
  const toggle = id => setP(prev => ({
    ...prev,
    products: prev.products.includes(id) ? prev.products.filter(x => x !== id) : [...prev.products, id],
  }))
  const valid = p.advertiser.trim() && p.start && p.end && p.end >= p.start && p.products.length >= 1 && p.products.length <= 4
  const make = async () => {
    try {
      setMsg(null)
      await buildProposalXlsx({ ...p, advertiser: p.advertiser.trim() })
      setMsg('제안서가 다운로드됐습니다')
    } catch (e) { setMsg(e.message) }
  }
  return (
    <details className="ta-office rmn-propmaker" open={open} onToggle={e => setOpen(e.target.open)}>
      <summary>
        <span className="pm-ico" aria-hidden>＋</span>
        <span className="ta-name">캠페인 제안서 만들기</span>
        <span className="pm-tag">xlsx 자동 생성</span>
        <span className="pm-chev" aria-hidden>{open ? '접기' : '열기'}</span>
      </summary>
      <div className="pm-body">
      <div className="adm-taform">
        <label>광고주명 *<input value={p.advertiser} onChange={e => set('advertiser', e.target.value)} placeholder="예: 까르띠에" /></label>
        <label>시작일 *<input type="date" value={p.start} onChange={e => set('start', e.target.value)} /></label>
        <label>종료일 *<input type="date" value={p.end} onChange={e => set('end', e.target.value)} /></label>
        <label>할인율 %<input type="number" value={p.discount} onChange={e => set('discount', e.target.value)} /></label>
        {p.products.includes('푸쉬') && (
          <label>푸시 발송량
            <select value={p.pushUnits} onChange={e => set('pushUnits', Number(e.target.value))}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(u =>
                <option key={u} value={u}>{(u * 5).toLocaleString('ko-KR')}만 건</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="sub-pick rmn-prodpick">
        {RMN_PRODUCTS.map(pr => (
          <button key={pr.id} type="button" className={p.products.includes(pr.id) ? 'on' : ''}
            onClick={() => toggle(pr.id)}>{DOC_NAME[pr.id] || pr.id}</button>
        ))}
      </div>
      <div className="adm-actions">
        <small className="mute">상품 1~4개, 기준값이 없는 팝업과 헤드라인, 이벤트 메뉴는 빈칸</small>
        <button className="btn-solid sm" disabled={!valid} onClick={make}>제안서 다운로드</button>
      </div>
      {msg && <div className="adm-msg">{msg}</div>}
      </div>
    </details>
  )
}

/* ── 정산 요약 ('26.7 2차 → 3차: 연도 필터·연도별 소계·엑셀 다운로드) —
   시작월 기준 집계. 미수금 = 취소 제외, "입금 확인" 전 상태의 입금가 ── */
function SettleSummary({ bookings, onMsg }) {
  const rows = useMemo(() => {
    const map = {}
    for (const b of bookings) {
      if (b.status === '취소') continue
      const ym = (b.start_date || '').slice(0, 7)
      if (!ym) continue
      const m = (map[ym] = map[ym] || { ym, cnt: 0, total: 0, net: 0, unpaid: 0 })
      m.cnt++
      m.total += b.actual_price || 0
      m.net += b.net_amount || 0
      if (statusIdx(b.status) > -1 && statusIdx(b.status) < statusIdx('입금 확인')) m.unpaid += b.net_amount || 0
    }
    return Object.values(map).sort((a, b) => a.ym.localeCompare(b.ym))
  }, [bookings])

  const years = useMemo(() => [...new Set(rows.map(r => r.ym.slice(0, 4)))].sort(), [rows])
  const [yf, setYf] = useState('전체')
  if (rows.length === 0) return null
  const shown = yf === '전체' ? rows : rows.filter(r => r.ym.slice(0, 4) === yf)
  const showSub = yf === '전체' && years.length > 1

  /* 연도별 소계를 끼운 표시 행 */
  const display = []
  let cur = null, yt = null
  const blank = () => ({ cnt: 0, total: 0, net: 0, unpaid: 0 })
  for (const r of shown) {
    const y = r.ym.slice(0, 4)
    if (cur && y !== cur) { if (showSub) display.push({ sub: cur, ...yt }); yt = null }
    if (y !== cur) { cur = y; yt = blank() }
    for (const k of ['cnt', 'total', 'net', 'unpaid']) yt[k] += r[k]
    display.push({ row: r })
  }
  if (cur && showSub) display.push({ sub: cur, ...yt })
  const sum = k => shown.reduce((a, r) => a + r[k], 0)

  /* 전체 실적 대장 다운로드 — 원본 판매실적 대장 양식·수식 그대로 (연도별 시트, 소계·합계·YoY 수식 포함) */
  const downloadLedger = async () => {
    try {
      await buildLedgerXlsx(bookings, todayISO())
      onMsg && onMsg('판매 실적 대장이 다운로드됐습니다 (수식 포함)')
    } catch (e) { onMsg && onMsg(e.message) }
  }

  return (
    <>
      <div className="group-label">정산 요약 <small className="adm-count">시작월 기준, 미수금은 입금 확인 전</small></div>
      <div className="rmn-settle-bar">
        <div className="rmn-yf">
          {['전체', ...years].map(y => (
            <button key={y} className={yf === y ? 'on' : ''} onClick={() => setYf(y)}>{y === '전체' ? `전체 (${years.length}개년)` : `${y}년`}</button>
          ))}
        </div>
        <button className="btn-ghost sm" onClick={downloadLedger}>실적 대장 다운로드</button>
      </div>
      <div className="mon-scroll">
        <table className="mon-table adm-table">
          <thead><tr><th>월</th><th>건수</th><th>총광고비</th><th>입금가</th><th>미수금</th></tr></thead>
          <tbody>
            {display.map((d, i) => d.sub ? (
              <tr key={'sub' + d.sub} className="rmn-yearsub">
                <td className="mon-acc">{d.sub}년 소계</td>
                <td className="mute">{d.cnt}건</td>
                <td>{fmtWon(d.total)}</td>
                <td>{fmtWon(d.net)}</td>
                <td className={d.unpaid > 0 ? 'strong' : 'mute'}>{d.unpaid > 0 ? fmtWon(d.unpaid) : ''}</td>
              </tr>
            ) : (
              <tr key={d.row.ym}>
                <td className="mon-acc">{d.row.ym.replace('-', '.')}</td>
                <td className="mute">{d.row.cnt}건</td>
                <td>{fmtWon(d.row.total)}</td>
                <td>{fmtWon(d.row.net)}</td>
                <td className={d.row.unpaid > 0 ? 'strong' : 'mute'}>{d.row.unpaid > 0 ? fmtWon(d.row.unpaid) : ''}</td>
              </tr>
            ))}
            <tr className="rmn-sum">
              <td className="mon-acc">{yf === '전체' ? '합계' : `${yf}년 합계`}</td>
              <td className="mute">{sum('cnt')}건</td>
              <td className="strong">{fmtWon(sum('total'))}</td>
              <td className="strong">{fmtWon(sum('net'))}</td>
              <td className={sum('unpaid') > 0 ? 'strong' : 'mute'}>{sum('unpaid') > 0 ? fmtWon(sum('unpaid')) : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── 진행 중 캠페인 행 ('26.7) — [광고주+캠페인명] 헤더, 펼치면 세부 상품 ── */
function CampaignRow({ g, open, onToggle, editId, confirmDel, onAdvance, onSetStatus, onOrder, onShare, onItemStatus, onEdit, onDel, onItemAdvance, onItemImages, showYear = false }) {
  const hasGa = g.items.some(b => b.impressions > 0)
  /* 광고주 공유는 GA 실적이 없어도 집행 시작한 캠페인이면 가능 ('26.7.29) —
     카카오톡·인스타 등 매체사 미제공 매체만으로 구성된 캠페인도 집행 내역을 공유 */
  const canShare = hasGa || g.items.some(b => statusIdx(b.status) >= statusIdx('집행'))
  const prods = g.items.map(b => b.product + (bookingQty(b) > 1 ? `×${bookingQty(b)}` : ''))
  /* 상품별 이미지 패널 ('26.7) — 한 번에 하나만 열림 (붙여넣기 대상 명확화) */
  const [imgFor, setImgFor] = useState(null)
  return (
    <div className={'rmn-camp-row' + (open ? ' open' : '')}>
      <div className="rmn-camp-head" onClick={onToggle}>
        <span className="rmn-camp-dots">{[...new Set(g.items.map(b => b.product))].slice(0, 4).map(p => <Dot key={p} id={p} />)}</span>
        <span className="rmn-camp-name">
          {showYear && <span className="rmn-year">{g.start.slice(0, 4)}</span>}
          <b>{g.advertiser}</b>{g.campaign ? <span className="mute"> {g.campaign}</span> : ''}
          {g.status === '가부킹' && <span className="rmn-gtag">가부킹</span>}
        </span>
        <span className="rmn-camp-meta">{fmtD(g.start)} ~ {fmtD(g.end)}, {g.items.length}개 상품, {fmtWon(g.total)}</span>
        <span className="rmn-camp-chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </div>
      <div className="rmn-camp-sub mute">{prods.join(', ')}</div>
      <div className="rmn-camp-ctl">
        <select className="rmn-status" value={g.mixed ? '' : g.status} onChange={e => e.target.value && onSetStatus(e.target.value)}
          title={g.mixed ? '상품별 상태가 다름, 선택하면 전체 통일' : '캠페인 전체 상태'}>
          {g.mixed && <option value="">상태 혼합</option>}
          {RMN_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="취소">취소</option>
        </select>
        {g.status !== '완료' && (
          <button className="btn-ghost sm" onClick={onAdvance}>다음 단계 <small className="mute">{nextStatus(g.status)}</small></button>
        )}
        <button className="btn-ghost sm" onClick={onOrder}>청약서</button>
        {canShare && <button className="btn-ghost sm" onClick={onShare}>광고주 공유</button>}
      </div>
      {open && (
        <div className="rmn-camp-items">
          {g.items.map(b => {
            const split = !b.actual_price && g.items.some(x => x.product === b.product && x.actual_price > 0)
            const nImg = (b.images || []).length
            return (
            <React.Fragment key={b.id}>
            <div className={'rmn-item' + (editId === b.id ? ' sel' : '')}>
              <span className="rmn-item-p"><Ini id={b.product} /> {b.product}{bookingQty(b) > 1 ? ` ×${bookingQty(b)}` : ''}{b.push_qty ? ` ${(b.push_qty / 10000).toLocaleString('ko-KR')}만` : ''}{b.option ? <small className="mute"> {String(b.option).replace(/\s*·\s*/g, ' ')}</small> : ''}</span>
              <span className="mute rmn-item-d">{b.send_at ? `${fmtD(b.send_at)} ${b.send_at.slice(11, 16)}` : fmtRange(b)}</span>
              {/* GA4 자동 수집 실적 ('26.7) — impressions 채워진 부킹만 표시 */}
              {b.impressions != null && b.impressions > 0 && (
                <span className="rmn-item-ga">
                  노출 {Number(b.impressions).toLocaleString('ko-KR')}, 클릭 {Number(b.clicks || 0).toLocaleString('ko-KR')}
                  {b.clicks > 0 && <>, CTR {((b.clicks / b.impressions) * 100).toFixed(2)}%</>}
                </span>
              )}
              <span className="rmn-item-w">{split ? <span className="mute">분할 집행</span> : fmtWon(b.actual_price)}</span>
              <select className="rmn-status" value={b.status} onChange={e => onItemStatus(b, e.target.value)}>
                {RMN_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="취소">취소</option>
              </select>
              <button className={'btn-ghost sm' + (imgFor === b.id ? ' rmn-img-on' : '')} onClick={() => setImgFor(imgFor === b.id ? null : b.id)}>
                이미지{nImg ? ` ${nImg}` : ''}
              </button>
              <button className="btn-ghost sm" onClick={() => onEdit(b)}>수정</button>
              <button className={'btn-ghost sm danger' + (confirmDel === b.id ? ' arm' : '')} onClick={() => onDel(b.id)}>
                {confirmDel === b.id ? '한 번 더' : '삭제'}
              </button>
            </div>
            {imgFor === b.id && (
              <div className="rmn-item-imgs">
                <ImageAttach imgs={b.images || []} canEdit storeKey={`rmn/${b.id}`}
                  onChange={next => onItemImages(b, next)} hint="집행 화면과 결과 캡처" />
              </div>
            )}
            </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── 캘린더 캠페인 클릭 → 상품 선택 시트 ── */
function CampaignPicker({ g, onEdit, onOrder, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="md-ch">{g.advertiser}{g.campaign && <span className="md-ch-sub">{g.campaign}</span>}</div>
        <div className="mute" style={{ marginBottom: 10 }}>{fmtD(g.start)} ~ {fmtD(g.end)}, {g.items.length}개 상품, {fmtWon(g.total)}</div>
        {g.items.map(b => (
          <button key={b.id} className="rmn-pick-item" onClick={() => onEdit(b)}>
            <Ini id={b.product} />
            <span className="rmn-pick-t">{b.product}{bookingQty(b) > 1 ? ` ×${bookingQty(b)}` : ''}</span>
            <span className="mute">{b.send_at ? `${fmtD(b.send_at)} ${b.send_at.slice(11, 16)}` : fmtRange(b)} {b.status}</span>
          </button>
        ))}
        <div className="md-actions">
          <button className="btn-ghost" onClick={onOrder}>청약서</button>
          <div className="md-spacer" />
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 월간 캘린더 (간이) — 캠페인 단위 칩(상품 색점 + 광고주), 클릭 시 상품 시트 ── */
function RmnMonth({ campaigns, onPick }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const start = new Date(first); start.setDate(first.getDate() - first.getDay())
    const out = []; const d = new Date(start)
    while (d <= last || d.getDay() !== 0) {
      out.push({ iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === cursor.getMonth(), dow: d.getDay() })
      d.setDate(d.getDate() + 1)
      if (out.length > 42) break
    }
    return out
  }, [cursor])
  const today = todayISO()
  const label = `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`

  return (
    <div>
      <div className="cal-controls">
        <div className="cal-nav">
          <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>◀</button>
          <span className="cal-month">{label}</span>
          <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>▶</button>
        </div>
      </div>
      <div className="cal-grid">
        {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map(c => {
          const list = campaigns.filter(g => campaignOn(g, c.iso))
          const hol = HOLIDAYS[c.iso]
          return (
            <div key={c.iso} className={'cal-cell' + (c.inMonth ? '' : ' dim') + (c.iso === today ? ' today' : '')}>
              <div className="cal-dayrow">
                <span className={'cal-daynum rmn-dn' + (c.dow === 0 || c.dow === 6 || hol ? ' wknd' : '')}>{c.day}</span>
                {hol && <span className="cal-hol">{hol}</span>}
              </div>
              {list.slice(0, 4).map(g => (
                <button key={g.key + c.iso} className={'cal-ev' + (g.status === '가부킹' ? ' rmn-tent' : '')}
                  onClick={() => onPick(g)}
                  title={`${g.advertiser}${g.campaign ? ' ' + g.campaign : ''} ${productsOn(g, c.iso).join(', ')} [${g.status}]`}>
                  <span className="rmn-camp-dots">{productsOn(g, c.iso).slice(0, 3).map(p => <Dot key={p} id={p} />)}</span>
                  <span className="ev-title">{g.advertiser}{g.status === '가부킹' ? ' (가)' : ''}</span>
                </button>
              ))}
              {list.length > 4 && <div className="cal-more">+{list.length - 4}</div>}
            </div>
          )
        })}
      </div>
      <div className="rmn-legend">
        {RMN_PRODUCTS.map(p => <span key={p.id}><Dot id={p.id} /> {p.id}</span>)}
        <span className="mute">(가)는 가부킹</span>
      </div>
    </div>
  )
}

export default function RmnPage() {
  const [rows, setRows] = useState(undefined)   // undefined=로딩 · null=미설정
  const [f, setF] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [origQty, setOrigQty] = useState(1)
  const [confirmDel, setConfirmDel] = useState(null)
  const [msg, setMsg] = useState(null)
  const [notices, setNotices] = useState(null)
  const [pickGroup, setPickGroup] = useState(null)   // 캘린더 캠페인 클릭 → 상품 선택 시트
  const [expanded, setExpanded] = useState(null)      // 진행중 목록에서 펼친 캠페인 key
  const [doneQuery, setDoneQuery] = useState('')      // 완료·취소 검색
  /* 세그먼트 (v2 3차 '26.7.29) — 등록·현황·분석 분리, 기본 진입 = 진행 현황 (사용자 확정) */
  const [mode, setMode] = useState('현황')
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const refresh = useCallback(() => listRmn().then(setRows), [])
  useEffect(() => { refresh() }, [refresh])

  /* 알림 팝업 — 하루 1회 (생일 팝업 방식) */
  useEffect(() => {
    if (!Array.isArray(rows)) return
    const key = 'rmn-notice-' + todayISO()
    if (localStorage.getItem(key)) return
    const n = buildRmnNotices(rows, todayISO())
    if (n.tentative.length || n.tax.length) setNotices(n)
  }, [rows])
  const closeNotice = () => { localStorage.setItem('rmn-notice-' + todayISO(), '1'); setNotices(null) }

  const bookings = Array.isArray(rows) ? rows : []

  /* 상품별 독립 라인 ('26.7 재설계) — 각 상품이 기간·수량·할인·가격을 따로 가짐.
     신규 = 여러 상품 토글, 수정 = 단일(1건=1상품). lines[상품id] = {start,end,qty,discount,manual,price,...} */
  const [sel, setSel] = useState(['메인배너'])
  const [lines, setLines] = useState({ 메인배너: defaultLine() })
  /* 캠페인 기간 ('26.7) — 일괄 선택. own=false인 구좌 라인이 이 기간을 따라감 */
  const [camp, setCamp] = useState({ start: todayISO(), end: addDaysISO(todayISO(), PRICE_DAYS - 1) })
  const products = editId ? [f.product] : sel
  const lineOf = id => lines[id] || defaultLine()
  const hasSlotProduct = products.some(isSlot)
  const toggleSel = id => {
    if (editId) return
    setSel(prev => prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id])
    /* 신규 선택 구좌 라인은 캠페인 기간을 물려받음 (own=false) */
    setLines(prev => (prev[id] ? prev : { ...prev, [id]: { ...defaultLine(), start: camp.start, end: camp.end, own: false } }))
  }
  /* 캠페인 기간 변경 → 개별 설정(own) 아닌 구좌 라인에 일괄 적용 */
  const setCampPeriod = (k, v) => {
    const next = { ...camp, [k]: v }
    if (k === 'start' && (!next.end || next.end < v)) next.end = addDaysISO(v, PRICE_DAYS - 1)
    setCamp(next)
    setLines(prev => {
      const out = { ...prev }
      for (const id of Object.keys(out)) {
        if (!isSlot(id) || out[id].own) continue
        out[id] = syncFromDiscount(id, { ...out[id], start: next.start, end: next.end })
      }
      return out
    })
  }
  const resetLinePeriod = id => setLines(prev => ({
    ...prev, [id]: syncFromDiscount(id, { ...(prev[id] || defaultLine()), start: camp.start, end: camp.end, own: false }),
  }))
  /* 라인 공시가 — 구좌: 단가 × 주(7일 올림 배수) × 수량 / 푸쉬: 발송량 × 50원 /
     카카오톡: 발송량 × 100원 (타겟팅 +10%) / 인스타: 구성 × 형식 단가표 */
  const listOf = (id, L) => {
    const pr = rmnProduct(id)
    if (pr.insta) return instaPrice(L.insta_prod, L.insta_fmt)
    if (pr.msg) return kakaoPrice(Number(L.msg_count) || 0, L.target)   // 카카오: 발송 건수 직접 입력
    if (pr.push) return (Number(L.push_units) || 1) * pr.unitSize * pr.pricePer
    const days = periodDays(L.start, L.end || L.start) +
      L.segs.reduce((a, s) => a + (s.start ? periodDays(s.start, s.end || s.start) : 0), 0)
    return pr.price * priceWeeks(days) * Math.max(1, Number(L.qty) || 1)
  }
  /* 할인율 ↔ 실판가 양방향 동기: 어느 쪽을 고쳐도 반대쪽이 따라옴 */
  const syncFromDiscount = (id, L) => ({ ...L, price: String(applyDiscount(listOf(id, L), L.discount)) })
  const setLine = (id, k, v) => setLines(prev => {
    const L = { ...(prev[id] || defaultLine()), [k]: v }
    return { ...prev, [id]: syncFromDiscount(id, L) }   // 기간·수량·발송량·할인 변경 → 실판가 재계산
  })
  /* 라인 날짜 직접 변경 = 상품별 개별 기간(own=true) — 캠페인 기간 추종 해제 */
  const setLineStart = (id, v) => setLines(prev => {
    const L0 = prev[id] || defaultLine()
    const end = (!L0.end || L0.end < v) ? addDaysISO(v, PRICE_DAYS - 1) : L0.end
    return { ...prev, [id]: syncFromDiscount(id, { ...L0, start: v, end, own: true }) }
  })
  const setLineEnd = (id, v) => setLines(prev => ({
    ...prev, [id]: syncFromDiscount(id, { ...(prev[id] || defaultLine()), end: v, own: true }),
  }))
  const setLinePrice = (id, v) => setLines(prev => {
    const L = { ...(prev[id] || defaultLine()), price: v }
    const list = listOf(id, L)
    const d = list > 0 ? Math.round((1 - num(v) / list) * 1000) / 10 : 0   // 실판가 → 할인율 역산 (0.1% 단위)
    return { ...prev, [id]: { ...L, discount: String(d) } }
  })
  /* 분할 세그먼트 (상품별): 잔여일을 다른 일자에 잘라 선택 */
  const lineSeg = (id, fn) => setLines(prev => {
    const L = prev[id] || defaultLine()
    return { ...prev, [id]: syncFromDiscount(id, { ...L, segs: fn(L.segs) }) }
  })
  const addSeg = id => {
    const L = lineOf(id); const c = lineCalc(id)
    const last = [L.end || L.start, ...L.segs.map(s => s.end || s.start)].filter(Boolean).sort().at(-1) || L.start
    const remain = Math.max(1, c.weeks * PRICE_DAYS - c.days)
    lineSeg(id, segs => [...segs, { start: addDaysISO(last, 1), end: addDaysISO(last, remain) }])
  }
  const setSeg = (id, i, k, v) => lineSeg(id, segs => segs.map((s, j) => j === i ? { ...s, [k]: v } : s))
  const rmSeg = (id, i) => lineSeg(id, segs => segs.filter((_, j) => j !== i))

  const lineCalc = id => {
    const pr = rmnProduct(id); const L = lineOf(id)
    if (pr.push || pr.insta) {
      const list = listOf(id, L)
      return { id, push: !!pr.push, insta: !!pr.insta, list, actual: L.price !== '' ? num(L.price) : list, weeks: 1, qty: 1, days: 1, discount: Number(L.discount) || 0 }
    }
    const days = periodDays(L.start, L.end || L.start) +
      L.segs.reduce((a, s) => a + (s.start ? periodDays(s.start, s.end || s.start) : 0), 0)
    const weeks = priceWeeks(days)
    const q = Math.max(1, Number(L.qty) || 1)
    const list = pr.price * weeks * q
    return { id, push: false, list, actual: L.price !== '' ? num(L.price) : list, weeks, days, qty: q, discount: Number(L.discount) || 0 }
  }
  const calcOf = id => lineCalc(id)
  /* 재고 — 본 기간 + 세그먼트 전 구간에서 잔여 확인 (가장 빡빡한 구간 기준).
     푸쉬만 발송 한도 표시 (카카오톡 한도 미확정·인스타 게시형 = 재고 개념 없음) */
  const availOf = id => {
    const pr = rmnProduct(id); const L = lineOf(id)
    if (pr.insta || pr.msg) return null
    if (pr.push) return L.send_date ? pushAvailability(bookings, L.send_date, editId) : null
    const ranges = [{ s: L.start, e: L.end || L.start }, ...L.segs.filter(s => s.start).map(s => ({ s: s.start, e: s.end || s.start }))]
    return ranges.map(r => slotAvailability(bookings, id, r.s, r.e, editId))
      .filter(Boolean).reduce((m, a) => (!m || a.left < m.left ? a : m), null)
  }

  /* 합산 + 총 할인율 ('26.7 확정 — 상품별 나열이 아닌 공시가 합 대비 실판가 합의 실효 할인율) */
  const totalList = products.reduce((a, id) => a + calcOf(id).list, 0)
  const totalActual = products.reduce((a, id) => a + calcOf(id).actual, 0)
  const deposit = netAmount(totalActual, !!f.agency)
  const totalRate = totalList > 0 ? Math.round((1 - totalActual / totalList) * 1000) / 10 : 0

  const firstStart = products
    .map(id => { const pr = rmnProduct(id); const L = lineOf(id); return pr.push ? L.send_date : L.start })
    .filter(Boolean).sort()[0] || todayISO()
  const tentativeOK = canTentative(firstStart, todayISO())

  const soldOutIds = products.filter(id => {
    const pr = rmnProduct(id); const L = lineOf(id); const a = availOf(id)
    if (!a) return false
    return pr.push ? (Number(L.push_units) || 1) * 50_000 > a.left : Math.max(1, Number(L.qty) || 1) > a.left
  })
  const soldOut = soldOutIds.length > 0

  /* 필수 항목 미입력 체크 ('26.7) — key로 해당 입력에 빨간 테두리, label로 안내 목록 */
  const missing = []
  if (!f.advertiser.trim()) missing.push({ key: 'advertiser', label: '광고주명' })
  for (const id of products) {
    const pr = rmnProduct(id); const L = lineOf(id)
    const pre = products.length > 1 ? `${id} ` : ''
    if (pr.msg) {   // 카카오톡: 발송 일자·시간·건수
      if (!L.send_date) missing.push({ key: `${id}:send_date`, label: `${pre}발송 일자` })
      if (!L.send_time) missing.push({ key: `${id}:send_time`, label: `${pre}발송 시간` })
      if (!(Number(L.msg_count) > 0)) missing.push({ key: `${id}:msg_count`, label: `${pre}발송 건수` })
    } else if (pr.push) {
      if (!L.send_date) missing.push({ key: `${id}:send_date`, label: `${pre}발송 일자` })
      if (!L.send_time) missing.push({ key: `${id}:send_time`, label: `${pre}발송 시간` })
    } else if (pr.insta) {
      if (!L.start) missing.push({ key: `${id}:start`, label: `${pre}게시일` })
    } else {
      if (!L.start) missing.push({ key: `${id}:start`, label: `${pre}시작일` })
      L.segs.forEach((s, i) => { if (!s.start) missing.push({ key: `${id}:seg${i}`, label: `${pre}추가 일정 ${i + 2}회차` }) })
    }
  }
  const missKeys = new Set(missing.map(m => m.key))
  const errCls = key => (missKeys.has(key) ? ' rmn-err' : '')
  const valid = products.length >= 1 && missing.length === 0 && !soldOut

  const submit = async () => {
    if (!valid) return
    const shared = {
      advertiser: f.advertiser.trim(), campaign: f.campaign.trim(),
      agency: f.agency === '직접입력' ? (f.agency_custom || '').trim() || '기타' : f.agency,
      agency_manager: f.agency_manager, agency_phone: f.agency_phone, agency_email: f.agency_email,
      status: f.status, memo: f.memo.trim(),
    }
    const rowOf = id => {
      const pr = rmnProduct(id); const L = lineOf(id); const c = calcOf(id)
      const push = !!pr?.push
      const insta = !!pr?.insta
      const q = push || insta ? 1 : Math.max(1, Number(L.qty) || 1)
      /* 인스타 상단 고정(7일)만 기간형 — 나머지 구성은 게시일 하루 */
      const instaEnd = insta ? (L.insta_prod.includes('7일') ? addDaysISO(L.start, 6) : L.start) : null
      const row = {
        ...shared, product: id,
        start_date: push ? L.send_date : L.start,
        end_date: push ? L.send_date : insta ? instaEnd : (L.end || null),
        send_at: push ? `${L.send_date}T${L.send_time}:00+09:00` : null,
        push_qty: push ? (pr.msg ? (Number(L.msg_count) || 0) : (Number(L.push_units) || 1) * pr.unitSize) : null,
        discount_rate: Number(L.discount) || 0,
        list_price: c.list, actual_price: c.actual, net_amount: netAmount(c.actual, !!shared.agency),
      }
      /* qty·option: 값 있을 때만 전송(컬럼 미설정 하위호환) */
      if (q > 1 || (editId && origQty > 1)) row.qty = q
      if (pr?.msg && L.target) row.option = '타겟팅'
      if (insta) row.option = `${L.insta_prod} ${L.insta_fmt}`
      return row
    }
    try {
      if (editId) { await updateRmn(editId, rowOf(f.product)); setMsg(`"${shared.advertiser}" 수정됨`); toast('수정 저장됨') }
      else {
        let n = 0
        for (const id of products) {
          const base = rowOf(id)
          await createRmn(base); n++
          /* 분할 세그먼트 — 별도 부킹 행(금액 0, 재고 점유 전용): 과금은 본 행에 주 단위로 실림 */
          for (const s of lineOf(id).segs.filter(s => s.start)) {
            await createRmn({ ...base, start_date: s.start, end_date: s.end || s.start, list_price: 0, actual_price: 0, net_amount: 0 }); n++
          }
        }
        const label = products.map(id => { const c = calcOf(id); return c.qty > 1 ? `${id}×${c.qty}` : id }).join(', ')
        setMsg(`"${shared.advertiser}" ${shared.status} ${n}건 등록됨${products.length > 1 ? ` (${label})` : ''}`); toast(`부킹 ${n}건 등록됨`)
      }
      setF(EMPTY); setEditId(null); setOrigQty(1); setSel(['메인배너']); setLines({ 메인배너: defaultLine() })
      setCamp({ start: todayISO(), end: addDaysISO(todayISO(), PRICE_DAYS - 1) })
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  const startEdit = b => {
    setMode('등록')   // 수정은 등록 세그의 폼에서
    setEditId(b.id)
    setOrigQty(bookingQty(b))
    setPickGroup(null)
    setSel([b.product])
    const opt = b.option || ''
    const pr = rmnProduct(b.product)
    setLines({
      [b.product]: {
        start: b.start_date, end: b.end_date || '', segs: [], own: true,
        qty: bookingQty(b), discount: String(b.discount_rate || ''),
        price: String(b.actual_price || ''),   // 저장값 보존 — 할인·기간 바꾸면 재계산
        send_date: (b.send_at || '').slice(0, 10), send_time: (b.send_at || 'T10:00').slice(11, 16) || '10:00',
        push_units: (b.push_qty && !pr?.msg) ? Math.round(b.push_qty / 50000) : 1,
        msg_count: pr?.msg ? String(b.push_qty || '') : '',
        target: opt === '타겟팅',
        insta_prod: INSTA_PRODUCTS.find(p => opt.includes(p)) || INSTA_PRODUCTS[0],
        insta_fmt: INSTA_FORMATS.find(x => opt.includes(x)) || INSTA_FORMATS[0],
      },
    })
    setF({
      advertiser: b.advertiser, campaign: b.campaign || '', product: b.product,
      agency: b.agency && !RMN_AGENCIES.includes(b.agency) ? '직접입력' : (b.agency || ''),
      agency_custom: b.agency || '',
      agency_manager: b.agency_manager || '', agency_phone: b.agency_phone || '', agency_email: b.agency_email || '',
      status: b.status, memo: b.memo || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setStatus = async (b, s) => {
    try { await updateRmn(b.id, { status: s }); refresh() } catch (e) { setMsg(e.message) }
  }
  /* 상품(부킹)별 이미지 첨부 ('26.7) — 집행 화면과 결과 캡처. images만 부분 PATCH */
  const setItemImages = async (b, images) => {
    try { await updateRmn(b.id, { images }); await refresh() }
    catch (e) { throw /400/.test(e.message) ? new Error('이미지 컬럼 미설정, setup.md 8-3 SQL 1줄 실행 필요') : e }
  }
  const del = async id => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    try { await deleteRmn(id); setMsg('삭제됨'); toast('삭제됨', { danger: true }); refresh() } catch (e) { setMsg(e.message) }
  }

  /* 캠페인 그룹핑 ('26.7) — [광고주+캠페인명] 기준. 진행중 = 미완료 캠페인 / 완료·취소 별도 */
  const campaigns = useMemo(() => groupCampaigns(bookings), [bookings])
  const activeCamps = campaigns.filter(g => !g.done)
  /* 등록 세그 우측 "최근 등록" 3건 (v2 3차) */
  const recent = useMemo(() =>
    [...bookings].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 3),
  [bookings])
  const doneCamps = campaigns.filter(g => g.done)
  const canceled = bookings.filter(b => b.status === '취소')
  /* 완료·취소 검색 (광고주·캠페인·상품) — 재적재로 완료 건이 많아 검색 필요 */
  const dq = doneQuery.trim().toLowerCase()
  const matchG = g => !dq || `${g.advertiser} ${g.campaign} ${g.items.map(b => b.product).join(' ')}`.toLowerCase().includes(dq)
  const doneShown = dq ? doneCamps.filter(matchG) : doneCamps
  const canceledShown = dq ? canceled.filter(b => `${b.advertiser} ${b.campaign || ''} ${b.product}`.toLowerCase().includes(dq)) : canceled

  /* 상태 일괄 — 캠페인 전체 상품을 함께 진행 (취소 건 제외) */
  const setCampaignStatus = async (g, s) => {
    try {
      await Promise.all(g.items.filter(b => b.status !== '취소').map(b => updateRmn(b.id, { status: s })))
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  /* 결과보고서 엑셀 버튼은 '26.7.29 제거 — 광고주 공유 대시보드가 대체.
     생성 함수(rmnDocs.buildResultXlsx)는 보존, 필요해지면 버튼만 되살리면 됨 */

  /* 광고주 공유 리포트 발급 모달 ('26.7.29) — 스냅샷·토큰·30일·임시 비밀번호 */
  const [shareFor, setShareFor] = useState(null)

  /* 청약서 — 캠페인 상품 전체를 한 장으로 (상품 순서 = DOC_ORDER) */
  const makeOrderGroup = async g => {
    const group = [...g.items].filter(b => b.status !== '취소')
      .sort((a, c) => DOC_ORDER.indexOf(a.product) - DOC_ORDER.indexOf(c.product))
    try { await buildOrderXlsx(group, todayISO()); setMsg(`"${g.advertiser}" 청약서 다운로드 (${group.length}개 상품)`) }
    catch (err) { setMsg(err.message) }
  }

  return (
    <div className="wrap cal-wrap">
      <header>
        <h1>RMN</h1>
        <div className="masthead-sub">
          부킹과 재고, 정산 관리
        </div>
      </header>

      {rows === undefined && <div className="empty">불러오는 중</div>}
      {rows === null && (
        <div className="mon-note">
          RMN 테이블이 아직 없습니다. Supabase SQL Editor에서 <b>data/rmn-setup.sql</b>을
          1회 실행하면 사용 가능합니다 (절차: supabase-setup.md 8장)
        </div>
      )}

      {Array.isArray(rows) && (
        <>
          {/* 세그먼트 (v2 3차) — 매체 캘린더의 월간/캠페인과 같은 문법 */}
          <div className="cal-controls">
            <div className="seg">
              {[['현황', '진행 현황'], ['등록', '부킹 등록'], ['분석', '분석']].map(([k, label]) => (
                <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{label}</button>
              ))}
            </div>
          </div>

          {mode === '분석' && <RmnAnalytics rows={rows} activeCamps={activeCamps} />}

          {mode === '현황' && (
            <>
              {/* ── 부킹 캘린더 ('26.7 최상단 이동) — 캠페인 칩, 클릭 시 상품 시트 ── */}
              <div className="group-label">부킹 캘린더 <small className="adm-count">칩을 누르면 상품 표시</small></div>
              <RmnMonth campaigns={campaigns} onPick={setPickGroup} />
            </>
          )}

          {mode === '등록' && (
          <div className="rmn-form-cols">
          <div className="rmn-form-main">
          <div className="dash-panel">
          {/* ── 신규 부킹 (상품 선택 포함 — '26.7 통합) ── */}
          <div className="group-label">{editId ? '부킹 수정' : '신규 부킹'} <small className="adm-count">{editId ? '단일 상품' : products.length > 1 ? `${products.length}개 상품 묶음` : '상품을 골라 여러 개 묶음 판매 가능'}</small></div>
          <div className="adm-taform">
            <div className="adm-row">
              <label className="wide">광고주명 *<input className={errCls('advertiser')} value={f.advertiser} onChange={e => set('advertiser', e.target.value)} placeholder="예: 샤넬" /></label>
              <label className="wide">캠페인명<input value={f.campaign} onChange={e => set('campaign', e.target.value)} placeholder="예: 홀리데이 캠페인" /></label>
            </div>

            {/* 캠페인 기간 일괄 선택 ('26.7) — 구좌 상품이 이 기간을 따라감, 상품별로 다를 때만 라인에서 개별 변경 */}
            {!editId && hasSlotProduct && (
              <div className="adm-row rmn-campperiod">
                <label>캠페인 시작일<input type="date" value={camp.start} onChange={e => setCampPeriod('start', e.target.value)} /></label>
                <label>캠페인 종료일<input type="date" value={camp.end} min={camp.start} onChange={e => setCampPeriod('end', e.target.value)} /></label>
                <span className="rmn-cp-note mute">구좌 상품에 일괄 적용, 상품별로 다르면 아래에서 개별 변경</span>
              </div>
            )}

            {/* 상품 선택 토글 — 폼 안 ('26.7: 별도 섹션에서 신규 부킹 안으로 통합) */}
            <div className="rmn-avail rmn-avail-in">
              {RMN_PRODUCTS.map(pr => {
                const on = products.includes(pr.id)
                const sub = pr.insta ? '게시형 구성 4종'
                  : pr.msg ? '발송형 건당 100원, 타겟팅 +10%'
                  : pr.push ? '발송형 건당 50원'
                  : `구좌 ${pr.slots}개, ${fmtWon(pr.price)}/7일`
                /* 카드 내 재고 미니 게이지 (v2 3차) — 캠페인 기간 기준, 구좌 상품만 */
                const av = pr.slots ? slotAvailability(bookings, pr.id, camp.start, camp.end, editId) : null
                return (
                  <button key={pr.id} type="button" className={'rmn-slot' + (on ? ' on' : '')}
                    disabled={editId && !on} onClick={() => toggleSel(pr.id)}>
                    <b>{pr.id}</b>
                    <span>{sub}</span>
                    {av && (
                      <>
                        <span className="pc-bar">
                          <span className={av.left === 0 ? 'full' : ''}
                            style={{ width: (av.left === 0 ? 100 : Math.max(5, av.left / av.total * 100)) + '%' }} />
                        </span>
                        <span className={'pc-av' + (av.left === 0 ? ' full' : '')}>
                          {av.left === 0 ? '구좌 마감 (선택 기간)' : `잔여 ${av.left}/${av.total} 구좌`}
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            {/* ── 상품별 라인 ('26.7) — 기간·수량·할인율·가격을 상품마다 따로 ── */}
            <div className="rmn-lines">
              {products.map(id => {
                const pr = rmnProduct(id); const L = lineOf(id); const c = calcOf(id); const a = availOf(id)
                const full = a && (pr.push ? (Number(L.push_units) || 1) * 50_000 > a.left : Math.max(1, Number(L.qty) || 1) > a.left)
                return (
                  <div key={id} className={'rmn-line' + (full ? ' full' : '')}>
                    <div className="rmn-line-head">
                      <span className="rmn-line-name"><Ini id={id} /> <b>{id}</b>
                        {!pr.push && !pr.insta && <span className="rmn-wk">{c.weeks}주{c.qty > 1 ? ` ×${c.qty}` : ''}</span>}
                        {pr.insta && <span className="rmn-wk">{L.insta_prod}</span>}
                        {pr.msg && L.target && <span className="rmn-wk">타겟팅 +10%</span>}
                      </span>
                      {a && <span className={'mute rmn-line-av' + (full ? ' full' : '')}>{pr.push ? `잔여 ${a.left.toLocaleString('ko-KR')}건` : full ? '구좌 마감' : `잔여 ${a.left}/${a.total}`}</span>}
                      {!editId && products.length > 1 && <button type="button" className="rmn-line-x" onClick={() => toggleSel(id)}>제거</button>}
                    </div>
                    {pr.insta ? (
                      <div className="adm-row">
                        <label>구성
                          <select value={L.insta_prod} onChange={e => setLine(id, 'insta_prod', e.target.value)}>
                            {INSTA_PRODUCTS.map(p2 => <option key={p2} value={p2}>{p2}</option>)}
                          </select>
                        </label>
                        <label>형식
                          <select value={L.insta_fmt} onChange={e => setLine(id, 'insta_fmt', e.target.value)}>
                            {INSTA_FORMATS.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </label>
                        <label>게시일 *<input type="date" className={errCls(`${id}:start`)} value={L.start} onChange={e => setLine(id, 'start', e.target.value)} /></label>
                      </div>
                    ) : pr.msg ? (
                      <div className="adm-row">
                        <label>발송 일자 *<input type="date" className={errCls(`${id}:send_date`)} value={L.send_date} onChange={e => setLine(id, 'send_date', e.target.value)} /></label>
                        <label>발송 시간 *<input type="time" className={errCls(`${id}:send_time`)} value={L.send_time} onChange={e => setLine(id, 'send_time', e.target.value)} /></label>
                        <label>발송 건수 *<input inputMode="numeric" className={errCls(`${id}:msg_count`)}
                          value={L.msg_count !== '' ? Number(num(L.msg_count)).toLocaleString('ko-KR') : ''}
                          onChange={e => setLine(id, 'msg_count', e.target.value)} placeholder="예: 120,000" /></label>
                        <label className="rmn-target">타겟팅 (+10%)
                          <input type="checkbox" checked={!!L.target} onChange={e => setLine(id, 'target', e.target.checked)} />
                        </label>
                      </div>
                    ) : pr.push ? (
                      <div className="adm-row">
                        <label>발송 일자 *<input type="date" className={errCls(`${id}:send_date`)} value={L.send_date} onChange={e => setLine(id, 'send_date', e.target.value)} /></label>
                        <label>발송 시간 *<input type="time" className={errCls(`${id}:send_time`)} value={L.send_time} onChange={e => setLine(id, 'send_time', e.target.value)} /></label>
                        <label>발송량 (5만 단위)
                          <select value={L.push_units} onChange={e => setLine(id, 'push_units', e.target.value)}>
                            {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{(n * 5).toLocaleString('ko-KR')}만 건</option>))}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <>
                        {!editId && (
                          <div className="rmn-perflag">
                            {L.own
                              ? <>개별 기간 <button type="button" className="rmn-snap ghost" onClick={() => resetLinePeriod(id)}>캠페인 기간으로</button></>
                              : <span className="mute">캠페인 기간 적용 중, 날짜를 바꾸면 이 상품만 개별 기간</span>}
                          </div>
                        )}
                        <div className="adm-row">
                          <label>시작일 *<input type="date" className={errCls(`${id}:start`)} value={L.start} onChange={e => setLineStart(id, e.target.value)} /></label>
                          <label>종료일<input type="date" value={L.end} min={L.start} onChange={e => setLineEnd(id, e.target.value)} /></label>
                          {pr.slots > 1 && (
                            <label>수량
                              <div className="rmn-step">
                                <button type="button" onClick={() => setLine(id, 'qty', Math.max(1, c.qty - 1))} disabled={c.qty <= 1} aria-label="수량 감소">−</button>
                                <b>{c.qty}</b>
                                <button type="button" onClick={() => setLine(id, 'qty', Math.min(pr.slots, c.qty + 1))} disabled={c.qty >= pr.slots} aria-label="수량 증가">＋</button>
                              </div>
                            </label>
                          )}
                        </div>
                        {/* 7일(과금 주) 미달 안내 + 잔여일 분할 선택 ('26.7 복원 — 라인 단위) */}
                        {L.start && c.days < c.weeks * PRICE_DAYS && (
                          <div className="rmn-days off">
                            <div className="rmn-days-line">
                              집행 <b>{c.days}일</b>{L.segs.length ? <span className="mute"> (분할 {L.segs.length + 1}회)</span> : ''}
                              과금 <b>{c.weeks}주({c.weeks * PRICE_DAYS}일 기준)</b> 잔여 <b>{c.weeks * PRICE_DAYS - c.days}일</b>을
                              다른 일자에 잘라 쓰려면
                              <button type="button" className="rmn-snap" onClick={() => addSeg(id)}>＋ 추가 일정 선택</button>
                            </div>
                          </div>
                        )}
                        {L.segs.map((s, i) => (
                          <div key={i} className="rmn-seg">
                            <span className="rmn-seg-lbl">추가 일정 {i + 2}회차</span>
                            <input type="date" className={errCls(`${id}:seg${i}`)} value={s.start} onChange={e => { const v = e.target.value; setSeg(id, i, 'start', v); if (v && (!s.end || s.end < v)) setSeg(id, i, 'end', v) }} />
                            <span className="rmn-seg-til">~</span>
                            <input type="date" value={s.end} min={s.start} onChange={e => setSeg(id, i, 'end', e.target.value)} />
                            <span className="mute">{s.start ? `${periodDays(s.start, s.end || s.start)}일` : ''}</span>
                            <button type="button" className="rmn-seg-x" onClick={() => rmSeg(id, i)} aria-label="추가 일정 삭제">삭제</button>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="adm-row">
                      <label>공시가<input value={c.list.toLocaleString('ko-KR')} readOnly className="rmn-ro" /></label>
                      <label>할인율 % <small className="mute">실판가 자동 계산</small><input inputMode="decimal" value={L.discount}
                        onChange={e => setLine(id, 'discount', e.target.value)} placeholder="0" /></label>
                      <label>실판가 <small className="mute">입력 시 할인율 역산</small><input inputMode="numeric"
                        value={L.price !== '' ? Number(num(L.price)).toLocaleString('ko-KR') : c.actual.toLocaleString('ko-KR')}
                        onChange={e => setLinePrice(id, e.target.value)} /></label>
                    </div>
                  </div>
                )
              })}
            </div>
            {soldOut && (
              <div className="rmn-soldout">
                <b>{soldOutIds.join(', ')}</b> 구좌가 해당 기간에 마감됐습니다. 기간이나 수량을 조정하세요.
              </div>
            )}

            {/* 합산·등록 버튼은 우측 고정 요약 패널로 이동 (v2 3차) */}
            <div className="adm-row">
              <label>판매사
                <select value={f.agency} onChange={e => set('agency', e.target.value)}>
                  <option value="">없음 (직접 판매)</option>
                  {RMN_AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="직접입력">직접 입력</option>
                </select>
              </label>
              {f.agency === '직접입력' && (
                <label>판매사명<input value={f.agency_custom || ''} onChange={e => set('agency_custom', e.target.value)} /></label>
              )}
              <label>상태
                <select value={f.status} onChange={e => set('status', e.target.value)}>
                  <option value="가부킹" disabled={!tentativeOK}>가부킹{!tentativeOK ? ' (시작 3개월 이내라 불가)' : ''}</option>
                  {RMN_STATUS.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="취소">취소</option>
                </select>
              </label>
            </div>
            {f.agency && (
              <div className="adm-row">
                <label>담당자<input value={f.agency_manager} onChange={e => set('agency_manager', e.target.value)} /></label>
                <label>연락처<input value={f.agency_phone} onChange={e => set('agency_phone', e.target.value)} /></label>
                <label className="wide">이메일<input value={f.agency_email} onChange={e => set('agency_email', e.target.value)} /></label>
              </div>
            )}
            <label>메모<textarea rows={2} value={f.memo} onChange={e => set('memo', e.target.value)}
              placeholder="사업자등록번호와 주소는 판매사 연동값 확보 후 자동 입력" /></label>
          </div>
          </div>
          </div>

          {/* ── 우측 고정 요약 (v2 3차 시안) — 입력하면서 금액·미입력·재고를 실시간 확인 ── */}
          <div className="rmn-form-side">
            <section className="dash-panel">
              <div className="group-label">부킹 요약 <small className="adm-count">{products.length}개 상품</small></div>
              <div className="rsum-row"><span>총 공시가</span><b>{fmtWon(totalList)}</b></div>
              <div className="rsum-row"><span>총 광고비 (실판가 합)</span><b>{fmtWon(totalActual)}</b></div>
              <div className="rsum-disc">
                <span>총 할인율</span>
                <span className="disc-t"><span className="disc-f" style={{ width: Math.min(100, Math.max(0, totalRate)) + '%' }} /></span>
                <b>{totalRate}%</b>
              </div>
              <div className="rsum-tot"><span>입금가{f.agency && <small>수수료 30% 차감</small>}</span></div>
              <div className="rsum-tot-v">{fmtWon(deposit)}</div>
              {missing.length > 0 && (
                <div className="rsum-miss"><b>미입력 {missing.length}건</b>{missing.map(m => m.label).join(', ')}</div>
              )}
              {soldOut && missing.length === 0 && (
                <div className="rsum-miss"><b>구좌 마감</b>{soldOutIds.join(', ')}</div>
              )}
              <button className="btn-solid" disabled={!valid} onClick={submit}>
                {editId ? '수정 저장' : products.length > 1 ? `${products.length}건 동시 부킹` : '부킹 등록'}
              </button>
              {!valid && (
                <div className="rsum-cta-s">
                  {soldOut && missing.length === 0 ? '마감 구좌를 조정하면 활성화됩니다' : '미입력 항목을 채우면 활성화됩니다'}
                </div>
              )}
              {editId && (
                <button className="btn-ghost sm" style={{ width: '100%', marginTop: 10 }}
                  onClick={() => { setF(EMPTY); setEditId(null); setOrigQty(1); setSel(['메인배너']); setLines({ 메인배너: defaultLine() }); setCamp({ start: todayISO(), end: addDaysISO(todayISO(), PRICE_DAYS - 1) }) }}>
                  수정 취소
                </button>
              )}
              {msg && <div className="adm-msg">{msg}</div>}
            </section>

            <section className="dash-panel">
              <div className="group-label">선택 기간 재고</div>
              <div className="dash-d">{fmtD(camp.start)} ~ {fmtD(camp.end)} 이번 부킹 반영</div>
              <div className="rinv">
                {RMN_PRODUCTS.filter(pr => pr.slots).map(pr => {
                  const a = slotAvailability(bookings, pr.id, camp.start, camp.end, editId)
                  const mine = products.includes(pr.id) ? Math.max(1, Number(lineOf(pr.id).qty) || 1) : 0
                  const used = a.total - a.left
                  const over = mine > a.left
                  return (
                    <div key={pr.id} className="rinv-row">
                      <span className="rinv-n">{pr.id}</span>
                      <span className="rinv-t">
                        <span className="rinv-f" style={{ width: (used / a.total * 100) + '%' }} />
                        <span className={'rinv-f mine' + (over ? ' over' : '')} style={{ width: (Math.min(mine, a.total - used) / a.total * 100) + '%' }} />
                      </span>
                      <span className="rinv-v">{Math.max(0, a.left - mine)}/{a.total}</span>
                    </div>
                  )
                })}
              </div>
              <div className="rinv-note">연한 막대는 기존 부킹, 진한 막대는 이번 부킹, 숫자는 등록 후 잔여</div>
            </section>

            <section className="dash-panel">
              <div className="group-label">최근 등록</div>
              {recent.map(b => (
                <div key={b.id} className="rrec">
                  <Ini id={b.product} />
                  <b>{b.advertiser}{b.campaign ? ` ${b.campaign}` : ''}</b>
                  <span>{fmtRange(b)}</span>
                </div>
              ))}
              {recent.length === 0 && <div className="mute rmn-empty">등록된 부킹이 없습니다</div>}
            </section>
          </div>
          </div>
          )}

          {mode === '현황' && (
          <>
          {/* ── 진행 중 캠페인 ('26.7 — [광고주+캠페인명] 그룹, 클릭 시 세부 상품 펼침) ── */}
          <div className="group-label">진행 중 <small className="adm-count">{activeCamps.length}캠페인 {activeCamps.reduce((a, g) => a + g.items.length, 0)}건</small></div>
          <div className="rmn-camps">
            {activeCamps.length === 0 && <div className="mute rmn-empty">진행 중인 캠페인이 없습니다</div>}
            {activeCamps.map(g => (
              <CampaignRow key={g.key} g={g} open={expanded === g.key}
                onToggle={() => setExpanded(x => x === g.key ? null : g.key)}
                editId={editId} confirmDel={confirmDel}
                onAdvance={() => setCampaignStatus(g, nextStatus(g.status))}
                onSetStatus={s => setCampaignStatus(g, s)}
                onOrder={() => makeOrderGroup(g)} onShare={() => setShareFor(g)}
                onItemStatus={setStatus} onEdit={startEdit} onDel={del} onItemAdvance={b => setStatus(b, nextStatus(b.status))}
                onItemImages={setItemImages} />
            ))}
          </div>

          {/* ── 캠페인 제안서 만들기 ('26.7 3차 — 접힘, 기존 동선 불변) ── */}
          <ProposalMaker />

          {/* ── 정산 요약 ('26.7 2차) — 월별 총광고비·입금가·미수금(입금 확인 전) ── */}
          <SettleSummary bookings={bookings} onMsg={setMsg} />

          {(doneCamps.length > 0 || canceled.length > 0) && (
            <details className="ta-office rmn-done">
              <summary><span className="ta-name">완료와 취소</span><span className="ta-cnt">{doneCamps.length}캠페인{canceled.length ? `, 취소 ${canceled.length}` : ''}</span></summary>
              <input className="rmn-done-q" placeholder="광고주, 캠페인, 상품 검색"
                value={doneQuery} onChange={e => setDoneQuery(e.target.value)} />
              <div className="rmn-camps">
                {doneShown.length === 0 && <div className="mute rmn-empty">검색 결과 없음</div>}
                {doneShown.map(g => (
                  <CampaignRow key={g.key} g={g} open={expanded === g.key} showYear
                    onToggle={() => setExpanded(x => x === g.key ? null : g.key)}
                    editId={editId} confirmDel={confirmDel}
                    onAdvance={() => setCampaignStatus(g, nextStatus(g.status))}
                    onSetStatus={s => setCampaignStatus(g, s)}
                    onOrder={() => makeOrderGroup(g)} onShare={() => setShareFor(g)}
                    onItemStatus={setStatus} onEdit={startEdit} onDel={del} onItemAdvance={b => setStatus(b, nextStatus(b.status))}
                    onItemImages={setItemImages} />
                ))}
                {canceledShown.map(b => (
                  <div key={b.id} className="rmn-cancel-row">
                    <span className="rmn-line-name"><Ini id={b.product} /> <span className="rmn-year">{(b.start_date || '').slice(0, 4)}</span> <b>{b.advertiser}</b>{b.campaign ? <span className="mute"> {b.campaign}</span> : ''} <span className="rmn-gtag">취소</span></span>
                    <span className="mute rmn-camp-meta">{b.product}, {fmtRange(b)}, {fmtWon(b.actual_price)}</span>
                    <button className="btn-ghost sm" onClick={() => startEdit(b)}>수정</button>
                    <button className={'btn-ghost sm danger' + (confirmDel === b.id ? ' arm' : '')} onClick={() => del(b.id)}>{confirmDel === b.id ? '한 번 더' : '삭제'}</button>
                  </div>
                ))}
              </div>
            </details>
          )}
          </>
          )}
        </>
      )}

      {pickGroup && <CampaignPicker g={pickGroup} onEdit={startEdit} onOrder={() => makeOrderGroup(pickGroup)} onClose={() => setPickGroup(null)} />}

      {shareFor && <ShareModal g={shareFor} onClose={() => setShareFor(null)} />}

      {notices && <RmnNotice notices={notices} onClose={closeNotice}
        onConvert={async b => { await setStatus(b, '부킹'); setNotices(n => ({ ...n, tentative: n.tentative.filter(x => x.id !== b.id) })) }} />}
    </div>
  )
}

/* ── 분석 세그 (v2 3차 '26.7.29) — 부킹 데이터 기반 대시보드.
   전부 rows(부킹) 실데이터 계산 — 취소 제외, 금액은 actual_price/net_amount 기준 */
function RmnAnalytics({ rows, activeCamps }) {
  const year = new Date().getFullYear()
  const live = useMemo(() => rows.filter(b => b.status !== '취소'), [rows])
  const yearRows = useMemo(() => live.filter(b => String(b.start_date || '').startsWith(String(year))), [live, year])
  const prevRows = useMemo(() => live.filter(b => String(b.start_date || '').startsWith(String(year - 1))), [live, year])

  const s = useMemo(() => {
    const md = todayISO().slice(5)
    const cur = yearRows.reduce((a, b) => a + (b.actual_price || 0), 0)
    const prevSame = prevRows.filter(b => (b.start_date || '').slice(5) <= md)
      .reduce((a, b) => a + (b.actual_price || 0), 0)
    const growth = prevSame > 0 ? Math.round((cur - prevSame) / prevSame * 100) : null
    const unpaidRows = live.filter(b => statusIdx(b.status) > -1 && statusIdx(b.status) < statusIdx('입금 확인'))
    const unpaid = unpaidRows.reduce((a, b) => a + (b.net_amount || 0), 0)
    const list = yearRows.reduce((a, b) => a + (b.list_price || 0), 0)
    const rate = list > 0 ? Math.round((1 - cur / list) * 1000) / 10 : 0
    const spark = []
    for (let m = 1; m <= 12; m++) {
      spark.push(yearRows.filter(b => Number((b.start_date || '').slice(5, 7)) === m)
        .reduce((a, b) => a + (b.actual_price || 0), 0))
    }
    const lastM = Math.max(1, ...yearRows.map(b => Number((b.start_date || '').slice(5, 7)) || 1))
    return { cur, growth, unpaid, unpaidN: unpaidRows.length, rate, spark: spark.slice(0, lastM), items: yearRows.length }
  }, [yearRows, prevRows, live])

  /* 월별 매출 — 올해(그린) vs 작년(라일락), 뒤쪽 빈 달은 잘라냄 */
  const monthly = useMemo(() => {
    const sum = (list, m) => list.filter(b => Number((b.start_date || '').slice(5, 7)) === m)
      .reduce((a, b) => a + (b.actual_price || 0), 0)
    const arr = []
    for (let m = 1; m <= 12; m++) arr.push([`${m}월`, sum(yearRows, m), sum(prevRows, m)])
    while (arr.length > 1 && arr.at(-1)[1] === 0 && arr.at(-1)[2] === 0) arr.pop()
    return arr
  }, [yearRows, prevRows])

  /* 상품 믹스 — 올해 매출 비중 상위 4 + 기타 */
  const mix = useMemo(() => {
    const by = {}
    for (const b of yearRows) by[b.product] = (by[b.product] || 0) + (b.actual_price || 0)
    const sorted = Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 4)
    const rest = sorted.slice(4).reduce((a, [, v]) => a + v, 0)
    if (rest > 0) top.push([`기타 ${sorted.length - 4}종`, rest])
    return top
  }, [yearRows])

  /* 이번 달 재고 — 구좌 상품 점유율 (기간 내 최대 동시 점유 기준) */
  const t = todayISO()
  const mStart = t.slice(0, 8) + '01'
  const mEnd = toISO(new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0))
  const gauges = RMN_PRODUCTS.filter(pr => pr.slots).map(pr => {
    const a = slotAvailability(rows, pr.id, mStart, mEnd, null)
    return { id: pr.id, pct: (a.total - a.left) / a.total * 100, sub: `${pr.slots}구좌 ${a.left === 0 ? '마감' : `잔여 ${a.left}`}` }
  })

  /* 상태 파이프라인 — 취소 제외 전 부킹의 상태 분포 */
  const pipe = RMN_STATUS.map(st => [st, live.filter(b => b.status === st).length])

  /* GA4 실적 — 노출 수집된 부킹만 구좌별 합산 (없으면 섹션 숨김) */
  const ga = useMemo(() => {
    const by = {}
    for (const b of live) {
      if (!b.impressions) continue
      const v = (by[b.product] = by[b.product] || { imp: 0, clk: 0 })
      v.imp += b.impressions || 0
      v.clk += b.clicks || 0
    }
    return Object.entries(by).sort((a, b) => b[1].imp - a[1].imp).map(([k, v]) => ({
      name: k, sub: `노출 ${Math.round(v.imp / 10000).toLocaleString('ko-KR')}만`, value: v.imp,
      disp: v.imp > 0 ? (v.clk / v.imp * 100).toFixed(2) + '%' : '', unit: 'CTR',
    }))
  }, [live])

  const fmtM = v => v >= 1e8 ? (v / 1e8).toFixed(1) + '억'
    : v >= 1e4 ? Math.round(v / 1e4).toLocaleString('ko-KR') + '만' : (v || 0).toLocaleString('ko-KR')

  return (
    <>
      <div className="mon-hero">
        <Kpi label={`${year} 누적 매출`} value={fmtM(s.cur)}
          delta={s.growth != null ? (s.growth >= 0 ? `▲ ${s.growth}%` : `▼ ${Math.abs(s.growth)}%`) : null}
          deltaUp={s.growth > 0} sub={s.growth != null ? `전년 동기 대비 ${s.items}건` : `${s.items}건`} spark={s.spark} />
        <Kpi label="진행 중 캠페인" value={activeCamps.length} unit="건"
          sub={`상품 ${activeCamps.reduce((a, g) => a + g.items.length, 0)}건`} />
        <Kpi label="미수금" value={fmtM(s.unpaid)} sub={`입금 확인 전 ${s.unpaidN}건`} />
        <Kpi label="평균 실효 할인율" value={s.rate} unit="%" sub="공시가 대비 실판가 (올해)" />
      </div>

      <div className="dash-grid g23">
        <div className="dash-panel">
          <div className="group-label">월별 매출</div>
          <div className="dash-d">천원 단위, 시작월 기준이며 취소 제외</div>
          <DuoBars data={monthly} fmt={v => Math.round(v / 1000).toLocaleString('ko-KR')}
            legendA={String(year)} legendB={String(year - 1)} />
        </div>
        <div className="dash-panel flat">
          <div className="group-label">상품 믹스</div>
          <div className="dash-d">{year} 매출 비중</div>
          <Donut data={mix} center={fmtM(s.cur)} fmt={fmtM} />
        </div>
      </div>

      <div className="dash-grid g32">
        <div className="dash-panel flat">
          <div className="group-label">이번 달 재고</div>
          <div className="dash-d">구좌 점유율 {Number(t.slice(5, 7))}월 기준</div>
          <div className="gauges">
            {gauges.map(g => <Gauge key={g.id} pct={g.pct} label={g.id} sub={g.sub} />)}
          </div>
        </div>
        <div className="dash-panel">
          <div className="group-label">진행 상태</div>
          <div className="dash-d">가부킹부터 완료까지, 취소 제외</div>
          <Pipeline steps={pipe} />
        </div>
      </div>

      {ga.length > 0 && (
        <div className="dash-panel" style={{ marginTop: 16 }}>
          <div className="group-label">GA4 집행 실적</div>
          <div className="dash-d">구좌별 노출 합계와 CTR (GA 수집된 부킹만)</div>
          <HBars rows={ga} />
        </div>
      )}
    </>
  )
}

/* 받침 여부로 조사 선택 — "인스타그램은" / "카카오톡은" / "푸쉬는" */
const josa = (word, withBatchim, without) => {
  const ch = (word || '').at(-1)
  if (!ch) return without
  const code = ch.charCodeAt(0) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? withBatchim : without
}

/* 수기 실적 → 리포트 표기용 완성형 ('26.7.29). 입력이 없으면 null (집행 내역만 표기) */
const numOf = v => {
  const n = Number(String(v ?? '').replace(/[^\d]/g, ''))
  return n > 0 ? n : null
}
function buildPerf(product, vals) {
  const def = MANUAL_PERF[product]
  if (!def || !vals) return null
  const rows = def.fields.map(f => ({ label: f.label, value: numOf(vals[f.k]) })).filter(r => r.value)
  if (!rows.length) return null
  const first = numOf(vals[def.fields[0].k])
  const last = numOf(vals[def.fields.at(-1).k])
  const rate = first && last && def.fields.length > 1
    ? { label: def.rate, value: (last / first * 100).toFixed(2) + '%' } : null
  /* reach = 도달·발송 성공 / act = 반응(클릭·오픈·참여) — 리포트 KPI 합산용 */
  return { rows, rate, reach: first, act: def.fields.length > 1 ? last : null }
}

/* ── 광고주 공유 리포트 발급 ('26.7.29) — 스냅샷 저장 후 링크+임시 비밀번호 표시.
   데이터 = 이 캠페인의 GA 일별(rmn_ga_daily) + 상품 구성. 30일 만료, 회수 가능.
   금액(광고비·CPM·CPC)은 기본 미포함 — 체크 시에만 스냅샷에 실림 */
function ShareModal({ g, onClose }) {
  const [usePw, setUsePw] = useState(true)
  const [withMoney, setWithMoney] = useState(false)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState(null)      // { url, pw }
  const [err, setErr] = useState(null)
  const [existing, setExisting] = useState([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    listShares(g.advertiser, g.campaign).then(setExisting).catch(() => {})
  }, [g])

  /* 발송형(푸쉬·카카오톡)·게시형(인스타)은 GA 측정 대상이 아님 → 매체사 리포트 수기 입력 */
  const unItems = g.items.filter(b => {
    const p = rmnProduct(b.product)
    return p && (p.push || p.insta) && b.status !== '취소'
  })
  const unmeasured = [...new Set(unItems.map(b => b.product))]
  /* 수기 실적 입력값 — { 부킹id: { reach, clk, ... } }. 기존 저장분(perf_manual)이 있으면 프리필 */
  const [manual, setManual] = useState(() => Object.fromEntries(
    unItems.map(b => [b.id, { ...(b.perf_manual || {}) }])))
  const setM = (id, k, v) => setManual(m => ({ ...m, [id]: { ...m[id], [k]: v } }))

  const issue = async () => {
    setBusy(true); setErr(null)
    try {
      const dailyRaw = await listGaDaily(g.advertiser, g.start, g.end)
      const daily = (dailyRaw || []).map(r => ({ date: r.date, slot: r.slot, imp: r.impressions || 0, clk: r.clicks || 0 }))
      const items = g.items.filter(b => b.status !== '취소')
      if (items.length === 0) throw new Error('공유할 집행 건이 없습니다 (전부 취소)')
      /* GA 측정 여부 — 앱 구좌는 일별 데이터가 있고, 카카오톡·푸쉬·인스타는 매체사 미제공.
         측정 안 되는 매체도 "집행 내역"으로 표기 (빈칸 대신 사실만, 수치 추정 금지) */
      const measured = new Set(daily.map(r => r.slot))
      const data = {
        advertiser: g.advertiser, campaign: g.campaign || null,
        start: g.start, end: g.end,
        products: items.map(b => ({
          product: b.product, start: b.start_date, end: b.end_date, qty: bookingQty(b),
          measured: measured.has(b.product),
          option: b.option || null,
          sendQty: b.push_qty || null,
          sendAt: b.send_at || null,
          /* 수기 실적은 렌더 완료형으로 저장 — 필드 정의가 나중에 바뀌어도 과거 리포트는 그대로 */
          perf: buildPerf(b.product, manual[b.id]),
        })),
        spend: withMoney ? items.reduce((a, b) => a + (b.actual_price || 0), 0) : null,
        daily, createdAt: new Date().toISOString(),
      }
      const pw = usePw ? genPw() : null
      const row = await createShare({ advertiser: g.advertiser, campaign: g.campaign, data, pw, days: 30 })
      /* 입력한 실적을 부킹에도 저장해 다음 발급 때 프리필 (컬럼 미설정이면 조용히 스킵 — setup.md 8-6) */
      for (const b of unItems) {
        const v = manual[b.id]
        if (v && Object.values(v).some(x => numOf(x)))
          await updateRmn(b.id, { perf_manual: v }).catch(() => {})
      }
      setMade({ url: shareUrl(row.token), pw })
      toast('공유 링크 발급됨')
      listShares(g.advertiser, g.campaign).then(setExisting).catch(() => {})
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const copyAll = async () => {
    const text = made.pw
      ? `[${g.advertiser}${g.campaign ? ` ${g.campaign}` : ''} 캠페인 결과 리포트]\n${made.url}\n비밀번호: ${made.pw}\n(30일간 열람 가능합니다)`
      : `[${g.advertiser}${g.campaign ? ` ${g.campaign}` : ''} 캠페인 결과 리포트]\n${made.url}\n(30일간 열람 가능합니다)`
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { window.prompt('아래 내용을 복사하세요', text) }
  }

  /* 기존 발급 링크 복사 — 발급 직후 안내와 같은 문안 */
  const [copiedId, setCopiedId] = useState(null)
  const copyIssued = async x => {
    const url = shareUrl(x.token)
    const text = x.pw
      ? `[${g.advertiser}${g.campaign ? ` ${g.campaign}` : ''} 캠페인 결과 리포트]\n${url}\n비밀번호: ${x.pw}\n(${(x.expires_at || '').slice(0, 10)}까지 열람 가능합니다)`
      : `[${g.advertiser}${g.campaign ? ` ${g.campaign}` : ''} 캠페인 결과 리포트]\n${url}\n(${(x.expires_at || '').slice(0, 10)}까지 열람 가능합니다)`
    try { await navigator.clipboard.writeText(text); setCopiedId(x.id); setTimeout(() => setCopiedId(null), 2000) }
    catch { window.prompt('아래 내용을 복사하세요', text) }
  }

  const revoke = async id => {
    try { await deleteShare(id); setExisting(list => list.filter(x => x.id !== id)); toast('링크 회수됨', { danger: true }) }
    catch (e) { setErr(e.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="md-ch">광고주 공유 리포트</div>
        <div className="md-title">{g.advertiser}{g.campaign ? ` ${g.campaign}` : ''}</div>
        <div className="mute" style={{ fontSize: 13, lineHeight: 1.6 }}>
          이 캠페인의 결과(일별 노출과 클릭, CTR, 구좌별 성과)만 담은 열람 전용 페이지를 발급합니다.
          다른 캠페인이나 광고주 데이터는 포함되지 않으며 <b>30일 후 자동 만료</b>됩니다.
        </div>
        {/* GA 미측정 매체 실적 수기 입력 ('26.7.29 사용자 지시) — 카카오톡·푸쉬·인스타는
            GA4가 집계하지 못하므로, 매체사 리포트 수치를 여기서 받아 리포트에 함께 싣는다 */}
        {!made && unItems.length > 0 && (
          <div className="rmn-manual">
            <div className="group-label" style={{ fontSize: 15 }}>매체 실적 입력</div>
            <div className="mute" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              {unmeasured.join(', ')}{josa(unmeasured.at(-1), '은', '는')} GA에서 자동 수집되지 않습니다.
              매체사 리포트(카카오 비즈메시지 관리자, 인스타그램 인사이트 등) 수치를 입력하면
              리포트에 함께 표기됩니다. <b>비우면 집행 내역만</b> 표기됩니다.
            </div>
            {unItems.map(b => (
              <div className="rmn-manual-row" key={b.id}>
                <div className="rmn-manual-name">
                  <Dot id={b.product} /> {b.product}
                  {b.push_qty ? <small className="mute"> 발송 {Number(b.push_qty).toLocaleString('ko-KR')}건</small> : null}
                  {b.option ? <small className="mute"> {b.option}</small> : null}
                </div>
                <div className="rmn-manual-fields">
                  {(MANUAL_PERF[b.product]?.fields || []).map(f => (
                    <label key={f.k}>
                      {f.label}
                      <input type="text" inputMode="numeric" placeholder=""
                        value={manual[b.id]?.[f.k] ?? ''}
                        onChange={e => setM(b.id, f.k, e.target.value)} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!made ? (
          <>
            <div className="md-form" style={{ marginTop: 14 }}>
              <label className="shr-opt">
                임시 비밀번호 걸기 <small className="mute">해제 시 링크만으로 열람</small>
                <input type="checkbox" checked={usePw} onChange={e => setUsePw(e.target.checked)} />
              </label>
              <label className="shr-opt">
                광고비와 CPM, CPC 포함 <small className="mute">기본은 성과 지표만</small>
                <input type="checkbox" checked={withMoney} onChange={e => setWithMoney(e.target.checked)} />
              </label>
            </div>
            {err && <div className="qa-err">{err}</div>}
            <div className="md-actions">
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={onClose}>닫기</button>
              <button className="btn-solid" disabled={busy} onClick={issue}>{busy ? '발급 중' : '공유 링크 발급'}</button>
            </div>
          </>
        ) : (
          <>
            <dl className="md-grid" style={{ marginTop: 14 }}>
              <dt>링크</dt><dd style={{ wordBreak: 'break-all' }}>{made.url}</dd>
              {made.pw && <><dt>비밀번호</dt><dd className="strong">{made.pw}</dd></>}
              <dt>기한</dt><dd>발급일로부터 30일</dd>
            </dl>
            <div className="md-actions">
              <div className="md-spacer" />
              <button className="btn-ghost" onClick={onClose}>닫기</button>
              <button className={'btn-solid' + (copied ? '' : '')} onClick={copyAll}>{copied ? '복사됨 ✓' : '링크+비밀번호 복사'}</button>
            </div>
          </>
        )}

        {existing.length > 0 && (
          <div className="shr-issued">
            <div className="md-perf-title">발급된 링크 {existing.length}건 <small>회수하면 즉시 열람 불가</small></div>
            {/* 기존 발급분도 링크와 비밀번호를 다시 확인할 수 있어야 함 ('26.7.29) —
                광고주가 링크를 잃어버렸을 때 재발급 없이 같은 링크를 다시 보낼 수 있게 */}
            {existing.map(x => (
              <div key={x.id} className="shr-issued-row">
                <div className="shr-issued-top">
                  <span className="shr-issued-exp">{(x.expires_at || '').slice(0, 10)}까지</span>
                  <span className="mute">{x.created_by || ''}</span>
                  <div className="md-spacer" />
                  <button className="btn-ghost sm" onClick={() => copyIssued(x)}>
                    {copiedId === x.id ? '복사됨' : '링크 복사'}
                  </button>
                  <button className="btn-ghost sm danger" onClick={() => revoke(x.id)}>회수</button>
                </div>
                <div className="shr-issued-body">
                  <label>
                    링크
                    <input readOnly value={shareUrl(x.token)} onFocus={e => e.target.select()} />
                  </label>
                  <label className="shr-issued-pw">
                    비밀번호
                    <input readOnly value={x.pw || '없음'} onFocus={e => e.target.select()} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
