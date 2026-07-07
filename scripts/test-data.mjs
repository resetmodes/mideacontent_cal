/* 데이터·설정 정합성 테스트 ('26.7 하네스)
   파일 간 참조가 어긋나면 (매체명 변경, 계정 추가 등) 조용히 깨지는 지점들을 검사.
   실행: npm run test 에 포함 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js'
import { MEDIA } from '../src/data/media.js'
import { CHANNELS, KEYWORDS, TITLE_ALIASES } from '../src/data/channels.js'
import { SPEC_LINK_MAP } from '../src/lib/specLink.js'
import { YT_KEY, IG_HANDLE } from '../src/lib/perf.js'
import { HOLIDAYS } from '../src/data/holidays.js'
import { TEAM } from '../src/data/team.js'
import { IG_ACCOUNTS, YT_CHANNELS } from './sns/accounts.mjs'

let fail = 0
const bad = msg => { fail++; console.error('✗ ' + msg) }

/* 1. config.js — 실제 키가 비어 있으면 팀 DB 연결이 끊긴 채 배포됨
   (브라우저 테스트용으로 비웠다가 복원 안 한 커밋을 잡는 검사) */
if (!/^https:\/\/[a-z]+\.supabase\.co$/.test(SUPABASE_URL))
  bad(`config.js SUPABASE_URL이 실제 값이 아님: "${SUPABASE_URL}" — 테스트용 빈 키를 복원하지 않은 것 아닌지 확인`)
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 40)
  bad('config.js SUPABASE_ANON_KEY가 비어 있거나 비정상 — 복원 필요')

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

/* 5. 공휴일 — 날짜 형식·유효성 */
for (const iso of Object.keys(HOLIDAYS)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(iso).getTime()))
    bad(`holidays.js 잘못된 날짜 키: "${iso}"`)
}

/* 6. 팀원 명단 — 이메일 형식 */
for (const email of Object.keys(TEAM)) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad(`team.js 이메일 형식 오류: "${email}"`)
  if (email !== email.toLowerCase()) bad(`team.js 이메일은 소문자로: "${email}" (authorName이 소문자로 조회)`)
}

/* 7. media.js 스키마 최소 요건 */
for (const m of MEDIA) {
  if (!m.group || !m.cat || !m.name || !m.lead) bad(`media.js "${m.name || '?'}": group/cat/name/lead 누락`)
  if (!Array.isArray(m.slots) || m.slots.length === 0) bad(`media.js "${m.name}": slots 비어 있음`)
  if (typeof m.verified !== 'boolean') bad(`media.js "${m.name}": verified는 boolean`)
}

console.log(fail ? `\n정합성 테스트: ${fail}건 실패` : '정합성 테스트: 전부 통과')
if (fail) process.exit(1)
