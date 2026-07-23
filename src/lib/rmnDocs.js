/* RMN 문서 생성 ('26.7) — 청약서·캠페인 제안서 xlsx 자동 작성.
   ─ 템플릿: public/templates/rmn-*.xlsx (실데이터 소거본 — 값은 다운로드 시점에 브라우저에서 채움)
   ─ ExcelJS는 동적 import (별도 청크 — 버튼 누를 때만 로드, 초기 번들 무영향)
   ─ 셀 좌표는 원본 양식 고정 좌표 (양식 개정 시 여기 좌표만 갱신)
   ─ 결과보고서(부쉐론 양식)는 GA 데이터 필요 — scripts/rmn/build-report.mjs (파이프라인, 3차) */
import { rmnProduct } from '../data/rmn.js'
import { RMN_AGENCY_INFO, HD_TAX_EMAIL, RMN_BENCH } from '../data/rmnAgencies.js'

/* 청약서·제안서의 상품 표기 (양식 표기 ≠ 시스템 id) */
export const DOC_NAME = {
  '스플래시': '앱 스플래시', '메인배너': '앱 메인 배너', '하단배너': '앱 하단 배너',
  '팝업배너': '앱 오픈 팝업', '헤드라인 뉴스': '앱 헤드라인 뉴스', '이벤트 메뉴': '앱 이벤트 메뉴',
  '푸쉬': '앱 푸시 발송', '카카오톡': '카카오톡 메시지 발송', '인스타그램': '인스타그램 게시',
}
/* 청약서·제안서의 상품 나열 순서 (원본 양식 관례 — 구좌 상품 먼저, 발송·게시형은 그 뒤) */
export const DOC_ORDER = ['스플래시', '메인배너', '하단배너', '푸쉬', '팝업배너', '헤드라인 뉴스', '이벤트 메뉴', '카카오톡', '인스타그램']

const comma = n => Math.round(n).toLocaleString('ko-KR')
const d2 = iso => `${iso.slice(2, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}`
const periodText = (s, e) => (!e || e === s) ? d2(s)
  : `${d2(s)} - ${s.slice(0, 7) === e.slice(0, 7) ? e.slice(5).replace('-', '.') : d2(e)}`
