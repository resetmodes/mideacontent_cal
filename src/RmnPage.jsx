import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RMN_PRODUCTS, RMN_AGENCIES, RMN_STATUS, rmnProduct, rmnColor, statusIdx, nextStatus,
  slotAvailability, pushAvailability, canTentative, buildRmnNotices,
  rmnListPrice, applyDiscount, netAmount, fmtWon,
  groupCampaigns, campaignOn, periodDays, PRICE_DAYS, bookingQty,
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

const EMPTY = {
  advertiser: '', campaign: '', product: '메인배너', qty: 1,
  start_date: todayISO(), end_date: addDaysISO(todayISO(), 6), send_date: '', send_time: '10:00', push_units: 1,
  discount_rate: '', actual_price: '', agency: '', agency_manager: '', agency_phone: '', agency_email: '',
  status: '부킹', memo: '',
}
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
              <span className="rmn-item-p"><Ini id={b.product} /> {b.product}{bookingQty(b) > 1 ? ` ×${bookingQty(b)}` : ''}{b.push_qty ? ` ${(b.push_qty / 10000).toLocaleString('ko-KR')}만` : ''}</span>
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
  const [manualPrice, setManualPrice] = useState(false)
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

  /* 다중 상품 선택 ('26.7 — 묶음 판매): 신규 = 여러 상품 토글, 수정 = 단일(1건=1상품 모델 불변) */
  const [sel, setSel] = useState(['메인배너'])
  const [qtys, setQtys] = useState({})   // 신규: 상품별 수량 {상품: n}
  const [extraSegs, setExtraSegs] = useState([])   // 분할 집행: 추가 일정 [{start,end}] (신규·구좌 상품만)
  const products = editId ? [f.product] : sel
  const toggleSel = id => setSel(prev =>
    prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id])
  /* 상품별 수량 ('26.7 — 같은 상품 N개 구매). 푸쉬는 발송량으로 관리하므로 항상 1 */
  const qtyOf = id => {
    if (rmnProduct(id)?.push) return 1
    return Math.max(1, Number(editId ? f.qty : qtys[id]) || 1)
  }
  const setQty = (id, n) => {
    const max = rmnProduct(id)?.slots || 1
    const v = Math.min(max, Math.max(1, Number(n) || 1))
    if (editId) set('qty', v)
    else setQtys(prev => ({ ...prev, [id]: v }))
  }
  const hasPush = products.includes('푸쉬')
  const hasSlot = products.some(id => !rmnProduct(id)?.push)
  const isPush = hasPush && !hasSlot   // 푸쉬만 선택 (기간 필드 숨김)
  const rangeEnd = f.end_date || f.start_date
  /* 분할 집행 ('26.7): 기본 기간 + 추가 일정 세그먼트. 총 일수가 7일 기준 대비 얼마인지 체크 */
  const validSegs = editId ? [] : extraSegs.filter(s => s.start && (!s.end || s.end >= s.start))
  const segRanges = [{ s: f.start_date, e: rangeEnd }, ...validSegs.map(s => ({ s: s.start, e: s.end || s.start }))]
  const primaryDays = periodDays(f.start_date, rangeEnd)
  const totalDays = primaryDays + validSegs.reduce((a, s) => a + periodDays(s.start, s.end || s.start), 0)
  const daysOff = hasSlot && totalDays !== PRICE_DAYS   // 7일 기준과 다름
  const remainDays = Math.max(1, PRICE_DAYS - totalDays)
  const lastEnd = segRanges.map(r => r.e).filter(Boolean).sort().at(-1) || f.start_date
  const addSeg = () => setExtraSegs(prev => [...prev, { start: addDaysISO(lastEnd, 1), end: addDaysISO(lastEnd, remainDays) }])
  const setSeg = (i, k, v) => setExtraSegs(prev => prev.map((s, j) => j === i ? { ...s, [k]: v } : s))
  const rmSeg = i => setExtraSegs(prev => prev.filter((_, j) => j !== i))
  const segsComplete = validSegs.length === extraSegs.length   // 미완성 세그먼트 없음

  /* 재고: 폼의 기간 기준 상품별 잔여 (수정 중이면 자기 자신 제외) */
  const avail = useMemo(() => {
    const out = {}
    for (const pr of RMN_PRODUCTS) {
      if (pr.push) out[pr.id] = f.send_date ? pushAvailability(bookings, f.send_date, editId) : null
      else out[pr.id] = slotAvailability(bookings, pr.id, f.start_date, rangeEnd, editId)
    }
    return out
  }, [bookings, f.start_date, rangeEnd, f.send_date, editId])

  /* 가격 자동 계산 — 선택 상품 × 수량 합. 실판가 직접 수정(수동)은 단일 상품일 때만 */
  const perPrice = id => rmnListPrice(id, Number(f.push_units) || 1)
  const listPrice = products.reduce((a, id) => a + perPrice(id) * qtyOf(id), 0)
  const autoActual = products.reduce((a, id) => a + applyDiscount(perPrice(id), f.discount_rate) * qtyOf(id), 0)
  const canManual = products.length === 1
  const total = canManual && manualPrice && f.actual_price !== '' ? Number(String(f.actual_price).replace(/,/g, '')) || 0 : autoActual
  const deposit = netAmount(total, !!f.agency)

  const firstStart = [hasSlot ? f.start_date : null, hasPush ? f.send_date : null].filter(Boolean).sort()[0] || f.start_date
  const tentativeOK = canTentative(firstStart, todayISO())
  /* 선택 상품 중 (수량 기준) 마감된 것 — 분할 시 모든 세그먼트에서 잔여 확인 */
  const soldOutIds = products.filter(id => {
    if (rmnProduct(id)?.push) {
      const a = avail[id]
      return a ? (Number(f.push_units) || 1) * 50_000 > a.left : false
    }
    const q = qtyOf(id)
    return segRanges.some(r => {
      const a = slotAvailability(bookings, id, r.s, r.e, editId)
      return a && q > a.left
    })
  })
  const soldOut = soldOutIds.length > 0

  const valid = f.advertiser.trim() && products.length >= 1 &&
    (!hasSlot || f.start_date) && (!hasPush || (f.send_date && f.send_time)) && !soldOut && segsComplete

  const submit = async () => {
    if (!valid) return
    const shared = {
      advertiser: f.advertiser.trim(), campaign: f.campaign.trim(),
      discount_rate: Number(f.discount_rate) || 0,
      agency: f.agency === '직접입력' ? (f.agency_custom || '').trim() || '기타' : f.agency,
      agency_manager: f.agency_manager, agency_phone: f.agency_phone, agency_email: f.agency_email,
      status: f.status, memo: f.memo.trim(),
    }
    /* seg = {s,e} 집행 세그먼트. isPrimary=false면 분할 이어짐 행(단가는 7일 기준 1회분이라
       추가 세그먼트는 금액 0, 재고만 점유) */
    const rowOf = (id, seg, isPrimary = true) => {
      const pr = rmnProduct(id)
      const push = !!pr?.push
      const q = qtyOf(id)
      const lp = isPrimary ? perPrice(id) * q : 0
      const actual = !isPrimary ? 0 : (canManual ? total : applyDiscount(perPrice(id), f.discount_rate) * q)
      const row = {
        ...shared, product: id,
        start_date: push ? f.send_date : seg.s,
        end_date: push ? f.send_date : (seg.e || null),
        send_at: push ? `${f.send_date}T${f.send_time}:00+09:00` : null,
        push_qty: push ? (Number(f.push_units) || 1) * pr.unitSize : null,
        list_price: lp, actual_price: actual, net_amount: netAmount(actual, !!shared.agency),
      }
      /* qty: 값 있을 때만 전송(컬럼 미설정 하위호환). 수정으로 1까지 낮추는 경우도
         원본이 >1이면 컬럼이 이미 존재하므로 명시 전송해 갱신 */
      if (q > 1 || (editId && origQty > 1)) row.qty = q
      return row
    }
    try {
      if (editId) { await updateRmn(editId, rowOf(f.product, { s: f.start_date, e: f.end_date || null })); setMsg(`"${shared.advertiser}" 수정됨`) }
      else {
        let n = 0
        for (const id of products) {
          if (rmnProduct(id)?.push) { await createRmn(rowOf(id, { s: f.send_date, e: f.send_date })); n++ }
          else {
            await createRmn(rowOf(id, { s: f.start_date, e: f.end_date || null }, true)); n++
            for (const s of validSegs) { await createRmn(rowOf(id, { s: s.start, e: s.end || s.start }, false)); n++ }
          }
        }
        const label = products.map(id => qtyOf(id) > 1 ? `${id}×${qtyOf(id)}` : id).join('·')
        const splitNote = validSegs.length ? ` · 분할 ${validSegs.length + 1}회` : ''
        setMsg(`"${shared.advertiser}" ${shared.status} ${n}건 등록됨${products.length > 1 ? ` (${label})` : ''}${splitNote}`)
      }
      setF(EMPTY); setEditId(null); setOrigQty(1); setManualPrice(false); setSel(['메인배너']); setQtys({}); setExtraSegs([])
      refresh()
    } catch (e) { setMsg(e.message) }
  }

  const startEdit = b => {
    setEditId(b.id)
    setOrigQty(bookingQty(b))
    setManualPrice(true)
    setPickGroup(null)
    setExtraSegs([])
    setF({
      advertiser: b.advertiser, campaign: b.campaign || '', product: b.product, qty: bookingQty(b),
      start_date: b.start_date, end_date: b.end_date || '',
      send_date: (b.send_at || '').slice(0, 10), send_time: (b.send_at || 'T10:00').slice(11, 16) || '10:00',
      push_units: b.push_qty ? Math.round(b.push_qty / 50000) : 1,
      discount_rate: b.discount_rate || '', actual_price: b.actual_price || '',
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
          {/* ── 판매 가능 구좌 (선택 기간 기준) — 신규는 다중 토글(묶음 판매), 수정은 단일 ── */}
          <div className="group-label">판매 가능 구좌 <small className="adm-count">{fmtD(f.start_date)}{f.end_date ? ` ~ ${fmtD(f.end_date)}` : ''} 기준{!editId && products.length > 1 ? ` · ${products.length}개 상품 묶음` : ''}</small></div>
          <div className="rmn-avail">
            {RMN_PRODUCTS.map(pr => {
              const a = avail[pr.id]
              const on = products.includes(pr.id)
              const pick = () => editId ? set('product', pr.id) : toggleSel(pr.id)
              if (pr.push) {
                return (
                  <button key={pr.id} className={'rmn-slot' + (on ? ' on' : '')} onClick={pick}>
                    <b>{pr.id}</b>
                    <span>{a ? `잔여 ${a.left.toLocaleString('ko-KR')}건` : '발송일 선택 시 표시'}</span>
                  </button>
                )
              }
              const full = a && a.left <= 0
              return (
                <button key={pr.id} className={'rmn-slot' + (on ? ' on' : '') + (full ? ' full' : '')} onClick={pick}>
                  <b>{pr.id}{qtyOf(pr.id) > 1 ? ` ×${qtyOf(pr.id)}` : ''}</b>
                  <span>{full ? '마감' : `잔여 ${a.left}/${a.total}`}</span>
                </button>
              )
            })}
          </div>

          {/* ── 선택 상품 수량 ('26.7 — 같은 상품 N개 구매, 구좌 2개 이상 상품만) ── */}
          {products.some(id => (rmnProduct(id)?.slots || 1) > 1) && (
            <div className="rmn-qtys">
              {products.filter(id => (rmnProduct(id)?.slots || 1) > 1).map(id => {
                const a = avail[id]
                const q = qtyOf(id)
                const max = Math.min(rmnProduct(id).slots, (a ? a.left : rmnProduct(id).slots))
                return (
                  <div key={id} className="rmn-qty">
                    <span className="rmn-qty-name"><Ini id={id} /> {id}</span>
                    <div className="rmn-step">
                      <button type="button" onClick={() => setQty(id, q - 1)} disabled={q <= 1} aria-label="수량 감소">−</button>
                      <b>{q}</b>
                      <button type="button" onClick={() => setQty(id, q + 1)} disabled={q >= max} aria-label="수량 증가">＋</button>
                    </div>
                    <span className="mute rmn-qty-hint">개 · 잔여 {a ? a.left : rmnProduct(id).slots}/{rmnProduct(id).slots}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 부킹 등록 폼 ── */}
          <div className="group-label">{editId ? '부킹 수정' : '신규 부킹'}</div>
          <div className="adm-taform">
            <div className="adm-row">
              <label className="wide">광고주명 *<input value={f.advertiser} onChange={e => set('advertiser', e.target.value)} placeholder="예: 샤넬" /></label>
              <label className="wide">캠페인명<input value={f.campaign} onChange={e => set('campaign', e.target.value)} placeholder="예: 홀리데이 캠페인" /></label>
            </div>
            <div className="adm-row">
              {hasSlot && <label>시작일 *<input type="date" value={f.start_date}
                onChange={e => { const v = e.target.value; set('start_date', v); if (v && (!f.end_date || f.end_date < v)) set('end_date', addDaysISO(v, PRICE_DAYS - 1)) }} /></label>}
              {hasSlot && <label>종료일<input type="date" value={f.end_date} onChange={e => set('end_date', e.target.value)} /></label>}
              {hasPush && <label>{hasSlot ? '푸시 ' : ''}발송 일자 *<input type="date" value={f.send_date} onChange={e => { set('send_date', e.target.value); if (!hasSlot) set('start_date', e.target.value) }} /></label>}
              {hasPush && <label>발송 시간 *<input type="time" value={f.send_time} onChange={e => set('send_time', e.target.value)} /></label>}
              {hasPush && (
                <label>발송량 (5만 단위)
                  <select value={f.push_units} onChange={e => set('push_units', e.target.value)}>
                    {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{(n * 5).toLocaleString('ko-KR')}만 건</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {hasSlot && f.start_date && (
              <div className={'rmn-days' + (daysOff ? ' off' : '')}>
                <div className="rmn-days-line">
                  집행 기간 <b>{totalDays}일</b>{validSegs.length ? <span className="mute"> (분할 {validSegs.length + 1}회)</span> : ''}
                  {daysOff
                    ? <> · 단가는 <b>7일 기준</b>입니다.
                        {totalDays < PRICE_DAYS
                          ? <> 잔여 <b>{PRICE_DAYS - totalDays}일</b>을 나눠 넣으려면
                              <button type="button" className="rmn-snap" onClick={addSeg}>＋ 추가 일정 선택</button>
                              {!editId && extraSegs.length === 0 && <button type="button" className="rmn-snap ghost" onClick={() => set('end_date', addDaysISO(f.start_date, PRICE_DAYS - 1))}>7일 연속으로</button>}</>
                          : ' 의도한 기간인지 확인하세요'}
                      </>
                    : ' · 7일 기준 ✓'}
                </div>
                {extraSegs.map((s, i) => (
                  <div key={i} className="rmn-seg">
                    <span className="rmn-seg-lbl">추가 일정 {i + 2}회차</span>
                    <input type="date" value={s.start} onChange={e => { const v = e.target.value; setSeg(i, 'start', v); if (v && (!s.end || s.end < v)) setSeg(i, 'end', v) }} />
                    <span className="rmn-seg-til">~</span>
                    <input type="date" value={s.end} min={s.start} onChange={e => setSeg(i, 'end', e.target.value)} />
                    <span className="mute">{s.start ? `${periodDays(s.start, s.end || s.start)}일` : ''}</span>
                    <button type="button" className="rmn-seg-x" onClick={() => rmSeg(i)} aria-label="추가 일정 삭제">삭제</button>
                  </div>
                ))}
              </div>
            )}
            {soldOut && (
              <div className="rmn-soldout">
                이 기간 <b>{soldOutIds.join('·')}</b> 구좌가 마감되었습니다 — 다른 기간을 선택하거나 잔여 수량을 확인하세요
              </div>
            )}
            <div className="adm-row">
              <label>공시가<input value={listPrice.toLocaleString('ko-KR')} readOnly className="rmn-ro" /></label>
              <label>할인율 %<input inputMode="numeric" value={f.discount_rate}
                onChange={e => { set('discount_rate', e.target.value); setManualPrice(false) }} placeholder="0" /></label>
              <label>실판가 (총광고비){!canManual ? ' — 상품별 자동' : ''}<input inputMode="numeric"
                readOnly={!canManual} className={!canManual ? 'rmn-ro' : ''}
                value={canManual && manualPrice && f.actual_price !== '' ? f.actual_price : total.toLocaleString('ko-KR')}
                onChange={e => { if (!canManual) return; setManualPrice(true); set('actual_price', e.target.value) }} /></label>
              <label>입금가{f.agency ? ' (수수료 30% 차감)' : ''}
                <input value={deposit.toLocaleString('ko-KR')} readOnly className={'rmn-ro' + (f.agency ? ' rmn-net' : '')} />
              </label>
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
              {editId && <button className="btn-ghost sm" onClick={() => { setF(EMPTY); setEditId(null); setOrigQty(1); setManualPrice(false); setExtraSegs([]) }}>수정 취소</button>}
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

          {/* ── 월간 캘린더 ('26.7 — 캠페인 칩, 클릭 시 상품 시트) ── */}
          <div className="group-label">부킹 캘린더 <small className="adm-count">칩 = 광고주·캠페인 · 클릭 시 상품</small></div>
          <RmnMonth campaigns={campaigns} onPick={setPickGroup} />

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
