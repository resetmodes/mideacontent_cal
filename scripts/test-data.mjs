/* 데이터·설정 정합성 테스트 ('26.7 하네스)
   파일 간 참조가 어긋나면 (매체명 변경, 계정 추가 등) 조용히 깨지는 지점들을 검사.
   실행: npm run test 에 포함 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, MIRROR_URL } from '../src/config.js'
import { MEDIA } from '../src/data/media.js'
import { CHANNELS, KEYWORDS, TITLE_ALIASES } from '../src/data/channels.js'
import { SPEC_LINK_MAP } from '../src/lib/specLink.js'
import { YT_KEY, IG_HANDLE } from '../src/lib/perf.js'
import { HOLIDAYS, CLOSED_DAYS } from '../src/data/holidays.js'
import { TEAM, withAuthorName } from '../src/data/team.js'
import { IG_ACCOUNTS, YT_CHANNELS } from './sns/accounts.mjs'
import {
  overlaps, findClashes, layoutDay, expandBg, hoursFor, parseLine,
} from '../src/lib/myTask.js'

let fail = 0
const bad = msg => { fail++; console.error('✗ ' + msg) }

/* 1. config.js — 실제 키가 비어 있으면 팀 DB 연결이 끊긴 채 배포됨
   (브라우저 테스트용으로 비웠다가 복원 안 한 커밋을 잡는 검사) */
if (!/^https:\/\/[a-z]+\.supabase\.co$/.test(SUPABASE_URL))
  bad(`config.js SUPABASE_URL이 실제 값이 아님: "${SUPABASE_URL}" — 테스트용 빈 키를 복원하지 않은 것 아닌지 확인`)
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 40)
  bad('config.js SUPABASE_ANON_KEY가 비어 있거나 비정상 — 복원 필요')
if (MIRROR_URL && !/^https:\/\/[a-z0-9.-]+$/.test(MIRROR_URL))
  bad(`config.js MIRROR_URL 형식 오류: "${MIRROR_URL}" — 외부 공유 링크에 그대로 들어감 (끝에 / 금지)`)

/* 2. 스펙 딥링크 매핑 → media.js 이름과 일치해야 링크가 뜸 */
const mediaNames = new Set(MEDIA.map(m => m.name))
for (const [key, target] of Object.entries(SPEC_LINK_MAP)) {
  if (!mediaNames.has(target))
    bad(`specLink: "${key}" → "${target}" 이 media.js에 없음 (매체명 변경 시 함께 갱신)`)
}

/* 3. 키워드 → 채널 정의 정합성 */
const chIds = new Set(CHANNELS.map(c => c.id))
const subsOf = Object.fromEntries(CHANNELS.map(c => [c.id, new Set(c.subs)]))
for (const [kw, ch, sub] of KEYWORDS) {
  if (!chIds.has(ch)) bad(`KEYWORDS "${kw}" → 없는 채널 "${ch}"`)
  else if (sub && !subsOf[ch].has(sub)) bad(`KEYWORDS "${kw}" → ${ch}의 없는 세부 "${sub}"`)
}
for (const pair of TITLE_ALIASES) {
  if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string')
    bad(`TITLE_ALIASES 형식 오류: ${JSON.stringify(pair)}`)
}

/* 4. 실적 매칭 계정 키 → 수집 계정 정의와 일치해야 매칭됨 */
const ytKeys = new Set(YT_CHANNELS.map(c => c.key))
for (const [sub, key] of Object.entries(YT_KEY)) {
  if (!ytKeys.has(key)) bad(`perf.js YT_KEY "${sub}" → accounts.mjs에 없는 채널 키 "${key}"`)
}
const igHandles = new Set(IG_ACCOUNTS.map(a => a.handle))
for (const [sub, handle] of Object.entries(IG_HANDLE)) {
  if (!igHandles.has(handle)) bad(`perf.js IG_HANDLE "${sub}" → accounts.mjs에 없는 핸들 "${handle}"`)
}

/* 5. 공휴일·휴점일 — 날짜 형식·유효성 */
for (const iso of Object.keys(HOLIDAYS)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(iso).getTime()))
    bad(`holidays.js 잘못된 날짜 키: "${iso}"`)
}
for (const iso of Object.keys(CLOSED_DAYS)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(iso).getTime()))
    bad(`holidays.js CLOSED_DAYS 잘못된 날짜 키: "${iso}"`)
}

/* 6. 팀원 명단 — 이메일 형식 */
for (const email of Object.keys(TEAM)) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad(`team.js 이메일 형식 오류: "${email}"`)
  if (email !== email.toLowerCase()) bad(`team.js 이메일은 소문자로: "${email}" (authorName이 소문자로 조회)`)
}

/* 6b. 팀 일정 이름 자동 병기 — "연차"만 쓰면 작성자 이름이 붙고,
   명단의 이름이 이미 있으면(대신 등록) 그대로 둬야 함 */
const wa = [
  [withAuthorName('연차', '노규빈 선임'), '노규빈 연차'],
  [withAuthorName('오후 반차', '이수정 선임'), '이수정 오후 반차'],
  [withAuthorName('김상수, 정소미, 노규빈 목동 외근', '노규빈 선임'), '김상수, 정소미, 노규빈 목동 외근'],
  [withAuthorName('김희진 연차', '노규빈 선임'), '김희진 연차'],
  [withAuthorName('연차', ''), '연차'],   // 로컬 모드(로그인 없음) — 변형 금지
]
for (const [got, want] of wa) {
  if (got !== want) bad(`withAuthorName: "${got}" ≠ 기대값 "${want}"`)
}

/* 6c. 타겟APP 이관 SQL·메타 무결성 — 실적 수치는 번들 금지(내부 전용), SQL은 행 수 고정 */
import { readFileSync, readdirSync } from 'node:fs'
import { TA_GROUPS } from '../src/data/targetapp.js'
const taSql = readFileSync(new URL('../data/targetapp-seed.sql', import.meta.url), 'utf8')
if ((taSql.match(/^insert into targetapp_stats/gm) || []).length !== 50)
  bad('targetapp-seed.sql: 캠페인 이관 50건이 아님')
if ((taSql.match(/^insert into targetapp_media/gm) || []).length !== 10)
  bad('targetapp-seed.sql: 매체 누적 10종이 아님')
