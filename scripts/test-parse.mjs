/* 빠른 입력 파서 회귀 테스트 ('26.7 하네스)
   실행: npm run test — 파서·키워드·표기 통일 수정 후 반드시 통과 확인.
   새 파싱 기능을 추가하면 여기에 케이스도 추가할 것 (깨지기 가장 쉬운 모듈) */

import { parseQuick } from '../src/lib/parse.js'

const TODAY = new Date(2026, 6, 7)   // 2026-07-07 고정 — 연도 추정 테스트 안정화
let pass = 0, fail = 0

function t(input, expected, label) {
  const r = parseQuick(input, TODAY)
  const errs = []
  for (const [k, v] of Object.entries(expected)) {
    const got = k === 'channels' ? (r.channels ? r.channels.map(c => c.channel + '/' + (c.sub || '')).join(',') : null) : r[k]
    if (got !== v) errs.push(`${k}: 기대 ${JSON.stringify(v)} ≠ 실제 ${JSON.stringify(got)}`)
  }
  if (errs.length) { fail++; console.error(`✗ ${label || input}\n    ${errs.join('\n    ')}`) }
  else { pass++ }
}

/* ── 날짜 ── */
t('12/20 크리스마스 인스타 릴스 #크리스마스',
  { date: '2026-12-20', endDate: null, channel: '인스타', sub: '공식', campaign: '크리스마스', title: '크리스마스 릴스' },
  '채널 지칭 제거 + 포맷(릴스)은 유지')
t('12/20~25 연말 팝업 카톡', { date: '2026-12-20', endDate: '2026-12-25', channel: '카카오톡' })
t('7월 10일~8월 2일 여름 행사', { date: '2026-07-10', endDate: '2026-08-02' })
t('1/5 신년 행사', { date: '2027-01-05' }, '6개월 룩백 — 지난 날짜는 내년으로')
t('오늘 인스타 스토리', { date: '2026-07-07' })
t('모레 유튜브 쇼츠', { date: '2026-07-09', channel: '유튜브' })

/* ── 매체 키워드 ── */
t('7/10 도시 신규 콘텐츠', { channel: '인스타', sub: '도시' })
t('7/10 도메 릴스', { channel: '인스타', sub: '도시', title: '도시 릴스' }, '도메 → 도시 표기 통일')
t('7/10 인스타 본계정 릴스', { channel: '인스타', sub: '공식', title: '릴스' })
t('7/10 유튜브 릴즈 크로스 업로드', { channel: '유튜브' }, '채널 직접 지칭 > 포맷 유추')
t('7/10 와지트 신규 영상', { channel: '유튜브', sub: '와지트', title: '와지트 신규 영상' }, '세부 지칭은 제목 유지')
t('7/10 아파트 LCD 소재 교체', { channel: '아파트LCD', title: '소재 교체' }, 'APT LCD 지칭 제거')
t('7/10 앱푸쉬 발송', { channel: '백화점APP', sub: '푸쉬', title: 'APP푸쉬 발송' }, 'APP푸쉬는 세부 정보 — 유지')
t('7/10 아파트앱 팝업', { channel: '타겟APP', title: '아파트앱 팝업' }, '아파트앱 identity 보호 + 유지')

/* ── 채널 지칭 제목 제거 ('26.7) ── */
t('7/17 인스타 여름테마', { channel: '인스타', title: '여름테마' }, '칩 중복 지칭 제거 (사용자 사례)')
t('7/17 인스타로 홍보 진행', { channel: '인스타', title: '인스타로 홍보 진행' }, '조사 결합은 문장 성분 — 보존')
t('7/17 인스타', { channel: '인스타', title: '인스타' }, '전부 지워지면 원제목 유지')
t('7/17 백화점앱 배너 교체', { channel: '백화점APP', title: '배너 교체' }, 'APP 광역 치환 후 제거')
t('7/17 인스타 계정 안내 카톡 발송', { channel: '인스타', title: '계정 안내 카톡 발송' }, '인식 채널 토큰만 제거 — 카톡은 유지')

/* ── 다중 매체 ── */
t('7/10 성탄 티저 인스타+유튜브+카톡 #크리스마스',
  { channels: '인스타/공식,유튜브/공식,카카오톡/', title: '성탄 티저' })
t('7/12 1+1 사은행사 인스타', { channels: null, channel: '인스타' }, '1+1은 다중 매체 아님')

/* ── 촬영/업로드 병기 ── */
t('7/10 촬영 7/15 업로드 여름 룩북 인스타 #여름',
  { shootDate: '2026-07-10', date: '2026-07-15', channel: '인스타', campaign: '여름' })
t('촬영 7/10 업로드 7월 15일 여름 룩북 유튜브',
  { shootDate: '2026-07-10', date: '2026-07-15', channel: '유튜브' }, '라벨 위치 자유')
t('7/10 촬영 여름 룩북 스케치 인스타', { shootDate: '2026-07-10', date: null }, '촬영 단독')
t('7/10 촬영 7/15 업로드 인스타+유튜브 룩북',
  { shootDate: '2026-07-10', date: '2026-07-15', channels: '인스타/공식,유튜브/공식' }, '병기 × 다중 매체')

/* ── 팀 일정 키워드 ('26.7) — TEAM_KEYWORDS + normalize:false 모드 ── */
import { TEAM_KEYWORDS } from '../src/data/channels.js'
function tm(input, expected, label) {
  const r = parseQuick(input, TODAY, { keywords: TEAM_KEYWORDS, normalize: false })
  const errs = []
  for (const [k, v] of Object.entries(expected)) {
    if (r[k] !== v) errs.push(`${k}: 기대 ${JSON.stringify(v)} ≠ 실제 ${JSON.stringify(r[k])}`)
  }
  if (errs.length) { fail++; console.error(`✗ [팀] ${label || input}\n    ${errs.join('\n    ')}`) }
  else { pass++ }
}
/* 표기 원칙 ('26.7 확정): 팀 일정 제목은 쓴 그대로 — 이름+유형이 캘린더에 그대로 보임 */
tm('7/20 김희진 연차', { date: '2026-07-20', channel: '연차', title: '김희진 연차' }, '유형 인식 + 제목 그대로')
tm('8/1~3 김상수 부산 출장', { date: '2026-08-01', endDate: '2026-08-03', channel: '출장', title: '김상수 부산 출장' })
tm('7/25 이수정 생일', { channel: '기념일', sub: '생일', title: '이수정 생일' })
tm('내일 오전 반차 노규빈', { date: '2026-07-08', channel: '반차', sub: '오전', title: '오전 반차 노규빈' })
tm('7/22 하지훈 워크샵', { channel: '교육', title: '하지훈 워크샵' }, '워크샵 → 교육')
tm('7/20 인스타 버스 교육', { channel: '교육', title: '인스타 버스 교육' }, '팀 모드는 매체 키워드·표기 통일 미적용')
tm('7/21 김상수, 정소미, 노규빈 목동 외근',
  { channel: '외근', title: '김상수, 정소미, 노규빈 목동 외근' }, '대신 등록 — 여러 이름 병기, 쓴 그대로 표기')

/* ── 결과 ── */
console.log(`\n파서 테스트: ${pass} 통과 / ${fail} 실패`)
if (fail > 0) process.exit(1)
