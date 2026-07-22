/* 정산 탭 데이터 ('26.7 테스트 — 3인) — 점 배분 프리셋·상태 파이프라인·계정과목.
   ─ 분담률 소스: "전점 배분 SNS" 정산 엑셀 (사용자 제공 '26.7). 비율 변경 시 여기 수정
   ─ 부킹·증빙 데이터는 Supabase 전용(settlements + settle-docs 버킷) — 번들에 안 실음 */

/* 점 배분 프리셋 — rate 합 = 100 (test-data 8이 감시). grp는 표시 그룹 라벨 */
export const ALLOC_PRESETS = [
  {
    id: 'dept',
    label: '백화점 정산',
    stores: [
      { name: '본점', rate: 13.5 }, { name: '무역', rate: 13.4 }, { name: '천호', rate: 3.8 },
      { name: '신촌', rate: 3.3 }, { name: '미아', rate: 2.6 }, { name: '목동', rate: 5.9 },
      { name: '중동', rate: 4.7 }, { name: '킨텍스', rate: 3.6 }, { name: '판교', rate: 20.9 },
      { name: '서울', rate: 13.7 }, { name: '대구', rate: 6.2 }, { name: '울산', rate: 4.9 },
      { name: '충청', rate: 3.5 },
    ],
    /* 세금계산서 분할 발행 (현대 법인 / 별도 법인) */
    corp: [{ name: '현대 법인', rate: 73.6 }, { name: '별도 법인', rate: 26.4 }],
  },
  {
    id: 'all',
    label: '전사 정산 (아울렛 포함)',
    stores: [
      { name: '본점', rate: 10.1, grp: '백화점' }, { name: '무역', rate: 10.1, grp: '백화점' },
      { name: '천호', rate: 2.8, grp: '백화점' }, { name: '신촌', rate: 2.5, grp: '백화점' },
      { name: '미아', rate: 1.9, grp: '백화점' }, { name: '목동', rate: 4.4, grp: '백화점' },
      { name: '중동', rate: 3.5, grp: '백화점' }, { name: '킨텍스', rate: 2.7, grp: '백화점' },
      { name: '판교', rate: 15.7, grp: '백화점' }, { name: '서울', rate: 10.3, grp: '백화점' },
      { name: '대구', rate: 4.7, grp: '백화점' }, { name: '울산', rate: 3.2, grp: '백화점' },
      { name: '동구', rate: 0.5, grp: '백화점' }, { name: '충청', rate: 2.6, grp: '백화점' },
      { name: '김포', rate: 6, grp: '아울렛' }, { name: '송도', rate: 4, grp: '아울렛' },
      { name: '대전', rate: 3.7, grp: '아울렛' }, { name: 'SPACE1', rate: 4.3, grp: '아울렛' },
      { name: '가산', rate: 1.4, grp: '아울렛' }, { name: '동대문', rate: 1.4, grp: '아울렛' },
      { name: '가든', rate: 1.4, grp: '아울렛' }, { name: '대구(아울렛)', rate: 0.8, grp: '아울렛' },
      { name: '부산', rate: 1, grp: '아울렛' }, { name: '청주', rate: 1, grp: '아울렛' },
    ],
    corp: [{ name: '현대 법인', rate: 68.5 }, { name: '별도 법인', rate: 31.5 }],
  },
]
export const allocPreset = id => ALLOC_PRESETS.find(p => p.id === id)

/* 배분 계산 — 제외 점이 있으면 남은 점 비율로 재정규화(합 100% 유지).
   원 단위 반올림 후 잔차는 분담률 최대 점에 보정(합계 = 정산 금액 정확 일치) */
export function computeAlloc(presetId, amount, excluded = []) {
  const p = allocPreset(presetId)
  if (!p || !amount) return null
  const sel = p.stores.filter(s => !excluded.includes(s.name))
  if (sel.length === 0) return null
  const rateSum = sel.reduce((a, s) => a + s.rate, 0)
  const rows = sel.map(s => ({
    ...s,
    effRate: (s.rate / rateSum) * 100,
    cost: Math.round(amount * (s.rate / rateSum)),
  }))
  const diff = amount - rows.reduce((a, r) => a + r.cost, 0)
  if (diff !== 0) rows.reduce((m, r) => (r.rate > m.rate ? r : m), rows[0]).cost += diff
  const corp = p.corp.map(c => ({ ...c, cost: Math.round(amount * c.rate / 100) }))
  const cdiff = amount - corp.reduce((a, c) => a + c.cost, 0)
  if (cdiff !== 0) corp[0].cost += cdiff
  return { preset: p, rows, corp, amount, renormalized: excluded.length > 0 }
}

/* 상태 파이프라인 — 유형별. 세금계산서만 "계산서 발행" 단계 존재 */
export const SETTLE_TYPES = ['법인카드', '세금계산서']
export const SETTLE_FLOW = {
  법인카드: ['작성', '증빙 완료', '전표 처리', '완료'],
  세금계산서: ['작성', '증빙 완료', '계산서 발행', '전표 처리', '완료'],
}
export const settleFlow = stype => SETTLE_FLOW[stype] || SETTLE_FLOW['법인카드']
export const settleStatusIdx = (stype, s) => settleFlow(stype).indexOf(s)
export const nextSettleStatus = (stype, s) => {
  const flow = settleFlow(stype)
  return flow[Math.min(flow.indexOf(s) + 1, flow.length - 1)]
}

/* 증빙 슬롯 — 유형별 첨부 구분 */
export const FILE_SLOTS = {
  법인카드: [
    { key: 'ev1', label: '증빙 (영수증 등)' },
    { key: 'easy', label: '간편결재 첨부 (별도 정산 건)' },
  ],
  세금계산서: [
    { key: 'ev1', label: '견적서·계약서' },
    { key: 'ev2', label: '내부 품의' },
  ],
}

/* 계정과목 (법인카드 일반 정산) — 실사용 목록 확보 시 교체 (사용자 전달 대기) */
export const SETTLE_ACCOUNTS = ['광고선전비', '지급수수료', '판매촉진비', '소모품비', '기타']

/* 미첨부 = 증빙 파일 0건 & 완료 아님. 계산서 미발행 = 세금계산서 유형 & 발행 단계 미도달 */
export const isMissingFiles = s => (!s.files || s.files.length === 0) && s.status !== '완료'
export const isTaxUnissued = s =>
  s.stype === '세금계산서' && s.status !== '완료' &&
  settleStatusIdx(s.stype, s.status) < settleFlow(s.stype).indexOf('계산서 발행')
