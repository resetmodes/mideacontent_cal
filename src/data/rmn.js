/* RMN (현대백화점 APP 광고 판매) — 상품·재고·상태·알림 로직 ('26.7)
   ─ 상품 구성·공시가는 공개 단가표 성격이라 번들에 둠. 부킹(광고주·실판가·판매사)은
     Supabase 전용(rmn_bookings, RLS) — 번들·미러에 싣지 않음
   ─ 재고: 구좌 상품 = 기간 겹침일 기준 동시 점유 수 ≤ 구좌 수 / 푸쉬 = 발송 1회(일자)당
     합계 90만 건 이내 ('26.7 확정: "1회당 90만 발송", 5만 단위 판매)
   ─ 가부킹: 집행 시작일이 오늘부터 3개월 초과 남았을 때만 가능. 자동 해제 없음(수동) —
     3개월 이내로 들어온 가부킹은 탭 접속 시 "부킹 전환" 알림 팝업 ('26.7 확정)
   ─ 판매사 수수료 30% → 입금가 = 총광고비 × 0.7 */

/* color: 캘린더·목록 이니셜 칩 구분색 ('26.7 사용자 요청 — 전부 검정이라 구분 불가).
   저채도 딥 톤만 사용 (원색·형광 금지 원칙 유지, 빨강 계열 제외 — 경고 전용) */
export const RMN_PRODUCTS = [
  { id: '스플래시',      slots: 1, price: 15_000_000, color: '#0B4336' },
  { id: '푸쉬',          push: true, unitSize: 50_000, perSend: 900_000, pricePer: 50, color: '#A07C2E' },   // 5만 단위 · 건당 50원
  { id: '메인배너',      slots: 3, price: 7_000_000, color: '#1F3A5F' },
  { id: '팝업배너',      slots: 3, price: 3_000_000, color: '#5B4A78' },
  { id: '하단배너',      slots: 3, price: 1_000_000, color: '#2E6E63' },
  { id: '헤드라인 뉴스', slots: 3, price: 3_000_000, color: '#6B4A32' },
  { id: '이벤트 메뉴',   slots: 1, price: 2_000_000, color: '#566173' },
]
export const rmnProduct = id => RMN_PRODUCTS.find(p => p.id === id)
export const rmnColor = id => rmnProduct(id)?.color || '#191919'

export const RMN_AGENCIES = ['나스미디어', '인크로스', 'M2Digital', '메조미디어', 'DMC미디어']
export const RMN_COMMISSION = 0.3   // 판매사 수수료

/* 상태 파이프라인 — 순서 진행 + 취소는 별도. 취소만 재고 해제 */
export const RMN_STATUS = ['가부킹', '부킹', '집행', '결과 리포트', '세금계산서', '입금 확인', '완료']
export const statusIdx = s => RMN_STATUS.indexOf(s)
export const nextStatus = s => RMN_STATUS[Math.min(statusIdx(s) + 1, RMN_STATUS.length - 1)]

/* ── 재고 계산 ─────────────────────────────────────── */
const holds = b => b.status !== '취소'   // 취소 외 전부 구좌 점유

const overlaps = (b, s, e) => b.start_date <= e && (b.end_date || b.start_date) >= s

/* 구좌 상품: 기간 내 "같은 날 동시 점유"의 최대값 기준 잔여 구좌 (excludeId = 수정 중인 건 제외) */
export function slotAvailability(bookings, productId, s, e, excludeId = null) {
  const p = rmnProduct(productId)
  if (!p || p.push) return null
  const list = bookings.filter(b =>
    b.product === productId && holds(b) && b.id !== excludeId && overlaps(b, s, e))
  let maxUsed = 0
  const d = new Date(s + 'T00:00:00')
  const end = new Date(e + 'T00:00:00')
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    const used = list.filter(b => b.start_date <= iso && (b.end_date || b.start_date) >= iso).length
    if (used > maxUsed) maxUsed = used
  }
  return { total: p.slots, used: maxUsed, left: Math.max(0, p.slots - maxUsed) }
}

/* 푸쉬: 같은 발송 일자의 예약 건수 합 ≤ 90만 */
export function pushAvailability(bookings, sendDateISO, excludeId = null) {
  const p = rmnProduct('푸쉬')
  const used = bookings
    .filter(b => b.product === '푸쉬' && holds(b) && b.id !== excludeId &&
      (b.send_at || '').slice(0, 10) === sendDateISO)
    .reduce((a, b) => a + (b.push_qty || 0), 0)
  return { total: p.perSend, used, left: Math.max(0, p.perSend - used) }
}

/* 가부킹 가능 여부 — 시작일이 오늘 + 3개월보다 뒤여야 함 */
export function canTentative(startISO, todayISO) {
  const t = new Date(todayISO + 'T00:00:00')
  t.setMonth(t.getMonth() + 3)
  return startISO > t.toISOString().slice(0, 10)
}

/* ── 탭 접속 알림 (하루 1회 팝업) ───────────────────────
   ① 가부킹인데 시작일이 3개월 이내로 들어온 건 → 부킹 전환 필요
   ② 월말 5일 전부터: 이번 달 종료 캠페인 중 세금계산서 단계 미도달 건 */
export function buildRmnNotices(bookings, todayISO) {
  const tentative = bookings.filter(b =>
    b.status === '가부킹' && !canTentative(b.start_date, todayISO))

  const t = new Date(todayISO + 'T00:00:00')
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  const taxWindow = t.getDate() >= lastDay - 5
  const ym = todayISO.slice(0, 7)
  const tax = taxWindow
    ? bookings.filter(b =>
        b.status !== '취소' && statusIdx(b.status) >= 0 && statusIdx(b.status) < statusIdx('세금계산서') &&
        ((b.end_date || b.start_date) || '').slice(0, 7) === ym)
    : []

  return { tentative, tax }
}

/* 가격: 공시가(구좌) 또는 푸쉬 수량 × 50원. 할인율 적용 실판가 */
export const rmnListPrice = (productId, pushUnits = 1) => {
  const p = rmnProduct(productId)
  if (!p) return 0
  return p.push ? p.unitSize * pushUnits * p.pricePer : p.price
}
export const applyDiscount = (price, rate) => Math.round(price * (1 - (Number(rate) || 0) / 100))
export const netAmount = (total, hasAgency) => (hasAgency ? Math.round(total * (1 - RMN_COMMISSION)) : total)

export const fmtWon = n => (n == null ? '—' : Number(n).toLocaleString('ko-KR') + '원')
