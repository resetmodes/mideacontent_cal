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
import { readFileSync } from 'node:fs'
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
  RMN_PRODUCTS, slotAvailability, pushAvailability, canTentative, buildRmnNotices,
  applyDiscount, netAmount,
} from '../src/data/rmn.js'
if (RMN_PRODUCTS.length !== 7) bad('RMN 상품이 7종이 아님')
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
}

/* 6f. RMN 문서 생성 — 판매사 마스터·기준값·양식 표기·빈 템플릿 정합성 */
import { existsSync } from 'node:fs'
import { RMN_AGENCY_INFO, RMN_BENCH } from '../src/data/rmnAgencies.js'
import { RMN_AGENCIES } from '../src/data/rmn.js'
import { DOC_NAME } from '../src/lib/rmnDocs.js'
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
for (const f of ['rmn-order.xlsx', 'rmn-proposal.xlsx']) {
  if (!existsSync(new URL(`../public/templates/${f}`, import.meta.url)))
    bad(`public/templates/${f} 없음 — 청약서·제안서 다운로드가 깨짐`)
}
{ // 빈 템플릿에 원본 실데이터가 남아 있으면 안 됨 (public = 공개 URL)
  const raw = readFileSync(new URL('../public/templates/rmn-order.xlsx', import.meta.url))
  // xlsx는 압축이라 문자열 grep은 불충분 — 최소한 파일 크기 급증(원본 복귀)만 감시
  if (raw.length > 60_000) bad('rmn-order.xlsx 템플릿 크기 이상 — 실데이터 원본으로 되돌아간 것 아닌지 확인')
}

/* 6e. RMN 이관 SQL — 행 수 고정 + 날짜 형식 (역순·비ISO가 섞이면 insert가 통째로 실패) */
for (const [file, want] of [['rmn-seed.sql', 40], ['rmn-seed-2025.sql', 38]]) {
  const sql = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8')
  const inserts = sql.match(/^insert into rmn_bookings/gm) || []
  if (inserts.length !== want) bad(`${file}: 이관 ${want}건이 아님 (${inserts.length}건)`)
  for (const m of sql.matchAll(/'(\d{4}-\d{2}-\d{2})','(\d{4}-\d{2}-\d{2})'/g)) {
    if (m[2] < m[1]) bad(`${file}: 역순 기간 ${m[1]}→${m[2]}`)
  }
  if ((sql.match(/'\d{1,2}\/[^']*'/g) || []).length) bad(`${file}: 비ISO 날짜 잔존`)
}

/* 7. media.js 스키마 최소 요건 + 레퍼런스 이미지 실재 검증 ('26.7 제작 가이드 개편) */
for (const m of MEDIA) {
  if (!m.group || !m.cat || !m.name || !m.lead) bad(`media.js "${m.name || '?'}": group/cat/name/lead 누락`)
  if (!Array.isArray(m.slots) || m.slots.length === 0) bad(`media.js "${m.name}": slots 비어 있음`)
  if (typeof m.verified !== 'boolean') bad(`media.js "${m.name}": verified는 boolean`)
  if (m.visual && !existsSync(new URL(`../public/media-ref/${m.visual}`, import.meta.url)))
    bad(`media.js "${m.name}": 대표 비주얼 이미지 없음 (public/media-ref/${m.visual})`)
  for (const s of m.slots) {
    if (s.ref && !existsSync(new URL(`../public/media-ref/${s.ref}`, import.meta.url)))
      bad(`media.js "${m.name}" 지면 "${s.name}": 레퍼런스 이미지 없음 (public/media-ref/${s.ref})`)
    if (s.kind && !['이미지', '영상', '이미지·영상', '텍스트'].includes(s.kind))
      bad(`media.js "${m.name}" 지면 "${s.name}": kind "${s.kind}" 비표준`)
  }
}

console.log(fail ? `\n정합성 테스트: ${fail}건 실패` : '정합성 테스트: 전부 통과')
if (fail) process.exit(1)