if (!taSql.includes('enable row level security')) bad('targetapp-seed.sql: RLS 누락')
if (/to anon/.test(taSql)) bad('targetapp-seed.sql: 내부 전용 — anon 정책 금지')
const taMeta = readFileSync(new URL('../src/data/targetapp.js', import.meta.url), 'utf8')
if (/\b(exp|clk|vis|inst)\b/.test(taMeta.replace(/\/\*[\s\S]*?\*\//, '')))
  bad('src/data/targetapp.js: 실적 수치 필드가 번들 파일에 있음 — DB로만 (유출 방지)')
for (const g of TA_GROUPS) {
  if (!g.g || !Array.isArray(g.media) || g.media.length === 0) bad(`TA_GROUPS "${g.g}": 형식 오류`)
}

/* 6d. RMN 재고·가부킹·알림 로직 ('26.7) */
import {
  RMN_PRODUCTS, rmnProduct, slotAvailability, pushAvailability, canTentative, buildRmnNotices,
  applyDiscount, netAmount, groupCampaigns, periodDays, priceWeeks, bookingQty, PRICE_DAYS,
  instaPrice, kakaoPrice, INSTA_PRODUCTS, INSTA_FORMATS, INSTA_PRICES,
} from '../src/data/rmn.js'
if (RMN_PRODUCTS.length !== 9) bad('RMN 상품이 9종이 아님 (7종 + 카카오톡·인스타그램)')
{
  const bk = (id, product, s, e, status = '부킹', extra = {}) =>
    ({ id, product, start_date: s, end_date: e, status, ...extra })
  const B = [
    bk('a', '메인배너', '2026-08-01', '2026-08-10'),
    bk('b', '메인배너', '2026-08-05', '2026-08-15'),
    bk('c', '메인배너', '2026-08-08', '2026-08-12', '가부킹'),
    bk('x', '메인배너', '2026-08-01', '2026-08-31', '취소'),
    bk('p1', '푸쉬', '2026-08-20', '2026-08-20', '부킹', { send_at: '2026-08-20T10:00:00+09:00', push_qty: 850000 }),
  ]
  const a1 = slotAvailability(B, '메인배너', '2026-08-08', '2026-08-09')
  if (a1.left !== 0) bad(`RMN 겹침 재고: 8/8~9 메인배너 잔여 ${a1.left} ≠ 0 (3구좌 동시 점유·취소 제외)`)
  const a2 = slotAvailability(B, '메인배너', '2026-08-16', '2026-08-20')
  if (a2.left !== 3) bad(`RMN 재고: 비는 기간 잔여 ${a2.left} ≠ 3`)
  const a3 = slotAvailability(B, '메인배너', '2026-08-08', '2026-08-09', 'c')
  if (a3.left !== 1) bad('RMN 재고: 수정 중 자기 자신 제외 실패')
  const pa = pushAvailability(B, '2026-08-20')
  if (pa.left !== 50000) bad(`RMN 푸쉬 재고: 잔여 ${pa.left} ≠ 50,000 (1회당 90만)`)
  if (canTentative('2026-10-01', '2026-07-21')) bad('가부킹: 3개월 이내(10/1)인데 허용됨')
  if (!canTentative('2026-10-22', '2026-07-21')) bad('가부킹: 3개월 초과(10/22)인데 불허됨')
  const n = buildRmnNotices([
    bk('t', '스플래시', '2026-08-30', '2026-08-31', '가부킹'),
    bk('u', '팝업배너', '2026-07-10', '2026-07-18', '집행'),
    bk('v', '하단배너', '2026-07-01', '2026-07-05', '세금계산서'),
  ], '2026-07-26')
  if (n.tentative.length !== 1) bad('알림: 가부킹 전환 대상 1건이어야 함')
  if (n.tax.length !== 1 || n.tax[0].id !== 'u') bad('알림: 세금계산서 미교부는 u 1건이어야 함 (교부 완료 v 제외)')
  const n2 = buildRmnNotices([bk('u', '팝업배너', '2026-07-10', '2026-07-18', '집행')], '2026-07-20')
  if (n2.tax.length !== 0) bad('알림: 월말 5일 전 이전에는 세금계산서 팝업 없어야 함')
  if (applyDiscount(15_000_000, 10) !== 13_500_000) bad('할인율 계산 오류')
  if (netAmount(10_000_000, true) !== 7_000_000) bad('판매사 수수료 30% 입금가 계산 오류')

  /* 수량(qty): 팝업배너 3개 = 3구좌 점유 → 잔여 0. 값 없으면 1로 취급 */
  if (bookingQty({}) !== 1) bad('bookingQty: qty 없으면 1이어야 함')
  if (bookingQty({ qty: 3 }) !== 3) bad('bookingQty: qty 3 반영 실패')
  const Q = [bk('q1', '팝업배너', '2026-09-01', '2026-09-07', '부킹', { qty: 3 })]
  const qa = slotAvailability(Q, '팝업배너', '2026-09-03', '2026-09-04')
  if (qa.left !== 0) bad(`RMN 수량 재고: 팝업배너 3개 점유 시 잔여 ${qa.left} ≠ 0`)
  const qa2 = slotAvailability([bk('q2', '팝업배너', '2026-09-01', '2026-09-07', '부킹', { qty: 1 })], '팝업배너', '2026-09-03', '2026-09-04')
  if (qa2.left !== 2) bad(`RMN 수량 재고: 팝업배너 1개 점유 시 잔여 ${qa2.left} ≠ 2`)

  /* 7일 기준 기간 계산 (양끝 포함) */
  if (periodDays('2026-09-01', '2026-09-07') !== PRICE_DAYS) bad(`periodDays: 9/1~9/7 이 ${PRICE_DAYS}일이 아님`)
  if (periodDays('2026-09-01', '2026-09-01') !== 1) bad('periodDays: 하루 = 1일이어야 함')

  /* 기간 비례 과금 ('26.7) — 비 7일 배수는 무조건 올림: 8일=×2, 10일=×2, 21일=×3 */
  if (priceWeeks(7) !== 1) bad('priceWeeks: 7일 = ×1이어야 함')
  if (priceWeeks(14) !== 2) bad('priceWeeks: 14일 = ×2여야 함')
  if (priceWeeks(21) !== 3) bad(`priceWeeks: 21일 = ×3이어야 함 (${priceWeeks(21)})`)
  if (priceWeeks(4) !== 1) bad('priceWeeks: 4일 = 최소 ×1이어야 함')
  if (priceWeeks(8) !== 2) bad(`priceWeeks: 8일 = 올림 ×2여야 함 (${priceWeeks(8)})`)
  if (priceWeeks(10) !== 2) bad(`priceWeeks: 10일 = 올림 ×2여야 함 (${priceWeeks(10)})`)
  {
    /* 라인 가격 검증: 메인배너(7,000,000/7일) 21일 = 21,000,000, 할인 10% = 18,900,000 */
    const base = rmnProduct('메인배너').price
    const days = periodDays('2026-09-01', '2026-09-21')   // 21일
    const list = base * priceWeeks(days) * 1
    if (list !== 21_000_000) bad(`라인 공시가: 메인배너 21일 ${list} ≠ 21,000,000 (7일×3)`)
    if (applyDiscount(list, 10) !== 18_900_000) bad('라인 실판가: 21일 10% 할인 계산 오류')
    /* 상품별 상이 기간·할인 합산: 스플래시 7일 15,000,000(할인0) + 메인배너 21일 21,000,000 할인10% = 33,900,000 */
    const sum = applyDiscount(15_000_000, 0) + applyDiscount(21_000_000, 10)
    if (sum !== 33_900_000) bad(`상품별 합산: ${sum} ≠ 33,900,000`)
    /* 총 할인율 ('26.7 확정) — 공시가 합 대비 실판가 합: 메인 7M(10%) + 팝업 3M(20%) = 8.7M → 13% */
    const tl = 7_000_000 + 3_000_000
    const ta = applyDiscount(7_000_000, 10) + applyDiscount(3_000_000, 20)
    const rate = Math.round((1 - ta / tl) * 1000) / 10
    if (ta !== 8_700_000 || rate !== 13) bad(`총 할인율: ${ta} → ${rate}% ≠ 8,700,000 → 13%`)
  }

  /* 카카오톡 ('26.7) — 건당 100원, 타겟팅 +10% */
  if (kakaoPrice(50_000, false) !== 5_000_000) bad('카카오톡: 5만 건 × 100원 = 5,000,000이어야 함')
  if (kakaoPrice(50_000, true) !== 5_500_000) bad('카카오톡: 타겟팅 10% 할증 = 5,500,000이어야 함')

  /* 인스타그램 ('26.7) — 구성 4종 × 형식 2종 단가표 완비 + 대표값 원본 대조 */
  for (const p of INSTA_PRODUCTS) for (const x of INSTA_FORMATS) {
    if (!INSTA_PRICES[p]?.[x]) bad(`인스타 단가표: "${p}" × "${x}" 누락`)
  }
  if (instaPrice('1회 업로드', '피드(이미지)') !== 2_000_000) bad('인스타: 1회 업로드 이미지 = 200만원')
  if (instaPrice('상단 고정 (7일)', '피드(영상)') !== 4_500_000) bad('인스타: 상단 고정 영상 = 450만원')
  if (instaPrice('3피드 + 스토리 3회', '피드(영상)') !== 12_000_000) bad('인스타: 3피드+스토리 영상 = 1,200만원')

  /* 캠페인 그룹핑 — [광고주+캠페인명] 기준, 취소 제외.
     ① 이름 있으면: 기간 갭 커도(분할 집행) 한 캠페인 유지
     ② 이름 없으면: 갭>3일이면 회차 분리 */
  const G = groupCampaigns([
    bk('c1', '스플래시', '2026-09-01', '2026-09-03', '부킹', { advertiser: '샤넬', campaign: '홀리데이', actual_price: 15_000_000 }),
    bk('c2', '스플래시', '2026-09-20', '2026-09-23', '집행', { advertiser: '샤넬', campaign: '홀리데이', actual_price: 0 }), // 분할 이어짐(갭 커도 이름 같으면 한 캠페인)
    bk('c4', '메인배너', '2026-09-02', '2026-09-08', '부킹', { advertiser: '까르띠에', campaign: '', actual_price: 7_000_000 }),
    bk('c5', '팝업배너', '2026-11-02', '2026-11-08', '부킹', { advertiser: '까르띠에', campaign: '', actual_price: 3_000_000 }), // 이름 없고 갭 커서 별 회차
    bk('cx', '메인배너', '2026-09-01', '2026-09-07', '취소', { advertiser: '샤넬', campaign: '홀리데이', actual_price: 7_000_000 }),
  ])
  if (G.length !== 3) bad(`캠페인 그룹: 3그룹이어야 함 (샤넬 홀리데이 / 까르띠에 9월 / 까르띠에 11월) — ${G.length}개`)
  const shanel = G.find(g => g.advertiser === '샤넬')
  if (!shanel || shanel.items.length !== 2) bad('캠페인 그룹: 샤넬 홀리데이는 갭 커도 이름 같으면 한 캠페인 2건(취소 제외)')
  if (shanel.total !== 15_000_000) bad(`캠페인 그룹: 분할 이어짐(금액 0) 합산 시 총광고비 ${shanel.total} ≠ 15,000,000 (1회분만)`)
  if (shanel.status !== '부킹') bad(`캠페인 상태: 가장 덜 진행된 '부킹'이어야 함 — ${shanel.status}`)
  if (!shanel.mixed) bad('캠페인 그룹: 부킹·집행 혼합이면 mixed=true')
  if (G.filter(g => g.advertiser === '까르띠에').length !== 2) bad('캠페인 그룹: 이름 없는 까르띠에는 갭>3일이면 회차 분리')
}

/* 6f. RMN 문서 생성 — 판매사 마스터·기준값·양식 표기·빈 템플릿 정합성 */
import { existsSync } from 'node:fs'
import { RMN_AGENCY_INFO, RMN_BENCH } from '../src/data/rmnAgencies.js'
import { RMN_AGENCIES } from '../src/data/rmn.js'
import { DOC_NAME, DOC_ORDER, buildLedgerXlsx } from '../src/lib/rmnDocs.js'
if (typeof buildLedgerXlsx !== 'function') bad('rmnDocs: buildLedgerXlsx export 누락 — 실적 대장 다운로드 깨짐')
for (const p of RMN_PRODUCTS) {   // 대장 상세 행 정렬(DOC_ORDER)에서 빠진 상품이 있으면 정렬 붕괴
  if (!DOC_ORDER.includes(p.id)) bad(`rmnDocs DOC_ORDER: "${p.id}" 누락 — 실적 대장 상품 정렬 깨짐`)
}
for (const a of RMN_AGENCIES) {
  if (!RMN_AGENCY_INFO[a]) bad(`rmnAgencies: 판매사 "${a}" 마스터 누락 (청약서 회사 정보 빈칸됨)`)
}
for (const [id, b] of Object.entries(RMN_BENCH)) {
  if (!RMN_PRODUCTS.some(p => p.id === id)) bad(`RMN_BENCH "${id}": rmn.js에 없는 상품`)
  if (b.ctr != null && (b.ctr < 0 || b.ctr > 0.2)) bad(`RMN_BENCH "${id}": CTR ${b.ctr} 비정상 (비율로 저장 — % 아님)`)
}
for (const p of RMN_PRODUCTS) {
  if (!DOC_NAME[p.id]) bad(`rmnDocs DOC_NAME: "${p.id}" 양식 표기 누락`)
}
for (const f of ['rmn-order.xlsx', 'rmn-proposal.xlsx', 'rmn-report.xlsx']) {
  if (!existsSync(new URL(`../public/templates/${f}`, import.meta.url)))
    bad(`public/templates/${f} 없음 — 청약서·제안서 다운로드가 깨짐`)
}
{ // 빈 템플릿에 원본 실데이터가 남아 있으면 안 됨 (public = 공개 URL)
  const raw = readFileSync(new URL('../public/templates/rmn-order.xlsx', import.meta.url))
  // xlsx는 압축이라 문자열 grep은 불충분 — 최소한 파일 크기 급증(원본 복귀)만 감시
  if (raw.length > 60_000) bad('rmn-order.xlsx 템플릿 크기 이상 — 실데이터 원본으로 되돌아간 것 아닌지 확인')
}

/* 6e. RMN 이관 SQL — 대장 전체 재적재('26.06 대장, 2025 48 + 2026 76 = 124건).
   행 수 고정 + delete 선행 + 날짜 형식(역순·비ISO가 섞이면 insert가 통째로 실패) */
{
  const sql = readFileSync(new URL('../data/rmn-seed.sql', import.meta.url), 'utf8')
  const inserts = sql.match(/^insert into rmn_bookings/gm) || []
  if (inserts.length !== 124) bad(`rmn-seed.sql: 이관 124건이 아님 (${inserts.length}건)`)
  if (!/^delete from rmn_bookings;/m.test(sql)) bad('rmn-seed.sql: 재적재 전 delete 문 누락')
  for (const m of sql.matchAll(/'(\d{4}-\d{2}-\d{2})','(\d{4}-\d{2}-\d{2})'/g)) {
    if (m[2] < m[1]) bad(`rmn-seed.sql: 역순 기간 ${m[1]}→${m[2]}`)
  }
  if ((sql.match(/'\d{1,2}\/[^']*'/g) || []).length) bad('rmn-seed.sql: 비ISO 날짜 잔존')
}

/* 8. 정산 탭 ('26.7 테스트 — 3인) — 점 배분 합계·재정규화·상태 파이프라인 */
import { ALLOC_PRESETS, computeAlloc, SETTLE_FLOW, isMissingFiles, isTaxUnissued } from '../src/data/settle.js'
import { SETTLE_EMAILS } from '../src/config.js'
if (SETTLE_EMAILS.length !== 3) bad(`정산 게이트: 테스트 3인이어야 함 (${SETTLE_EMAILS.length}명)`)
for (const p of ALLOC_PRESETS) {
  const sum = Math.round(p.stores.reduce((a, s) => a + s.rate, 0) * 10) / 10
  if (sum !== 100) bad(`점 배분 "${p.label}": 분담률 합 ${sum} ≠ 100 (정산 엑셀과 대조 필요)`)
  const csum = Math.round(p.corp.reduce((a, c) => a + c.rate, 0) * 10) / 10
  if (csum !== 100) bad(`점 배분 "${p.label}": 법인 분할 합 ${csum} ≠ 100`)
  const names = p.stores.map(s => s.name)
  if (new Set(names).size !== names.length) bad(`점 배분 "${p.label}": 점 이름 중복 (제외 체크가 엉킴)`)
}
{
  /* 정산 엑셀 원본 값 재현: 백화점 14,150,000원 → 본점 13.5% = 1,910,250원 */
  const a = computeAlloc('dept', 14_150_000)
  if (a.rows.find(r => r.name === '본점')?.cost !== 1_910_250) bad('점 배분: 본점 13.5% 배분액이 정산 엑셀과 다름')
  if (a.rows.reduce((s, r) => s + r.cost, 0) !== 14_150_000) bad('점 배분: 배분 합 ≠ 정산 금액 (잔차 보정 실패)')
  if (a.corp.reduce((s, c) => s + c.cost, 0) !== 14_150_000) bad('점 배분: 법인 분할 합 ≠ 정산 금액')
  /* 제외 시 재정규화 — 남은 점 비율 합 100%, 배분 합은 여전히 정확히 일치 */
  const b = computeAlloc('dept', 10_000_000, ['본점', '판교'])
  if (b.rows.length !== 11) bad('점 배분: 2점 제외 시 11점이어야 함')
  if (Math.round(b.rows.reduce((s, r) => s + r.effRate, 0)) !== 100) bad('점 배분: 재정규화 비율 합 ≠ 100%')
  if (b.rows.reduce((s, r) => s + r.cost, 0) !== 10_000_000) bad('점 배분: 재정규화 후 배분 합 ≠ 정산 금액')
}
if (!SETTLE_FLOW['세금계산서'].includes('계산서 발행')) bad('정산 상태: 세금계산서 파이프라인에 계산서 발행 단계 없음')
if (SETTLE_FLOW['법인카드'].includes('계산서 발행')) bad('정산 상태: 법인카드에는 계산서 발행 단계가 없어야 함')
if (!isMissingFiles({ files: [], status: '작성' })) bad('정산: 파일 0건 = 미첨부여야 함')
if (isMissingFiles({ files: [], status: '완료' })) bad('정산: 완료 건은 미첨부 목록에서 제외')
if (!isTaxUnissued({ stype: '세금계산서', status: '증빙 완료' })) bad('정산: 발행 전 세금계산서 = 미발행이어야 함')
if (isTaxUnissued({ stype: '세금계산서', status: '계산서 발행' })) bad('정산: 발행 단계 도달 건은 미발행 아님')
if (isTaxUnissued({ stype: '법인카드', status: '작성' })) bad('정산: 법인카드는 계산서 미발행 대상 아님')

/* 8b. ZIP 생성기 — 시그니처·엔트리 수·UTF-8 파일명 (증빙 일괄 다운로드가 못 열리면 사고) */
{
  const { buildZip } = await import('../src/lib/zip.js')
  const enc2 = new TextEncoder()
  const blob = buildZip([
    { path: '2026-07/0715_테스트_노규빈/영수증.jpg', data: enc2.encode('x'.repeat(100)) },
    { path: '2026-08/견적서.pdf', data: enc2.encode('y') },
  ])
  const buf = new Uint8Array(await blob.arrayBuffer())
  if (!(buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 3 && buf[3] === 4)) bad('ZIP: 로컬 헤더 시그니처(PK34) 아님')
  /* EOCD(끝에서 22바이트)의 총 엔트리 수 = 2 */
  const eocd = buf.length - 22
  if (!(buf[eocd] === 0x50 && buf[eocd + 1] === 0x4B && buf[eocd + 2] === 5 && buf[eocd + 3] === 6)) bad('ZIP: EOCD 시그니처 아님')
  const count = buf[eocd + 10] | (buf[eocd + 11] << 8)
  if (count !== 2) bad(`ZIP: 엔트리 수 ${count} ≠ 2`)
}

/* 7. media.js 스키마 최소 요건 + 레퍼런스 이미지 실재 검증 ('26.7 제작 가이드 개편) */
for (const m of MEDIA) {
  if (!m.group || !m.cat || !m.name || !m.lead) bad(`media.js "${m.name || '?'}": group/cat/name/lead 누락`)
  if (!Array.isArray(m.slots) || m.slots.length === 0) bad(`media.js "${m.name}": slots 비어 있음`)
  if (typeof m.verified !== 'boolean') bad(`media.js "${m.name}": verified는 boolean`)
  for (const v of m.visual ? (Array.isArray(m.visual) ? m.visual : [m.visual]) : [])
    if (!existsSync(new URL(`../public/media-ref/${v}`, import.meta.url)))
      bad(`media.js "${m.name}": 대표 비주얼 이미지 없음 (public/media-ref/${v})`)
  for (const s of m.slots) {
    if (s.ref && !existsSync(new URL(`../public/media-ref/${s.ref}`, import.meta.url)))
      bad(`media.js "${m.name}" 지면 "${s.name}": 레퍼런스 이미지 없음 (public/media-ref/${s.ref})`)
    if (s.kind && !['이미지', '영상', '이미지, 영상', '텍스트'].includes(s.kind))
      bad(`media.js "${m.name}" 지면 "${s.name}": kind "${s.kind}" 비표준`)
  }
}

/* 9. 일정 이미지 첨부 ('26.7) — store가 images를 조건부 전송하는지 감시.
   무조건 전송으로 회귀하면 일반 수정·드래그 이동(images 미포함 patch)이 첨부를 지움 */
{
  const storeSrc = readFileSync(new URL('../src/lib/store.js', import.meta.url), 'utf8')
  if (!storeSrc.includes('e.images !== undefined'))
    bad('store.js: images 조건부 전송 누락 — 일반 수정·드래그가 이미지 첨부를 덮어씀')
  if (!storeSrc.includes('updateEventImages'))
    bad('store.js: updateEventImages 없음 — 이미지 첨부 저장 깨짐')
  if (!existsSync(new URL('../src/lib/eventImages.js', import.meta.url)))
    bad('src/lib/eventImages.js 없음 — 이미지 첨부 업로드 깨짐')
  const setup = readFileSync(new URL('../data/supabase-setup.md', import.meta.url), 'utf8')
  if (!/event-images/.test(setup) || !/images jsonb/.test(setup))
    bad('supabase-setup.md: 10장(event-images 버킷·images 컬럼) SQL 누락')
}

/* 10. 노션 동기화 매핑 ('26.7) — 업로드→매체 / 촬영→촬영탭 분리·날짜 없는 행 스킵 회귀 */
{
  const { mapPage } = await import('./notion/sync-notion.mjs')
  const mock = JSON.parse(readFileSync(new URL('../data/notion-mock.json', import.meta.url), 'utf8'))
  const mapped = mock.pages.flatMap(mapPage)
  if (mapped.length !== 4) bad(`notion 매핑: 4건이어야 하는데 ${mapped.length}건 (날짜 없는 행 스킵·2날짜 분리 확인)`)
  const up = mapped.find(r => r.notion_id === 'nid-1')
  if (!up || up.kind !== null || up.date !== '2026-08-05' || up.channel !== '인스타')
    bad('notion 매핑: nid-1 업로드 건(매체 캘린더) 불일치')
  const sh = mapped.find(r => r.notion_id === 'nid-1#shoot')
  if (!sh || sh.kind !== '촬영' || sh.date !== '2026-08-01')
    bad('notion 매핑: nid-1 촬영 건(#shoot 키·kind) 불일치')
  const only = mapped.find(r => r.notion_id === 'nid-3#shoot')
  if (!only || mapped.some(r => r.notion_id === 'nid-3'))
    bad('notion 매핑: 촬영만 있는 행은 촬영 건 1건이어야 함')
  const b = mapped.find(r => r.notion_id === 'nid-2')
  if (!b || b.end_date !== '2026-08-12') bad('notion 매핑: nid-2 기간(end) 불일치')
}

/* 11. 캠페인 통합 성과 매칭 ('26.7.30) — 없는 매체가 표에 뜨거나
   다른 시기 실적이 붙는 사고를 회귀 감시 */
{
  const { matchTargetApp, spanMonths, buildCampaignPerf } = await import('../src/lib/campaignPerf.js')
  const { matchContent, pickAuto } = await import('../src/lib/perf.js')
  const { IG } = await import('../src/data/sns/instagram.js')

  const rows = [
    { name: '여름테마', year: 2026, month: 3, exp: 1, clk: 1 },
    { name: '2026 여름테마 프로모션', year: 2026, month: 7, exp: 10, clk: 2 },
    { name: '여름', year: 2026, month: 7, exp: 99, clk: 9 },
  ]
  const july = new Set(['2026-7'])
  const hit = matchTargetApp('여름테마', rows, july)
  if (hit.length !== 1 || hit[0].month !== 7)
    bad('campaignPerf: 타겟APP 대장 매칭이 캠페인 시기를 벗어남 (다른 달 실적 유입)')
  if (matchTargetApp('여름테마핫딜', rows, july).length !== 0)
    bad('campaignPerf: 대장 표기가 캠페인 태그에 포함되는 역방향 매칭은 과매칭이라 막아야 함')
  if (matchTargetApp('여름테마', rows, new Set(['2026-9'])).length !== 0)
    bad('campaignPerf: 시기가 안 겹치는데도 대장 실적이 붙음')
  if ([...spanMonths([{ date: '2026-06-28', endDate: '2026-07-03' }])].join() !== '2026-6,2026-7')
    bad('campaignPerf: spanMonths가 달을 넘는 기간을 못 잡음')

  /* 일정에 없는 매체는 절대 표에 나오면 안 됨 */
  const perf = buildCampaignPerf(
    [{ id: 'a', date: '2026-07-24', channel: '인스타', sub: '공식', title: '여름테마', campaign: '여름테마' }],
    { taRows: rows, campaign: '여름테마' })
  if (perf.rows.some(r => r.ch === '타겟APP'))
    bad('campaignPerf: 캘린더에 없는 매체가 성과 표에 나타남')

  /* 제목 대조 자동 확정 — 같은 날 여러 게시물 중 제목이 겹치는 것만 골라야 함 */
  const mine = (IG.posts || []).filter(p => p.handle === 'the_hyundai')
  /* 그 계정 게시물 중 딱 하나에만 나오는 4글자 단어를 제목으로 주면 그 건이 확정돼야 함 */
  let probe = null
  for (const p of mine) {
    for (const w of (p.caption || '').match(/[가-힣]{4,}/g) || []) {
      if (mine.filter(q => (q.caption || '').includes(w)).length === 1) { probe = { p, w }; break }
    }
    if (probe) break
  }
  if (probe) {
    const day = probe.p.ts.slice(0, 10)
    const auto = pickAuto(matchContent({ date: day, channel: '인스타', sub: '공식', title: probe.w }))
    if (!auto || auto.url !== probe.p.url)
      bad(`perf: 제목이 겹치는 게시물을 자동 확정하지 못함 (키워드 ${probe.w})`)
    const vague = pickAuto(matchContent({ date: day, channel: '인스타', sub: '공식', title: '인스타 업로드' }))
    if (vague) bad('perf: 범용 제목인데도 자동 확정함 (사람이 골라야 하는 상황)')
  }
}

/* 12. 캠페인 태그 없는 일정 자동 묶음 ('26.7.30) — 상투어로 묶이거나
   "미아 25주년"이 "25주년" 하나로 뭉개지는 회귀를 감시 */
{
  const { autoGroups } = await import('../src/lib/autoGroup.js')
  const ev = (id, title) => ({ id, title, date: '2026-08-01', channel: '인스타' })
  const names = g => g.map(x => x.name)

  const g1 = autoGroups([
    ev(1, '웨딩페어 인스타 릴스'), ev(2, '웨딩페어 카톡 발송'), ev(3, '웨딩페어 APP팝업'),
    ev(4, '미아 25주년 팝업 배너'), ev(5, '미아 25주년 유튜브 영상'), ev(6, '여름 신상 캐러셀'),
  ])
  if (!names(g1).includes('웨딩페어') || !names(g1).includes('미아 25주년'))
    bad(`autoGroup: 제목이 겹치는 일정을 못 묶음 (${names(g1).join(', ')})`)
  if (g1.some(x => x.list.some(e => e.title === '여름 신상 캐러셀')))
    bad('autoGroup: 혼자인 일정이 묶임')

  if (autoGroups([ev(1, '인스타 릴스 업로드'), ev(2, '카톡 팝업 오픈 안내'), ev(3, '유튜브 영상 게시')]).length)
    bad('autoGroup: 채널·포맷 상투어로 묶임 (서로 무관한 일정이 한 덩어리가 된다)')

  const g3 = autoGroups([
    ev(1, '미아 25주년 팝업'), ev(2, '미아 25주년 카톡'),
    ev(3, '천호 25주년 배너'), ev(4, '천호 25주년 릴스'),
  ])
  if (g3.length !== 2 || !names(g3).includes('미아 25주년') || !names(g3).includes('천호 25주년'))
    bad(`autoGroup: 점포가 다른데 "25주년"으로 뭉개짐 (${names(g3).join(', ')})`)
}

/* 13. 바이럴 라운지 ('26.8) — APP 광고 가이드 규칙(영업일 계산, 글자수, 이모지,
   접수번호, 기본 담당)이 코드에 정확히 실렸는지 감시 */
{
  const L = await import('../src/data/lounge.js')

  /* 영업일 — '26.8.14(금) 기준: 8/15(토, 광복절), 8/16(일), 8/17(월, 대체공휴일) 전부 제외.
     8/14 → 8/21 사이 영업일은 18, 19, 20, 21 네 날 */
  if (L.isBusinessDay('2026-08-17')) bad('lounge: 대체공휴일(8/17)을 영업일로 계산')
  if (L.isBusinessDay('2026-08-16')) bad('lounge: 일요일을 영업일로 계산')
  if (!L.isBusinessDay('2026-08-18')) bad('lounge: 평일(8/18)을 휴일로 계산')
  const biz = L.bizDaysBetween('2026-08-14', '2026-08-21')
  if (biz !== 4) bad(`lounge: 연휴 낀 영업일 계산 오류 (기대 4, 실제 ${biz})`)

  /* 리드타임 3단 — 완성 +3 / 이미지 +5 / 페이지 +10 (가이드 원문) */
  const leads = L.READY_STATES.map(r => r.lead).join(',')
  if (leads !== '3,5,10') bad(`lounge: 리드타임 3단이 가이드와 다름 (${leads})`)
  const lc = L.leadCheck('2026-08-14', '2026-08-21', 'image')
  if (!lc || lc.ok || lc.left !== 4 || lc.need !== 5)
    bad(`lounge: 리드타임 대조 오류 (need ${lc?.need}, left ${lc?.left})`)

  /* 글자수, 이모지 — 푸시 제목 30자, 내용 줄당 30자, 이모지 불가 */
  const push = L.appSlotById('push')
  if (!push || push.push.titleMax !== 30 || push.push.bodyMax !== 60 || push.push.bodyPerLine !== 30)
    bad('lounge: 푸시 글자수 규칙이 가이드와 다름')
  if (!L.hasEmoji('오늘만 특가 🎁')) bad('lounge: 이모지를 감지하지 못함')
  if (L.hasEmoji('현대백화점 VIP고객, 3.18~24')) bad('lounge: 일반 한글 문장을 이모지로 오인')
  const ov = L.overLines('공백 포함 열한자 넘는 긴 제목입니다\n짧은 줄', 11)
  if (ov.length !== 1 || ov[0] !== 1) bad(`lounge: 줄 글자수 검사 오류 (${ov.join(',')})`)

  /* 구좌 규격 — 가이드 확정값 */
  const sizes = L.APP_SLOTS.map(s => `${s.id}:${s.w}x${s.h}`).join(' ')
  if (sizes !== 'shopping:750x750 banner:650x242 popup:720x512 push:500x250')
    bad(`lounge: 구좌 규격이 가이드와 다름 (${sizes})`)
  if (L.APP_MENUS.length !== 8) bad(`lounge: APP 메뉴가 8종이 아님 (${L.APP_MENUS.length})`)

  /* 접수번호, 기본 담당 */
  if (L.makeReqNo('2026-08-01', 3) !== 'MR-260801-03') bad('lounge: 접수번호 형식 오류')
  if (L.DEFAULT_OWNERS['백화점APP']?.main !== '이수정 선임')
    bad('lounge: 백화점APP 기본 담당이 가이드(정 이수정 선임)와 다름')

  /* 전달 양식 — 핵심 필드 누락 감시 */
  const txt = L.transferText({
    agenda: '위스키 페어', dept: '영패션팀', name: '김현대', email: 'hd@thehyundai.com',
    media: ['백화점APP'], wishDate: '2026-08-21', eventStart: '2026-08-14',
    details: { appSlot: 'push', pushType: '행사안내', landingKind: 'prism', prismNo: 'E110', prismApproved: true },
  })
  for (const k of ['위스키 페어', '영패션팀', '앱 푸시', '행사안내', '프리즘 행사카드', '승인 완료'])
    if (!txt.includes(k)) bad(`lounge: 전달 양식에 ${k} 누락`)
}

/* 14. 라운지 2차 ('26.8) — 타겟APP 스펙 재사용(media.js 단일 소스), 마감 실날짜 역산,
   전달 경로 체크리스트가 선택 상태를 정확히 반영하는지 감시 */
{
  const L = await import('../src/data/lounge.js')

  /* 타겟APP — 앱 목록은 channels.js와 동일, 스펙은 media.js에서 (K-Ride만 미등록) */
  for (const a of L.TARGET_APPS) {
    const sp = L.targetSpec(a)
    if (a === 'K-Ride') { if (sp) bad('lounge2: K-Ride가 media.js에 있는데 미등록 처리 중'); continue }
    if (!sp) bad(`lounge2: 타겟 앱 ${a}의 스펙이 media.js에 없음`)
    else if (!L.leadDaysOf(sp)) bad(`lounge2: ${a} 리드타임(D-N) 파싱 실패 (${sp.lead})`)
  }
  const ml = L.maxTargetLead(['아파트너', '위버스', '바이비'])
  if (!ml || ml.need !== 20 || ml.from !== '위버스')
    bad(`lounge2: 최장 리드타임 계산 오류 (${ml?.from} ${ml?.need})`)
  if (!L.targetCaution('데일리샷')) bad('lounge2: 데일리샷 주류 검수 주의가 사라짐')
  if (L.targetCaution('아파트너')) bad('lounge2: 아파트너에 주류 주의가 붙음')
  const ps = L.parseSize('1080 × 720')
  if (!ps || ps.w !== 1080 || ps.h !== 720) bad('lounge2: 지면 규격 파싱 오류')

  /* 마감 실날짜 — 8/21(금) 게시, D-5 영업일이면 광복절 연휴(15~17)를 건너 8/13(목) */
  const due = L.bizDeadline('2026-08-21', 5)
  if (due !== '2026-08-13') bad(`lounge2: 마감 역산 오류 (기대 2026-08-13, 실제 ${due})`)
  if (L.bizDaysBetween(due, '2026-08-21') !== 5) bad('lounge2: 역산 마감이 영업일 수와 안 맞음')
  if (L.fmtKday('2026-08-13') !== '8/13(목)') bad(`lounge2: 요일 표기 오류 (${L.fmtKday('2026-08-13')})`)

  /* 전달 경로 체크리스트 — 선택 상태별 later 항목 */
  const p1 = L.handoffPlan({
    appSlot: 'push', ready: 'done', wishDate: '2026-08-21',
    sources: [], sourceLink: '', sourceLater: false,
    hasPlan: true, audienceKind: 'excel', landingKind: 'prism', prismApproved: false,
  })
  const labels = p1.later.map(l => l.label).join('|')
  for (const k of ['완성 소재', '계획안', '타겟 고객번호', '행사카드'])
    if (!labels.includes(k)) bad(`lounge2: 전달 체크리스트에 ${k} 누락 (${labels})`)
  const mat = p1.later.find(l => l.label === '완성 소재')
  if (mat?.due !== '2026-08-18') bad(`lounge2: 완성 소재 마감 오류 (기대 2026-08-18, 실제 ${mat?.due})`)

  const p2 = L.handoffPlan({
    targetApps: ['위버스'], wishDate: '2026-08-21',
    sources: [{ name: 'a.jpg' }], sourceLink: '', sourceLater: false,
    hasPlan: false, audienceKind: '', landingKind: '', prismApproved: false,
  })
  if (p2.later.some(l => l.label === '완성 소재')) bad('lounge2: 소재를 이미 첨부했는데 따로 전달 목록에 남음')
  if (!p2.now.some(n => n.includes('브랜드 소스'))) bad('lounge2: 첨부한 소스가 접수 목록에 없음')

  /* 전달 양식 — 타겟 앱과 소재 마감 병기 */
  const txt = L.transferText({
    agenda: '썸머위크', dept: '아울렛기획팀', name: '이썸머', email: 's@thehyundai.com',
    media: ['타겟APP'], wishDate: '2026-08-21', reqNo: 'MR-260801-02',
    details: { targetApps: ['아파트너', '위버스'] },
  })
  if (!txt.includes('타겟 앱: 아파트너, 위버스')) bad('lounge2: 전달 양식에 타겟 앱 누락')
  if (!txt.includes('소재 마감:') || !txt.includes('위버스 D-20')) bad('lounge2: 전달 양식에 소재 마감 누락')

  /* 결과 회신 — 수치 있는 매체만 싣고 나머지는 집계 확인 중 (날조 금지) */
  const reply = L.resultReply(
    { agenda: '위스키 페어', dept: '영패션팀', name: '김현대', reqNo: 'MR-260801-01',
      media: ['인스타', '버스광고'], wishDate: '2026-08-21', owner: '이수정 선임', details: {} },
    { rows: [
      { ch: '인스타', label: '인스타', exp: 12345, act: 678, note: '' },
      { ch: '버스광고', label: 'BUS', exp: null, act: null, note: '' },
    ], pending: ['BUS'] },
    'https://mirror.example/#lounge',
  )
  for (const k of ['집행 결과 회신', '인스타: 노출 12,345, 반응 678', '집계 확인 중: BUS', '담당: 미디어콘텐츠팀 이수정 선임'])
    if (!reply.includes(k)) bad(`lounge2: 결과 회신에 ${k} 누락`)
  const empty = L.resultReply({ agenda: 'a', dept: 'b', name: 'c', media: [], details: {} }, null, '')
  if (!empty.includes('성과: 집계 확인 중')) bad('lounge2: 성과 없음 회신 문구 누락')
}

/* 15. 라운지 공개 보드 뷰 ('26.8 전사 공개) — 무로그인 보드에 개인정보와 내부 정보가
   새지 않는지 SQL 정의를 직접 감시 (뷰에 컬럼 하나 추가하는 실수가 곧 유출) */
{
  const fs = await import('node:fs')
  const sql = fs.readFileSync(new URL('../data/lounge-setup.sql', import.meta.url), 'utf8')
  const m = sql.match(/create or replace view lounge_board as([\s\S]*?);/)
  if (!m) bad('lounge3: lounge-setup.sql에 공개 보드 뷰 정의가 없음')
  else {
    const view = m[1]
    /* linked_events는 의도적 포함 — 미러 캘린더에서 이미 anon 공개인 일정의 id뿐 (결과 이미지용) */
    for (const col of ['email', 'details', 'sources', 'source_link', 'reject_reason', 'memo'])
      if (new RegExp(`\\b${col}\\b`).test(view)) bad(`lounge3: 공개 보드 뷰에 비공개 컬럼 ${col}이 들어감`)
    for (const col of ['agenda', 'status', 'dept'])
      if (!new RegExp(`\\b${col}\\b`).test(view)) bad(`lounge3: 공개 보드 뷰에 ${col} 누락`)
    if (!/grant select on lounge_board to anon/.test(sql)) bad('lounge3: 보드 뷰 anon 권한 부여 누락')
  }
}

/* 16. 라운지 초기 시드 ('26.8.1 팀즈 이력 16건) — 소급 입력 SQL이 실제 스키마와
   맞는지, 지어낸 값(이메일)이 섞이지 않았는지 감시 */
{
  const fs = await import('node:fs')
  const sql = fs.readFileSync(new URL('../data/lounge-seed.sql', import.meta.url), 'utf8')
  const { CHANNELS } = await import('../src/data/channels.js')
  const L = await import('../src/data/lounge.js')

  if (!/^\s*delete from media_requests where req_no like 'MR-260801-%';/m.test(sql))
    bad('seed: 재실행 안전을 위한 delete 선행이 없음')

  const nos = [...sql.matchAll(/\('(MR-260801-\d\d)'/g)].map(m => m[1])
  if (nos.length !== 16) bad(`seed: 접수번호 행이 16건이 아님 (${nos.length})`)
  if (new Set(nos).size !== nos.length) bad('seed: 접수번호 중복')

  /* 이메일은 팀즈 원문에 없다 — 지어낸 주소가 들어가면 실패 */
  if (/@(thehyundai|hmall)\.com'/.test(sql.split('insert into')[1] || ''))
    bad('seed: 원문에 없는 이메일이 들어감 (지어내지 않기로 함)')

  /* 매체 id와 타겟 앱 이름이 실제 목록에 있는지 */
  const ids = new Set(CHANNELS.map(c => c.id))
  const mediaCells = [...sql.matchAll(/'\[((?:"[^"]+",?)+)\]'::jsonb\s*,\s*\n?\s*(?:'\d{4}-\d\d-\d\d'|null)/g)]
  if (mediaCells.length !== 16) bad(`seed: 희망 매체 열을 16건 찾지 못함 (${mediaCells.length})`)
  for (const m of mediaCells) {
    for (const v of m[1].split(',').map(s => s.replace(/"/g, '').trim()))
      if (!ids.has(v)) bad(`seed: 알 수 없는 매체 id ${v}`)
  }

  /* 열 개수 대조 — 값 개수가 하나만 어긋나도 Supabase에서 통째로 실패한다.
     문자열과 jsonb 안의 쉼표는 세지 않도록 따옴표를 추적하며 최상위 쉼표만 센다 */
  const bare = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n')   // 주석 속 괄호 제외
  const head = bare.match(/insert into media_requests\s*\(([\s\S]*?)\)\s*values/)
  const cols = head[1].split(',').map(s => s.trim()).filter(Boolean).length
  const body = bare.slice(head.index + head[0].length)
  let depth = 0, q = false, cells = 1, tuples = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (q) { if (c === "'") { if (body[i + 1] === "'") i++; else q = false } continue }
    if (c === "'") { q = true; continue }
    if (c === '(') { if (depth === 0) cells = 1; depth++; continue }
    if (c === ')') {
      depth--
      if (depth === 0) {
        tuples++
        if (cells !== cols) bad(`seed: ${tuples}번째 행의 값 개수 ${cells}, 열 개수 ${cols}`)
      }
      continue
    }
    if (c === ',' && depth === 1) cells++
    if (c === ';' && depth === 0) break
  }
  if (tuples !== 16) bad(`seed: values 행이 16건이 아님 (${tuples})`)
  for (const m of sql.matchAll(/"targetApps":\[([^\]]+)\]/g)) {
    for (const v of m[1].split(',').map(s => s.replace(/"/g, '').trim()))
      if (!L.TARGET_APPS.includes(v)) bad(`seed: 알 수 없는 타겟 앱 ${v}`)
  }
  for (const m of sql.matchAll(/"appSlot":"([^"]+)"/g))
    if (!L.appSlotById(m[1])) bad(`seed: 알 수 없는 구좌 ${m[1]}`)

  /* 상태는 파이프라인 값만 */
  const OK = new Set([...L.LOUNGE_STATUS, L.STATUS_REJECT])
  for (const m of sql.matchAll(/,\s*'(접수|협의|확정|게시 완료|반려|[가-힣 ]+)',\s*\n?\s*'팀즈 소급 입력/g))
    if (!OK.has(m[1])) bad(`seed: 알 수 없는 상태 ${m[1]}`)

  /* 날짜는 ISO, 게시 종료가 시작보다 앞서면 안 됨 */
  const rows = sql.split(/\('MR-260801-/).slice(1)
  for (const r of rows) {
    const ds = [...r.matchAll(/'(\d{4}-\d\d-\d\d)'/g)].map(m => m[1])
    for (const d of ds) if (Number.isNaN(Date.parse(d))) bad(`seed: 날짜 형식 오류 ${d}`)
  }
}


/* 17. 내 일정 ('26.8) — 개인 데이터가 새는 경로와 하네스 누락을 감시.
   ① 개인 데이터는 my_* 테이블에만 (media_events는 미러가 열리면 무로그인 공개)
   ② owner-or-shared RLS가 세 테이블 모두에 걸려 있을 것
   ③ config.js의 export가 늘면 smoke.mjs 스텁도 함께 늘 것 (빠지면 빌드가 깨진다) */
{
  const sql = readFileSync(new URL('../data/mytask-setup.sql', import.meta.url), 'utf8')
  for (const t of ['my_spaces', 'my_todos', 'my_events']) {
    if (!new RegExp(`create table if not exists ${t}`).test(sql)) bad(`mytask: ${t} 테이블 정의 없음`)
    if (!new RegExp(`alter table ${t} enable row level security`).test(sql)) bad(`mytask: ${t} RLS 미적용`)
  }
  /* 정책은 재실행 안전해야 함 — 사용자가 SQL을 두 번 돌려도 실패하지 않게 */
  const creates = [...sql.matchAll(/create policy "([^"]+)"/g)].map(m => m[1])
  const drops = new Set([...sql.matchAll(/drop policy if exists "([^"]+)"/g)].map(m => m[1]))
  for (const c of creates) if (!drops.has(c)) bad(`mytask: 정책 "${c}"에 drop if exists가 없음 (재실행 시 실패)`)
  /* 공유 대상만 읽는 구조 — using (true)가 하나라도 있으면 팀 전체에 열린다 */
  if (/for select to authenticated\s*\n?\s*using \(true\)/.test(sql))
    bad('mytask: select 정책이 using (true) — 개인 데이터가 로그인 전체에 열림')
  for (const t of ['my_todos', 'my_events'])
    if (!new RegExp(`on ${t} for select[\\s\\S]{0,120}any\\(shared_with\\)`).test(sql))
      bad(`mytask: ${t} 읽기 정책에 shared_with 조건이 없음`)

  const page = readFileSync(new URL('../src/MyTaskPage.jsx', import.meta.url), 'utf8')
  /* 개인 데이터를 media_events에 쓰는 경로는 팀 연동(createEvent)뿐 — 메모는 넘기지 않는다 */
  if (/createEvent\(\{[^}]*memo:\s*ev\.memo/.test(page))
    bad('mytask: 팀 캘린더 연동이 개인 메모를 media_events로 넘김 (미러 무로그인 공개)')
  if (/window\.(prompt|confirm)\(/.test(page))
    bad('mytask: 네이티브 prompt·confirm 사용 (환경별 차단 이력으로 금지)')
  /* 드래그 함정 — click 억제와 pointercancel 정리가 빠지면 시안에서 겪은 버그가 되돌아온다 */
  if (!/pointercancel/.test(page)) bad('mytask: pointercancel 정리 없음 (리스너가 남고 상태가 굳는다)')
  if (!/suppress/.test(page)) bad('mytask: 드래그 직후 click 억제 없음 (상세가 저절로 열린다)')

  const cal = readFileSync(new URL('../src/CalendarPage.jsx', import.meta.url), 'utf8')
  if (!/pointercancel/.test(cal)) bad('매체 캘린더 드래그에 pointercancel 정리 없음')

  /* 첨부 이미지는 비공개 버킷 — event-images(공개)를 쓰면 링크만 알면 열린다 */
  if (!/insert into storage\.buckets \(id, name, public\) values \('mytask-img', 'mytask-img', false\)/.test(sql))
    bad('mytask: mytask-img 버킷이 비공개로 생성되지 않음')
  for (const kind of ['insert', 'read', 'delete'])
    if (!new RegExp(`"mytask img ${kind}"[\\s\\S]{0,220}storage\\.foldername\\(name\\)\\)\\[1\\]`).test(sql))
      bad(`mytask: mytask-img ${kind} 정책에 소유자 폴더 조건이 없음 (남의 첨부가 열린다)`)
  const img = readFileSync(new URL('../src/lib/myTaskImages.js', import.meta.url), 'utf8')
  if (!/const BUCKET = 'mytask-img'/.test(img) || /BUCKET = 'event-images'/.test(img))
    bad('mytask: 첨부 버킷이 mytask-img가 아님 (공개 버킷을 쓰면 링크만 알면 열린다)')
  /* 폴더 규칙은 SQL 정책과 클라이언트가 글자 그대로 같아야 한다 (다르면 업로드가 403) */
  const sqlRule = /replace\(replace\(auth\.jwt\(\)->>'email', '@', '_'\), '\.', '_'\)/.test(sql)
  const jsRule = /replace\(\/@\/g, '_'\)\.replace\(\/\\\.\/g, '_'\)/.test(img)
  if (!sqlRule || !jsRule)
    bad(`mytask: 소유자 폴더 규칙이 SQL(${sqlRule})과 myTaskImages.js(${jsRule}) 사이에서 어긋남`)
  if (!/api\s*=\s*PUBLIC_API/.test(readFileSync(new URL('../src/ImageAttach.jsx', import.meta.url), 'utf8')))
    bad('ImageAttach: 저장소 어댑터(api) 기본값이 사라짐 — 일정·RMN 첨부가 깨진다')

  /* smoke.mjs 스텁이 config.js의 export를 전부 덮는지 */
  const cfg = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8')
  const stub = readFileSync(new URL('./smoke.mjs', import.meta.url), 'utf8')
  const names = [...cfg.matchAll(/export const (\w+)/g)].map(m => m[1])
  for (const n of names)
    if (!new RegExp(`export const ${n} =`).test(stub))
      bad(`smoke.mjs 스텁에 ${n}이 없음 — 로컬 모드 빌드가 깨진다 (scripts/smoke.mjs에 한 줄 추가)`)
}

/* 18. 회의록 ('26.8) — 회의 내용은 개인 데이터급이라 새면 안 된다.
   ① my_* 와 같은 owner-or-shared RLS ② 음성 버킷은 비공개 + 소유자 폴더
   ③ 폴더 규칙이 SQL과 클라이언트에서 글자 그대로 같을 것 (다르면 업로드가 403)
   ④ 화면이 브라우저 제약을 실제로 안내할 것 (숨기면 회의가 통째로 날아간다) */
{
  const sql = readFileSync(new URL('../data/minutes-setup.sql', import.meta.url), 'utf8')
  if (!/create table if not exists meeting_minutes/.test(sql)) bad('minutes: 테이블 정의 없음')
  if (!/alter table meeting_minutes enable row level security/.test(sql)) bad('minutes: RLS 미적용')
  if (!/on meeting_minutes for select[\s\S]{0,120}any\(shared_with\)/.test(sql))
    bad('minutes: 읽기 정책에 shared_with 조건이 없음')
  if (/for select to authenticated\s*\n?\s*using \(true\)/.test(sql))
    bad('minutes: select 정책이 using (true) — 남의 회의 내용이 로그인 전체에 열림')
  const creates = [...sql.matchAll(/create policy "([^"]+)"/g)].map(m => m[1])
  const drops = new Set([...sql.matchAll(/drop policy if exists "([^"]+)"/g)].map(m => m[1]))
  for (const c of creates) if (!drops.has(c)) bad(`minutes: 정책 "${c}"에 drop if exists가 없음 (재실행 시 실패)`)
  if (!/values \('minutes-audio', 'minutes-audio', false\)/.test(sql))
    bad('minutes: 음성 버킷이 비공개로 생성되지 않음')
  for (const kind of ['insert', 'read', 'delete'])
    if (!new RegExp(`"minutes audio ${kind}"[\\s\\S]{0,220}storage\\.foldername\\(name\\)\\)\\[1\\]`).test(sql))
      bad(`minutes: 음성 ${kind} 정책에 소유자 폴더 조건이 없음 (남의 회의 녹음이 열린다)`)

  const store = readFileSync(new URL('../src/lib/minutesStore.js', import.meta.url), 'utf8')
  if (!/const BUCKET = 'minutes-audio'/.test(store)) bad('minutes: 음성 버킷 이름이 minutes-audio가 아님')
  const sqlRule = /replace\(replace\(auth\.jwt\(\)->>'email', '@', '_'\), '\.', '_'\)/.test(sql)
  const jsRule = /replace\(\/@\/g, '_'\)\.replace\(\/\\\.\/g, '_'\)/.test(store)
  if (!sqlRule || !jsRule)
    bad(`minutes: 소유자 폴더 규칙이 SQL(${sqlRule})과 minutesStore.js(${jsRule}) 사이에서 어긋남`)

  /* 브라우저 제약 안내 — 이게 빠지면 회의 한 건이 통째로 날아간다 */
  const page = readFileSync(new URL('../src/MinutesPage.jsx', import.meta.url), 'utf8')
  for (const [what, re] of [
    ['크롬 전용 안내', /크롬 계열/],
    ['화면 잠금 경고', /잠기면 녹음이 끊깁니다/],
    ['외부 전송 고지', /구글 서버로 보내서/],
  ]) if (!re.test(page)) bad(`minutes: 녹음 전 안내에 ${what}가 없음`)

  const rec = readFileSync(new URL('../src/lib/recorder.js', import.meta.url), 'utf8')
  /* 자동 재시작이 없으면 조용해진 순간부터 전사가 통째로 빈다 */
  if (!/onend[\s\S]{0,120}stopped\.current[\s\S]{0,60}start\(\)/.test(rec))
    bad('minutes: 음성 인식 자동 재시작 없음 (조용해지면 전사가 끊긴다)')
  /* 종료 시 화면 상태를 읽으면 마지막 문장이 빠진다 */
  if (!/textRef\.current/.test(rec)) bad('minutes: 종료 시 최신 전사문을 ref로 읽지 않음')
  if (!/beforeunload/.test(rec)) bad('minutes: 녹음 중 탭 닫기 경고 없음')
  /* 일시정지 후 종료가 브라우저 stop 이벤트를 영영 못 받으면 "저장 중"에 무한정
     멈춘다 ('26.8 사용자 리포트로 실측) — 강제 완료 타임아웃이 없으면 회귀 */
  if (!/setTimeout\(finalize/.test(rec))
    bad('minutes: 종료 시 stop 이벤트 안전장치(타임아웃) 없음 — 브라우저가 신호를 안 주면 무한 대기')

  /* 요약 함수는 전사문을 저장하지 않고 응답으로만 돌려준다 */
  const fn = readFileSync(new URL('../api/minutes-summarize.js', import.meta.url), 'utf8')
  if (!/ANTHROPIC_API_KEY/.test(fn) || !/503/.test(fn))
    bad('minutes: 요약 함수에 키 미설정 안내가 없음')
  if (!/output_config/.test(fn)) bad('minutes: 요약 함수가 구조화 출력을 쓰지 않음')
}

/* 19. CSS 변수 ('26.8.8 사고) — 정의되지 않은 var()를 쓰면 그 속성이 통째로 무효가 된다.
   background에 걸리면 배경이 투명이 되어 흰 글씨가 흰 패널 위에 찍혀 버튼이 사라진다
   (회의록 "녹음 종료"가 실제로 안 보였던 원인 — --clay 라는 변수는 없었고 --red 였다).
   :root 에 선언된 이름만 쓰였는지 전수 검사 */
{
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const declared = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]))
  /* 컴포넌트가 인라인 style로 넣어 주는 변수도 선언으로 친다 (예: 차트 색 --c) */
  for (const f of readdirSync(new URL('../src', import.meta.url))) {
    if (!f.endsWith('.jsx')) continue
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
    for (const m of src.matchAll(/'(--[a-zA-Z0-9-]+)'\s*:/g)) declared.add(m[1])
  }
  /* 폴백이 있는 var(--x, 값)은 무효가 되지 않으므로 제외 */
  const used = [...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g)]
    .filter(m => m[2] === ')').map(m => m[1])
  const missing = [...new Set(used)].filter(v => !declared.has(v))
  if (missing.length)
    bad(`index.css: 정의되지 않은 CSS 변수 ${missing.join(', ')} — 그 속성이 통째로 무효가 되어 배경이나 색이 사라진다`)
}


/* 20. 내 일정 판정 로직 ('26.8.8 전면 개선) — 화면에서 눈으로 못 잡는 것들.
   전부 실제로 사용자가 겪던 증상이라 회귀하면 바로 티가 난다 */
{
  const D = '2026-08-10'

  /* 20-a. 겹침 — 배경 일정(팀·매체·촬영)은 구조상 시각이 없다.
     예전 판정은 "한쪽이라도 시각이 없으면 겹침"이라, 매체 일정이 있는 날이면
     내 일정 전부에 빨간 경고가 붙었다 (매체 캘린더는 거의 매일 일정이 있다) */
  if (overlaps({ time: '14:00', dur: 60 }, { time: null, dur: 0 }))
    bad('myTask overlaps: 시각 없는 배경 일정을 겹침으로 판정 — 모든 개인 일정에 경고가 붙는다')
  if (!overlaps({ time: '14:00', dur: 60 }, { time: '14:30', dur: 60 }))
    bad('myTask overlaps: 실제로 겹치는 두 시각을 못 잡음')
  if (overlaps({ time: '14:00', dur: 60 }, { time: '15:00', dur: 60 }))
    bad('myTask overlaps: 맞닿기만 한 두 일정을 겹침으로 판정')

  /* 20-b. 내 일정끼리의 이중 예약 — 개인 캘린더에서 가장 필요한 검사인데
     예전에는 "상대가 내 일정이 아닐 것" 조건이 있어 조용히 지나갔다 */
  const dbl = findClashes({
    [D]: [
      { id: 'a', kind: 'mine', time: '14:00', dur: 60 },
      { id: 'b', kind: 'mine', time: '14:30', dur: 60 },
    ],
  })
  if (dbl.length !== 1) bad('myTask findClashes: 내 일정끼리의 이중 예약을 못 잡음')

  /* 배경끼리는 서로 겹쳐도 내 일정과 무관하므로 보고하지 않는다 */
  if (findClashes({ [D]: [
    { id: 'x', kind: '매체', time: '14:00', dur: 60 },
    { id: 'y', kind: '팀', time: '14:30', dur: 60 },
  ] }).length)
    bad('myTask findClashes: 내 일정과 무관한 배경끼리의 겹침을 보고함')

  /* 20-c. 주간 자리 계산 — 09:00~11:00과 10:00은 시(hour) 칸이 달라 예전에는
     둘 다 전체 폭이었고, 나중에 그려지는 10시 것이 09시 것의 아래 절반을 덮어
     클릭조차 안 됐다. 실제 시간 겹침 기준으로 열을 나눠야 한다 */
  const laid = layoutDay([
    { id: 'long', time: '09:00', dur: 120 },
    { id: 'mid', time: '10:00', dur: 60 },
  ])
  if (laid.length !== 2 || laid.some(it => it.n !== 2))
    bad('myTask layoutDay: 시(hour)가 다른 겹침에서 폭을 안 나눔 — 아래 칩이 덮여 클릭 불가')
  if (new Set(laid.map(it => it.col)).size !== 2)
    bad('myTask layoutDay: 겹치는 두 일정에 같은 열을 배정')

  /* 겹치지 않는 두 건은 각자 전체 폭을 써야 한다 */
  const apart = layoutDay([
    { id: 'a', time: '09:00', dur: 60 },
    { id: 'b', time: '13:00', dur: 60 },
  ])
  if (apart.some(it => it.n !== 1))
    bad('myTask layoutDay: 겹치지 않는 일정끼리 폭을 나눔')

  /* 20-d. 기간 배경 — 예전엔 시작일 하루만 떠서, 8/1~8/20 매체 집행이 8/2에는
     안 보였다. "겹치는지 확인"이라는 이 탭의 목적 자체가 성립하지 않았다 */
  const span = expandBg(
    [{ id: 'm', title: '여름 행사', date: '2026-08-01', endDate: '2026-08-05', kind: '매체' }],
    '2026-08-01', '2026-08-31')
  if (span.length !== 5) bad(`myTask expandBg: 기간 일정이 ${span.length}일로 펼쳐짐 (5일이어야 함)`)
  if (span[0].span !== 'start' || span[4].span !== 'end')
    bad('myTask expandBg: 기간 일정의 시작과 끝 표시가 없음')

  /* 보고 있는 기간 밖은 잘라낸다 — 전 기간을 펼치면 칩이 수천 개가 된다 */
  const clipped = expandBg(
    [{ id: 'm', title: '연간', date: '2026-01-01', endDate: '2026-12-31', kind: '매체' }],
    '2026-08-01', '2026-08-07')
  if (clipped.length !== 7) bad(`myTask expandBg: 보이는 기간 밖을 안 잘라냄 (${clipped.length}건)`)

  /* 휴점은 배경 칩이 아니라 셀 틴트로 쓴다 */
  if (expandBg([{ id: 'c', date: D, kind: '휴점' }], D, D).length)
    bad('myTask expandBg: 휴점을 일정 칩으로 만듦')

  /* 20-e. 주간 시간 범위 — 8~20시 고정이던 시절 07시와 21시 일정은 종일 줄에도
     시각 줄에도 안 걸려 화면에서 통째로 사라졌다 */
  const hs = hoursFor([{ time: '07:30', dur: 60 }, { time: '21:00', dur: 60 }])
  if (hs[0] !== 7) bad('myTask hoursFor: 업무 시간 이전 일정이 표시 범위 밖')
  if (hs[hs.length - 1] < 21) bad('myTask hoursFor: 업무 시간 이후 일정이 표시 범위 밖')
  const base = hoursFor([{ time: '10:00', dur: 60 }])
  if (base[0] !== 8 || base[base.length - 1] !== 20)
    bad('myTask hoursFor: 업무 시간 안에서만 쓸 때 기본 범위가 8~20시가 아님')

  /* 20-f. 한 줄 입력 — 날짜가 잡히면 일정, 아니면 할 일.
     이게 폰에서 일정을 만드는 주 경로다 (드래그 없이) */
  const T = new Date(2026, 7, 10)          // 2026-08-10 월요일
  const cases = [
    ['내일 15시 임원 보고 1시간', { date: '2026-08-11', time: '15:00', dur: 60, title: '임원 보고' }],
    ['8/20 오후 3시 정기 회의 90분', { date: '2026-08-20', time: '15:00', dur: 90, title: '정기 회의' }],
    ['9월 1일 촬영 준비', { date: '2026-09-01', time: null, dur: null, title: '촬영 준비' }],
    ['보도자료 초안 검토', { date: null, time: null, dur: null, title: '보도자료 초안 검토' }],
    ['오늘 9시반 스탠드업', { date: '2026-08-10', time: '09:30', title: '스탠드업' }],
  ]
  for (const [input, want] of cases) {
    const got = parseLine(input, T)
    for (const [k, v] of Object.entries(want)) {
      if (got[k] !== v)
        bad(`myTask parseLine("${input}") ${k}가 ${JSON.stringify(got[k])} (${JSON.stringify(v)}여야 함)`)
    }
  }

  /* 스페이스 태그는 캠페인 #문법과 같은 결 — 제목에서 빠져야 한다 */
  const tagged = parseLine('기획안 정리 #기획', T)
  if (tagged.tag !== '기획') bad('myTask parseLine: #스페이스 태그를 못 읽음')
  if (/#/.test(tagged.title)) bad('myTask parseLine: 제목에 #태그가 남음')

  /* 맨숫자를 시각으로 보면 안 된다 — "2안 검토"의 2가 걸리면 엉뚱한 시각이 붙는다 */
  if (parseLine('2안 검토', T).time) bad('myTask parseLine: 맨숫자를 시각으로 오인')
  /* "1시간"의 1을 시각으로 오인하지 않아야 한다 */
  const durOnly = parseLine('내일 회의 2시간', T)
  if (durOnly.time) bad('myTask parseLine: 소요 시간의 숫자를 시각으로 오인')
  if (durOnly.dur !== 120) bad('myTask parseLine: 소요 시간을 못 읽음')
}

/* 21. 촬영일정 탭 병합 ('26.8.8) — 별도 탭이던 촬영 스케줄을 콘텐츠 캘린더 안
   매체/촬영 세그로 흡수. 미러·외부에 촬영 세그가 새는 것이 가장 큰 리스크라 그 경로를 감시 */
{
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const cal = readFileSync(new URL('../src/CalendarPage.jsx', import.meta.url), 'utf8')

  if (/tab === 'shoot'/.test(app))
    bad('App.jsx: 병합 후에도 옛 shoot 탭 분기가 남음 (죽은 라우트)')
  if (!/#shoot['"]\s*\)\s*return\s*'calendar'/.test(app))
    bad('App.jsx: #shoot 딥링크가 콘텐츠 캘린더로 안 이어짐 (북마크 깨짐)')
  /* 세그 강제 — readOnly(미러)나 team이면 mode 값과 무관하게 항상 매체여야 한다 */
  if (!/const shoot = !team && !readOnly && mode === 'shoot'/.test(cal))
    bad('CalendarPage.jsx: shoot 파생식이 안 보임 (readOnly·team 강제 조건이 풀렸을 수 있음)')
  if (!/\{!team && !readOnly && \(/.test(cal))
    bad('CalendarPage.jsx: 매체/촬영 세그 버튼이 readOnly·team 조건 없이 렌더될 위험')
}

/* 22. AI 어시스턴트 ('26.8.8 구현 착수) — 사용자 지시로 1차는 본인 계정만.
   화면 게이트(App.jsx)는 편의일 뿐이라 우회 가능 — 실제 차단은 서버(api/assistant.js)에
   있어야 한다. 두 곳 다 있는지, 미러·외부에는 아예 노출 경로가 없는지 감시 */
{
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../api/assistant.js', import.meta.url), 'utf8')
  const mirror = readFileSync(new URL('../src/MirrorApp.jsx', import.meta.url), 'utf8')

  if (!/ASSISTANT_EMAILS/.test(app))
    bad('App.jsx: AI 어시스턴트 탭에 ASSISTANT_EMAILS 게이트가 없음')
  if (!/ASSISTANT_EMAILS/.test(api))
    bad('api/assistant.js: 서버 쪽 이메일 검사가 없음 (화면 게이트만으로는 우회 가능)')
  if (!/ANTHROPIC_API_KEY/.test(api) || !/503/.test(api))
    bad('api/assistant.js: 키 미설정 안내가 없음')
  if (!/모델이 답변을 거절/.test(api) && !/refusal/.test(api))
    bad('api/assistant.js: 모델 거절(stop_reason) 처리가 없음')
  /* 비용 폭주 방지선 — 전체 일 상한과 사용자별 상한 둘 다 있어야 한다 */
  if (!/overDailyCap/.test(api) || !/overUserCap/.test(api))
    bad('api/assistant.js: 사용량 상한 로직이 빠짐 (비용 폭주 방지선 없음)')
  if (/AssistantPage/.test(mirror))
    bad('MirrorApp.jsx: 미러에 AI 어시스턴트가 노출될 경로가 생김')

  /* 2차 확장 ('26.8.8 — 사이트 전체 데이터로 확대, 도구 호출 방식) 감시.
     ① 읽기 전용 — Supabase에 쓰기 메서드가 전혀 없어야 한다(등록·수정·삭제 금지 원칙)
     ② 개인 데이터(my_*)는 서비스 키가 아니라 요청자 본인 토큰으로만 — 서비스 키 참조가
        이 파일에 있으면 RLS를 우회해 다른 사람 데이터가 섞일 수 있다
     ③ 모델↔도구 왕복에 상한이 있어야 한다(비용·지연 폭주 방지)
     ④ 8개 도구가 전부 등록돼 있는지 — 하나라도 빠지면 그 도메인은 "사이트 데이터 전체"에서
        조용히 누락된다 */
  /* 이 코드베이스의 쓰기 패턴은 PATCH(수정)·DELETE(삭제)·Prefer:return=representation
     (생성 후 응답 반환, rmnStore·settleStore 등 POST insert에서 쓰는 관례) — 이 세 신호가
     하나도 없으면 Supabase에 쓰기가 없다는 뜻. POST 자체는 Claude API 호출에도 쓰여
     단독으로는 판별 기준이 못 된다 */
  if (/method:\s*['"](PATCH|DELETE|PUT)['"]/.test(api) || /Prefer/.test(api))
    bad('api/assistant.js: 쓰기 메서드 또는 쓰기 관례(Prefer 헤더)가 감지됨 (읽기 전용 원칙 위반)')
  if (/SUPABASE_SERVICE_KEY/.test(api))
    bad('api/assistant.js: 서비스 키 참조가 있음 (개인 데이터 RLS 우회 위험)')
  if (!/MAX_ITERS/.test(api) || !/MAX_TOOL_CALLS/.test(api))
    bad('api/assistant.js: 도구 호출 왕복·횟수 상한이 없음 (비용 폭주 방지선 없음)')
  const REQUIRED_TOOLS = [
    'search_calendar', 'search_media_specs', 'get_content_performance',
    'search_rmn_bookings', 'get_targetapp_stats', 'get_settlements',
    'search_lounge_requests', 'get_my_tasks',
  ]
  for (const t of REQUIRED_TOOLS) {
    if (!api.includes(`'${t}'`) && !api.includes(`"${t}"`))
      bad(`api/assistant.js: 도구 ${t}가 빠짐 (사이트 데이터 전체 답변 범위 축소)`)
  }
}

console.log(fail ? `\n정합성 테스트: ${fail}건 실패` : '정합성 테스트: 전부 통과')
if (fail) process.exit(1)
