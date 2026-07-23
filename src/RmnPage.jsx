import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RMN_PRODUCTS, RMN_AGENCIES, RMN_STATUS, rmnProduct, rmnColor, statusIdx, nextStatus,
  slotAvailability, pushAvailability, canTentative, buildRmnNotices,
  applyDiscount, netAmount, fmtWon,
  groupCampaigns, campaignOn, periodDays, priceWeeks, PRICE_DAYS, bookingQty,
  INSTA_PRODUCTS, INSTA_FORMATS, instaPrice, kakaoPrice,
} from './data/rmn.js'
import { listRmn, createRmn, updateRmn, deleteRmn } from './lib/rmnStore.js'
import { buildOrderXlsx, buildProposalXlsx, DOC_NAME, DOC_ORDER } from './lib/rmnDocs.js'
import { toISO, fromISO } from './lib/parse.js'
import { HOLIDAYS } from './data/holidays.js'

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
            <div className="rmn-nt">가부킹 → 부킹 전환 필요 <small>집행 시작 3개월 이내 진입</small></div>
            {notices.tentative.map(b => (
              <div key={b.id} className="rmn-nrow">
                <Ini id={b.product} />
                <span className="rmn-nttl">{b.advertiser} — {b.product} · {fmtRange(b)}</span>
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
                <span className="rmn-nttl">{b.advertiser} — {b.product} · {fmtRange(b)} · 현재 [{b.status}]</span>
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
        <small className="mute">상품 1~4개 · 예상 지표는 기준값(rmnAgencies.js) 기반, 팝업·헤드라인·이벤트 메뉴는 "-"</small>
        <button className="btn-solid sm" disabled={!valid} onClick={make}>제안서 다운로드</button>
      </div>
      {msg && <div className="adm-msg">{msg}</div>}
      </div>
    </details>
  )
}

/* ── 정산 요약 ('26.7 2차) — 시작월 기준 집계. 미수금 = 취소 제외, "입금 확인" 전 상태의 입금가 ── */
function SettleSummary({ bookings }) {
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

  if (rows.length === 0) return null
  const sum = k => rows.reduce((a, r) => a + r[k], 0)
  return (
    <>
      <div className="group-label">정산 요약 <small className="adm-count">시작월 기준 · 미수금 = 입금 확인 전</small></div>
      <div className="mon-scroll">
        <table className="mon-table adm-table">
          <thead><tr><th>월</th><th>건수</th><th>총광고비</th><th>입금가</th><th>미수금</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.ym}>
                <td className="mon-acc">{r.ym.replace('-', '.')}</td>
                <td className="mute">{r.cnt}건</td>
                <td>{fmtWon(r.total)}</td>
                <td>{fmtWon(r.net)}</td>
                <td className={r.unpaid > 0 ? 'strong' : 'mute'}>{r.unpaid > 0 ? fmtWon(r.unpaid) : '—'}</td>
              </tr>
            ))}
            <tr className="rmn-sum">
              <td className="mon-acc">합계</td>
              <td className="mute">{sum('cnt')}건</td>
              <td className="strong">{fmtWon(sum('total'))}</td>
              <td className="strong">{fmtWon(sum('net'))}</td>
              <td className={sum('unpaid') > 0 ? 'strong' : 'mute'}>{sum('unpaid') > 0 ? fmtWon(sum('unpaid')) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ── 진행 중 캠페인 행 ('26.7) — [광고주+캠페인명] 헤더, 펼치면 세부 상품 ── */
function CampaignRow({ g, open, onToggle, editId, confirmDel, onAdvance, onSetStatus, onOrder, onItemStatus, onEdit, onDel, onItemAdvance }) {
  const prods = g.items.map(b => b.product + (bookingQty(b) > 1 ? `×${bookingQty(b)}` : ''))
  return (
    <div className={'rmn-camp-row' + (open ? ' open' : '')}>
      <div className="rmn-camp-head" onClick={onToggle}>
        <span className="rmn-camp-dots">{[...new Set(g.items.map(b => b.product))].slice(0, 4).map(p => <Dot key={p} id={p} />)}</span>
        <span className="rmn-camp-name">
          <b>{g.advertiser}</b>{g.campaign ? <span className="mute"> · {g.campaign}</span> : ''}
          {g.status === '가부킹' && <span className="rmn-gtag">가부킹</span>}
        </span>
        <span className="rmn-camp-meta">{fmtD(g.start)} ~ {fmtD(g.end)} · {g.items.length}개 상품 · {fmtWon(g.total)}</span>
        <span className="rmn-camp-chev" aria-hidden>{open ? '▾' : '▸'}</span>
      </div>
      <div className="rmn-camp-sub mute">{prods.join(' · ')}</div>
      <div className="rmn-camp-ctl">
        <select className="rmn-status" value={g.mixed ? '' : g.status} onChange={e => e.target.value && onSetStatus(e.target.value)}
          title={g.mixed ? '상품별 상태가 다름 — 선택 시 전체 통일' : '캠페인 전체 상태'}>
          {g.mixed && <option value="">상태 혼합…</option>}
          {RMN_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn-ghost sm" onClick={onAdvance}>다음 → <small className="mute">{nextStatus(g.status)}</small></button>
        <button className="btn-ghost sm" onClick={onOrder}>청약서</button>
      </div>
      {open && (
        <div className="rmn-camp-items">
          {g.items.map(b => {
            const split = !b.actual_price && g.items.some(x => x.product === b.product && x.actual_price > 0)
            return (
            <div key={b.id} className={'rmn-item' + (editId === b.id ? ' sel' : '')}>
              <span className="rmn-item-p"><Ini id={b.product} /> {b.product}{bookingQty(b) > 1 ? ` ×${bookingQty(b)}` : ''}{b.push_qty ? ` ${(b.push_qty / 10000).toLocaleString('ko-KR')}만` : ''}{b.option ? <small className="mute"> · {b.option}</small> : ''}</span>
              <span className="mute rmn-item-d">{b.send_at ? `${fmtD(b.send_at)} ${b.send_at.slice(11, 16)}` : fmtRange(b)}</span>
              <span className="rmn-item-w">{split ? <span className="mute">분할 집행</span> : fmtWon(b.actual_price)}</span>
              <select className="rmn-status" value={b.status} onChange={e => onItemStatus(b, e.target.value)}>
                {RMN_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="취소">취소</option>
              </select>
              <button className="btn-ghost sm" onClick={() => onEdit(b)}>수정</button>
              <button className={'btn-ghost sm danger' + (confirmDel === b.id ? ' arm' : '')} onClick={() => onDel(b.id)}>
                {confirmDel === b.id ? '한 번 더' : '삭제'}
              </button>
            </div>
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
        <div className="md-ch">{g.advertiser}{g.campaign ? ` · ${g.campaign}` : ''}</div>
        <div className="mute" style={{ marginBottom: 10 }}>{fmtD(g.start)} ~ {fmtD(g.end)} · {g.items.length}개 상품 · {fmtWon(g.total)}</div>
        {g.items.map(b => (
          <button key={b.id} className="rmn-pick-item" onClick={() => onEdit(b)}>
            <Ini id={b.product} />
            <span className="rmn-pick-t">{b.product}{bookingQty(b) > 1 ? ` ×${bookingQty(b)}` : ''}</span>
            <span className="mute">{b.send_at ? `${fmtD(b.send_at)} ${b.send_at.slice(11, 16)}` : fmtRange(b)} · [{b.status}]</span>
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
                  title={`${g.advertiser}${g.campaign ? ' · ' + g.campaign : ''} — ${productsOn(g, c.iso).join('·')} [${g.status}]`}>
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
        <span className="mute">· (가) = 가부킹</span>
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
      if (insta) row.option = `${L.insta_prod} · ${L.insta_fmt}`
      return row
    }
    try {
      if (editId) { await updateRmn(editId, rowOf(f.product)); setMsg(`"${shared.advertiser}" 수정됨`) }
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
        const label = products.map(id => { const c = calcOf(id); return c.qty > 1 ? `${id}×${c.qty}` : id }).join('·')
        setMsg(`"${shared.advertiser}" ${shared.status} ${n}건 등록됨${products.length > 1 ? ` (${label})` : ''}`)
      }
      setF(EMPTY); setEditId(null); setOrigQty(1); setSel(['메인배너']); setLines({ 메인배너: defaultLine() })
      setCamp({ start: todayISO(), end: addDaysISO(todayISO(), PRICE_DAYS - 1) })
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  const startEdit = b => {
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
  const del = async id => {
    if (confirmDel !== id) { setConfirmDel(id); return }
    setConfirmDel(null)
    try { await deleteRmn(id); setMsg('삭제됨'); refresh() } catch (e) { setMsg(e.message) }
  }

  /* 캠페인 그룹핑 ('26.7) — [광고주+캠페인명] 기준. 진행중 = 미완료 캠페인 / 완료·취소 별도 */
  const campaigns = useMemo(() => groupCampaigns(bookings), [bookings])
  const activeCamps = campaigns.filter(g => !g.done)
  const doneCamps = campaigns.filter(g => g.done)
  const canceled = bookings.filter(b => b.status === '취소')

  /* 상태 일괄 — 캠페인 전체 상품을 함께 진행 (취소 건 제외) */
  const setCampaignStatus = async (g, s) => {
    try {
      await Promise.all(g.items.filter(b => b.status !== '취소').map(b => updateRmn(b.id, { status: s })))
      refresh()
    } catch (e) { setMsg(e.message) }
  }

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
        <div className="eyebrow">Media Content Team · Retail Media Network</div>
        <h1>RMN</h1>
        <div className="masthead-sub">
          현대백화점 APP 광고 판매 — 부킹·재고·정산 관리 (팀 내부 전용 · 노출/클릭 리포트는 GA 연동 후)
        </div>
      </header>

      {rows === undefined && <div className="empty">불러오는 중…</div>}
      {rows === null && (
        <div className="mon-note">
          RMN 테이블이 아직 없습니다 — Supabase SQL Editor에서 <b>data/rmn-setup.sql</b>을
          1회 실행하면 사용 가능합니다 (절차: supabase-setup.md 8장)
        </div>
      )}

      {Array.isArray(rows) && (
        <>
          {/* ── 부킹 캘린더 ('26.7 최상단 이동) — 캠페인 칩, 클릭 시 상품 시트 ── */}
          <div className="group-label">부킹 캘린더 <small className="adm-count">칩 = 광고주·캠페인 · 클릭 시 상품</small></div>
          <RmnMonth campaigns={campaigns} onPick={setPickGroup} />

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
                <span className="rmn-cp-note mute">구좌 상품 기간 일괄 적용 · 상품별로 다르면 아래 라인에서 개별 변경</span>
              </div>
            )}

            {/* 상품 선택 토글 — 폼 안 ('26.7: 별도 섹션에서 신규 부킹 안으로 통합) */}
            <div className="rmn-avail rmn-avail-in">
              {RMN_PRODUCTS.map(pr => {
                const on = products.includes(pr.id)
                const sub = pr.insta ? '게시형 · 구성 4종'
                  : pr.msg ? '발송형 (건당 100원 · 타겟팅 +10%)'
                  : pr.push ? '발송형 (건당 50원)'
                  : `구좌 ${pr.slots}개 · ${fmtWon(pr.price)}/7일`
                return (
                  <button key={pr.id} type="button" className={'rmn-slot' + (on ? ' on' : '')}
                    disabled={editId && !on} onClick={() => toggleSel(pr.id)}>
                    <b>{pr.id}</b>
                    <span>{sub}</span>
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
                              : <span className="mute">캠페인 기간 적용 중 — 날짜를 바꾸면 이 상품만 개별 기간</span>}
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
                              집행 <b>{c.days}일</b>{L.segs.length ? <span className="mute"> (분할 {L.segs.length + 1}회)</span> : ''} ·
                              과금 <b>{c.weeks}주({c.weeks * PRICE_DAYS}일 기준)</b> — 잔여 <b>{c.weeks * PRICE_DAYS - c.days}일</b>을
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
                      <label>할인율 % <small className="mute">↔ 실판가 자동</small><input inputMode="decimal" value={L.discount}
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
                <b>{soldOutIds.join('·')}</b> 구좌가 해당 기간에 마감되었습니다 — 기간·수량을 조정하세요
              </div>
            )}

            {/* ── 합산 ('26.7) — 상품별 가격을 마지막에 합쳐서 + 상품별 최종 할인율 병기 ── */}
            <div className="rmn-sumbar">
              <div><span>총 공시가</span><b>{fmtWon(totalList)}</b></div>
              <div>
                <span>총 광고비 (실판가 합)</span><b>{fmtWon(totalActual)}</b>
                <small className="rmn-sum-disc">총 할인율 {totalRate}%</small>
              </div>
              <div><span>입금가{f.agency ? ' · 수수료 30% 차감' : ''}</span><b className={f.agency ? 'rmn-net' : ''}>{fmtWon(deposit)}</b></div>
            </div>

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
                  <option value="가부킹" disabled={!tentativeOK}>가부킹{!tentativeOK ? ' (시작 3개월 이내 — 불가)' : ''}</option>
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
              placeholder="사업자등록번호·주소는 판매사 연동값 확보 후 자동 입력 예정" /></label>
            <div className="adm-actions">
              {missing.length > 0 && (
                <span className="rmn-missing">미입력: {missing.map(m => m.label).join(' · ')}</span>
              )}
              {soldOut && missing.length === 0 && (
                <span className="rmn-missing">{soldOutIds.join('·')} 구좌 마감 — 기간·수량 조정</span>
              )}
              {editId && <button className="btn-ghost sm" onClick={() => { setF(EMPTY); setEditId(null); setOrigQty(1); setSel(['메인배너']); setLines({ 메인배너: defaultLine() }); setCamp({ start: todayISO(), end: addDaysISO(todayISO(), PRICE_DAYS - 1) }) }}>수정 취소</button>}
              <button className="btn-solid sm" disabled={!valid} onClick={submit}>
                {editId ? '수정 저장' : products.length > 1 ? `${products.length}건 동시 부킹` : '부킹 등록'}
              </button>
            </div>
            {msg && <div className="adm-msg">{msg}</div>}
          </div>

          {/* ── 진행 중 캠페인 ('26.7 — [광고주+캠페인명] 그룹, 클릭 시 세부 상품 펼침) ── */}
          <div className="group-label">진행 중 <small className="adm-count">{activeCamps.length}캠페인 · {activeCamps.reduce((a, g) => a + g.items.length, 0)}건</small></div>
          <div className="rmn-camps">
            {activeCamps.length === 0 && <div className="mute rmn-empty">진행 중인 캠페인이 없습니다</div>}
            {activeCamps.map(g => (
              <CampaignRow key={g.key} g={g} open={expanded === g.key}
                onToggle={() => setExpanded(x => x === g.key ? null : g.key)}
                editId={editId} confirmDel={confirmDel}
                onAdvance={() => setCampaignStatus(g, nextStatus(g.status))}
                onSetStatus={s => setCampaignStatus(g, s)}
                onOrder={() => makeOrderGroup(g)}
                onItemStatus={setStatus} onEdit={startEdit} onDel={del} onItemAdvance={b => setStatus(b, nextStatus(b.status))} />
            ))}
          </div>

          {/* ── 캠페인 제안서 만들기 ('26.7 3차 — 접힘, 기존 동선 불변) ── */}
          <ProposalMaker />

          {/* ── 정산 요약 ('26.7 2차) — 월별 총광고비·입금가·미수금(입금 확인 전) ── */}
          <SettleSummary bookings={bookings} />

          {(doneCamps.length > 0 || canceled.length > 0) && (
            <details className="ta-office">
              <summary><span className="ta-name">완료·취소</span><span className="ta-cnt">{doneCamps.length + canceled.length}건</span></summary>
              <div className="mon-scroll">
                <table className="mon-table adm-table">
                  <tbody>
                    {doneCamps.map(g => (
                      <tr key={g.key}>
                        <td className="mon-acc">{g.advertiser}{g.campaign ? <small className="mute"> · {g.campaign}</small> : ''}</td>
                        <td className="mute">{g.items.map(b => b.product).join('·')}</td>
                        <td className="mute">{fmtD(g.start)} ~ {fmtD(g.end)}</td>
                        <td>{fmtWon(g.total)}</td>
                        <td className="mute">완료</td>
                        <td><button className="btn-ghost sm" onClick={() => makeOrderGroup(g)}>청약서</button></td>
                      </tr>
                    ))}
                    {canceled.map(b => (
                      <tr key={b.id}>
                        <td className="mon-acc">{b.advertiser}{b.campaign ? <small className="mute"> · {b.campaign}</small> : ''}</td>
                        <td className="mute">{b.product}</td>
                        <td className="mute">{fmtRange(b)}</td>
                        <td>{fmtWon(b.actual_price)}</td>
                        <td className="mute">취소</td>
                        <td><button className="btn-ghost sm" onClick={() => startEdit(b)}>수정</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {pickGroup && <CampaignPicker g={pickGroup} onEdit={startEdit} onOrder={() => makeOrderGroup(pickGroup)} onClose={() => setPickGroup(null)} />}

      {notices && <RmnNotice notices={notices} onClose={closeNotice}
        onConvert={async b => { await setStatus(b, '부킹'); setNotices(n => ({ ...n, tentative: n.tentative.filter(x => x.id !== b.id) })) }} />}
    </div>
  )
}