const dayCount = (s, e) => Math.round((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000) + 1

async function loadWb(name) {
  const ExcelJS = (await import('exceljs')).default
  const res = await fetch(`${import.meta.env.BASE_URL}templates/${name}`)
  if (!res.ok) throw new Error(`템플릿 로드 실패: ${name} (${res.status})`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await res.arrayBuffer())
  return wb
}

async function downloadWb(wb, filename) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/* ── 청약서 — 같은 광고주·기간의 부킹 묶음(≤6행)으로 1장 생성 ── */
export async function buildOrderXlsx(group, todayISO) {
  if (!group.length) throw new Error('청약서에 담을 부킹이 없습니다')
  if (group.length > 6) throw new Error('청약서 상품 행은 최대 6개 — 기간을 나눠 생성해 주세요')
  const wb = await loadWb('rmn-order.xlsx')
  const ws = wb.getWorksheet('청약서')
  const set = (a, v, fmt) => { const c = ws.getCell(a); c.value = v ?? ''; if (fmt) c.numFmt = fmt }

  const b0 = group[0]
  const agencyName = b0.agency || ''
  const info = RMN_AGENCY_INFO[agencyName] || { corp: agencyName, bizno: '', addr: '' }
  const contact = group.find(b => b.agency_manager || b.agency_phone || b.agency_email) || b0

  set('N8', info.corp || '직접 계약')
  set('AT8', info.bizno)
  set('N10', info.addr)
  set('AT10', contact.agency_manager || '')
  set('N12', contact.agency_phone || '')
  set('AT12', contact.agency_email || '')
  set('N17', '현대백화점 APP')
  set('AT17', b0.campaign || `${b0.advertiser} 캠페인`)

  let total = 0, net = 0
  group.forEach((b, i) => {
    const r = 21 + i
    const p = rmnProduct(b.product)
    set(`O${r}`, DOC_NAME[b.product] || b.product)
    if (b.push_qty) set(`Y${r}`, `${comma(b.push_qty / 10000)}만명, 1회 발송`)
    else set(`Y${r}`, `${dayCount(b.start_date, b.end_date || b.start_date)}일${p?.slots ? (p.slots === 1 ? ', 단독 운영' : `, ${p.slots}구좌 중 1구좌`) : ''}`)
    set(`AI${r}`, b.send_at ? `${d2(b.start_date)} (${b.send_at.slice(11, 16)} 발송)` : periodText(b.start_date, b.end_date))
    set(`AS${r}`, b.actual_price || 0, '#,##0')
    total += b.actual_price || 0
    net += b.net_amount || 0
  })
  set('AS27', total, '#,##0')

  const money = `${comma(total)}원\n(${comma(net)}원)`
  set('N30', money)
  set('AT30', money)

  const end = group.map(b => b.end_date || b.start_date).sort().at(-1)
  const [ey, em] = end.split('-').map(Number)
  set('N32', new Date(Date.UTC(ey, em, 0)), 'yyyy.mm.dd')       // 종료월 말일
  set('AT34', agencyName ? '판매사 수수료 30% 적용' : '직접 계약 (수수료 없음)')
  set('I34', agencyName || '광고주')
  set('N34', contact.agency_email || '')
  set('N35', HD_TAX_EMAIL)
  set('BO46', `${todayISO.slice(0, 4)}년    ${todayISO.slice(5, 7)}월    ${todayISO.slice(8, 10)}일`)
  set('AT47', info.corp || '')

  await downloadWb(wb, `청약서_${b0.advertiser}_${end.replace(/-/g, '')}.xlsx`)
}

/* ── 캠페인 제안서 — 상품 선택·기간·할인율로 미디어 믹스 산출 (예상 지표 = RMN_BENCH) ── */
export async function buildProposalXlsx({ advertiser, start, end, discount, products, pushUnits }) {
  if (!products.length) throw new Error('상품을 선택해 주세요')
  if (products.length > 4) throw new Error('제안서 상품은 최대 4개 (양식 행 수 제한)')
  const wb = await loadWb('rmn-proposal.xlsx')
  const ws = wb.getWorksheet('제안서')
  const set = (a, v, fmt) => { const c = ws.getCell(a); c.value = v; if (fmt) c.numFmt = fmt }

  const days = dayCount(start, end)
  const weeks = Math.max(1, Math.round(days / 7))
  const d = (Number(discount) || 0) / 100

  const rows = [...products].sort((a, b) => DOC_ORDER.indexOf(a) - DOC_ORDER.indexOf(b)).map(id => {
    const p = rmnProduct(id)
    const bench = RMN_BENCH[id]
    if (p.insta) {   // 인스타그램 — 게시형: 기본 구성(1회 업로드·이미지) 기준, 상세는 부킹에서
      const an = 2_000_000
      return { label: DOC_NAME[id], unit: an, guar: '1회 업로드 (구성별 상이)', an, av: an * (1 - d), imps: null, ctr: null }
    }
    if (p.push) {
      const qty = (Number(pushUnits) || 1) * p.unitSize
      const an = qty * p.pricePer
      return { label: DOC_NAME[id], unit: p.pricePer, guar: `${comma(qty / 10000)}만명/1회${p.msg ? '' : '(타겟)'}`, an, av: an * (1 - d), imps: qty, ctr: bench?.ctr ?? null }
    }
    const an = p.price * p.slots * weeks
    return {
      label: DOC_NAME[id], unit: p.price,
      guar: `${weeks * 7}일, ${p.slots === 1 ? '단독 운영' : `${p.slots}구좌`}`,
      an, av: an * (1 - d),
      imps: bench ? bench.imps * weeks : null, ctr: bench?.ctr ?? null,
    }
  })

  const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0)
  const tImps = rows.some(r => r.imps != null) ? rows.reduce((a, r) => a + (r.imps || 0), 0) : null
  const tClicks = tImps != null ? rows.reduce((a, r) => a + (r.imps && r.ctr ? r.imps * r.ctr : 0), 0) : null

  set('B2', `[ ${advertiser} 캠페인 제안 ] `)
  set('P6', advertiser)
  set('P7', `${d2(start)} ~ ${d2(end)} (${weeks}주)`)
  set('P8', '-')
  set('P11', rows.map(r => r.label.replace(/^앱 /, '')).join(', '))
  set('P12', `${comma(sum('av'))}원   *vat 별도`)

  const fillMetrics = (r, av, imps, clicks) => {
    set(`BL${r}`, imps ?? '-', imps != null ? '#,##0' : undefined)
    set(`BT${r}`, clicks != null ? Math.round(clicks) : '-', clicks != null ? '#,##0' : undefined)
    set(`CB${r}`, imps && clicks != null ? clicks / imps * 100 : '-', '0.00')
    set(`CJ${r}`, imps ? av / imps * 1000 : '-', '#,##0')
    set(`CR${r}`, clicks ? av / clicks : '-', '#,##0')
  }
  // 합계(17)·온라인(18) — 서비스 항목 미사용이라 동일 값
  for (const r of [17, 18]) {
    set(`P${r}`, sum('unit'), '#,##0')
    set(`AF${r}`, '-')
    set(`AN${r}`, sum('an'), '#,##0')
    set(`AV${r}`, sum('av'), '#,##0')
    set(`BD${r}`, -d, '0%')
    fillMetrics(r, sum('av'), tImps, tClicks)
  }
  rows.forEach((row, i) => {
    const r = 19 + i
    set(`E${r}`, row.label)
    set(`P${r}`, row.unit, '#,##0')
    set(`AF${r}`, row.guar)
    set(`AN${r}`, row.an, '#,##0')
    set(`AV${r}`, row.av, '#,##0')
    set(`BD${r}`, -d, '0%')
    fillMetrics(r, row.av, row.imps, row.imps != null && row.ctr != null ? row.imps * row.ctr : null)
  })

  await downloadWb(wb, `제안서_${advertiser}_${start.replace(/-/g, '')}.xlsx`)
}
