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

console.log(fail ? `\n리포트 테스트: ${fail}건 실패` : '리포트 테스트: 전부 통과')
if (fail) process.exit(1)
