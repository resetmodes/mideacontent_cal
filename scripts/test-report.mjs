/* 월간 리포트 집계 회귀 테스트 ('26.7 하네스)
   계약: docs/report-data-contract.md — 귀속·집계 규칙이 바뀌면 여기부터 깨져야 정상 */

import { buildMonthlyReport, snsMonthlyDelta } from '../src/lib/report.js'

let fail = 0
const eq = (got, want, label) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail++; console.error(`✗ ${label}: 기대 ${JSON.stringify(want)} ≠ 실제 ${JSON.stringify(got)}`)
  }
}

const EVENTS = [
  { date: '2026-12-01', channel: '인스타', title: 'A', campaign: '크리스마스', perfUrl: 'https://x/1' },
  { date: '2026-12-20', endDate: '2027-01-05', channel: '유튜브', title: 'B', campaign: '크리스마스' },  // 월 걸침 → 12월 귀속
  { date: '2026-12-24', channel: '카카오톡', title: 'C', campaign: null },                              // 캠페인 미지정
  { date: '2026-12-10', channel: '인스타', title: 'D촬영', campaign: '크리스마스', kind: '촬영' },       // 촬영 — 집행 제외
  { date: '2027-01-05', channel: '인스타', title: 'E', campaign: '신년' },                              // 다음 달 — 제외
]

const r = buildMonthlyReport(EVENTS, 2026, 12)
eq(r.total, 3, '집행 건수 (촬영 제외)')
eq(r.shootTotal, 1, '촬영 건수')
eq(r.confirmedTotal, 1, '실적 확정 건수')
eq(r.noCampaign, 1, '캠페인 미지정')
eq(r.byChannel, { '인스타': 1, '유튜브': 1, '카카오톡': 1 }, '매체별 건수')
eq(r.campaigns.length, 1, '캠페인 수 (12월)')
eq(r.campaigns[0].name, '크리스마스', '캠페인명')
eq(r.campaigns[0].count, 2, '캠페인 내 집행 건수 (촬영 제외)')
eq(r.campaigns[0].period, { start: '2026-12-01', end: '2027-01-05' }, '캠페인 기간 (종료일 반영)')
eq(r.campaigns[0].channels.sort(), ['유튜브', '인스타'].sort(), '캠페인 매체 믹스')
eq(r.campaigns[0].confirmed, [{ date: '2026-12-01', title: 'A', url: 'https://x/1' }], '확정 실적만')

const TREND = [
  { date: '2026-12-01', ig: { the_hyundai: { f: 1000 } }, yt: { the_hyundai: { s: 500 } } },
  { date: '2026-12-15', ig: { the_hyundai: { f: 1300 } }, yt: { the_hyundai: { s: 550 } } },
]
const d = snsMonthlyDelta(TREND, 2026, 12)
eq(d.igFollowers, { the_hyundai: 300 }, 'IG 팔로워 월간 증감')
eq(d.ytSubscribers, { the_hyundai: 50 }, 'YT 구독 월간 증감')
eq(snsMonthlyDelta(TREND.slice(0, 1), 2026, 12), null, '스냅샷 1개면 null')


/* ── 리포트 덱 계산 계층 ('26.7.31) — buildReportDeck + checkNarration ── */
const { buildReportDeck, checkNarration } = await import('../src/lib/reportDeck.js')

const DK_EVENTS = [
  { date: '2026-12-01', channel: '인스타', title: 'A', campaign: '크리스마스' },
  { date: '2026-12-05', channel: '타겟APP', title: 'B' },
  { date: '2026-12-06', channel: '타겟APP', title: 'C' },
  { date: '2026-12-07', channel: '연차', title: '휴가', kind: '팀' },      // 팀 일정 제외
  { date: '2026-12-08', channel: '유튜브', title: '촬영분', kind: '촬영' },  // 촬영 별도
  { date: '2026-11-10', channel: '인스타', title: '전월' },
  { date: '2027-01-03', channel: '유튜브', title: '다음달', campaign: '신년' },
]
const DK_YTA = { range: { start: '2026-09-01', end: '2026-12-31' }, channels: {
  main: { monthly: [
    { month: '2026-11', views: 100000, minutes: 1, subsNet: 10 },
    { month: '2026-12', views: 250000, minutes: 1, subsNet: 40 },
  ], traffic: [ { source: 'ADVERTISING', views: 90000 }, { source: 'SEARCH', views: 10000 } ] },
} }
const DK_YT = { channels: [{ key: 'main', name: '공식', isMain: true }] }

const dk = buildReportDeck({ year: 2026, month: 12, events: DK_EVENTS, yta: DK_YTA, yt: DK_YT, trend: [] })
eq(dk.summary.exec, 3, '덱 집행 = 팀·촬영 제외')
eq(dk.summary.shoots, 1, '덱 촬영 별도')
eq(dk.exec.prevTotal, 1, '덱 전월 집행')
eq(dk.exec.topChannel, ['타겟APP', 2], '덱 최다 매체')
eq(dk.campaigns.tagged, 1, '덱 태그 건수')
eq(dk.youtube.chans[0].views, 250000, '덱 유튜브 월 버킷')
eq(dk.youtube.chans[0].delta, 150, '덱 유튜브 증감률 (코드 계산)')
eq(dk.traffic.topShare, 90, '덱 유입 1위 비중')
eq(dk.instagram, null, '스냅샷 없으면 인스타 슬라이드 생략')
eq(dk.target, null, '실적 없으면 타겟APP 슬라이드 생략')
eq(dk.next.total, 1, '덱 다음 달 예정')
if (!dk.digest.includes('25.0만')) { console.log('✗ digest에 유튜브 조회 없음'); fail++ }
else console.log('✓ digest에 유튜브 조회 포함')

/* 서술 검증 — digest 에 있는 숫자만 통과 */
eq(checkNarration('집행 3건 중 타겟APP 2건입니다.', dk.digest), [], '서술 검증: digest 숫자 통과')
eq(checkNarration('조회가 999만으로 늘었습니다.', dk.digest), ['999'], '서술 검증: 날조 숫자 검출')
eq(checkNarration('12월과 1월, 2026년', dk.digest), [], '서술 검증: 월·연도 허용')

console.log(fail ? `\n리포트 테스트: ${fail}건 실패` : '리포트 테스트: 전부 통과')
if (fail) process.exit(1)
