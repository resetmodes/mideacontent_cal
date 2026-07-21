/* RMN 결과보고서 생성 ('26.7 — GA4 파이프라인 3차의 출력 단계 선행 구현)
   부쉐론 양식 템플릿(data/templates/rmn-report.xlsx)은 자체가 수식 엔진 —
   BT(날짜)/BU(노출)/BV(클릭) 입력존만 채우면 CTR·CPM·CPC·합계 전부 자동 계산됨.

   사용:
     node scripts/rmn/build-report.mjs --mock                # 가짜 데이터로 파이프라인 검증
     node scripts/rmn/build-report.mjs --input campaign.json # GA 수집 결과로 실제 생성
   입력 JSON:
     { "advertiser": "부쉐론", "start": "2026-03-10", "end": "2026-03-23",
       "budget": "4,400만원", "products": "APP DA 패키지(...)",
       "daily": { "splash": [{ "date": "20260310", "imps": 35540, "clicks": 0 }, ...],
                  "popup": [...], "main": [...], "bottom": [...], "headline": [...] } }

   ─ 현재 14일 캠페인 전용 (양식의 Daily 블록 = 14행 고정). 다른 기간은 행 확장 로직 필요 — 3차 과제
   ─ GA4 수집(view_ad/click_ad → daily JSON)은 서비스 계정 키 확보 후 ga4-collect.mjs로 추가 예정 */
import ExcelJS from 'exceljs'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEMPLATE = join(ROOT, 'data', 'templates', 'rmn-report.xlsx')

/* 구좌별 Daily 블록 시작 행 (14행씩) — 양식 고정 좌표 */
const SLOT_ROWS = { splash: 60, popup: 80, main: 99, bottom: 118, headline: 137 }
const SUMMARY_DATE_START = 39   // E39~E52 — 일자별 Summary의 날짜(serial), Daily 블록이 참조

const args = process.argv.slice(2)
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null }

function mockInput() {
  const start = '2026-03-10'
  const daily = {}
  for (const slot of Object.keys(SLOT_ROWS)) {
    daily[slot] = Array.from({ length: 14 }, (_, i) => {
      const d = new Date('2026-03-10T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i)
      const imps = 40000 + ((i * 7919 + slot.length * 1031) % 90000)
      return { date: d.toISOString().slice(0, 10).replace(/-/g, ''), imps, clicks: slot === 'splash' ? 0 : Math.round(imps * 0.006) }
    })
  }
  return { advertiser: 'MOCK 광고주', start, end: '2026-03-23', budget: '4,400만원', products: 'APP DA 패키지(모의)', daily }
}

const input = args.includes('--mock') ? mockInput() : JSON.parse(readFileSync(opt('input'), 'utf8'))

const serial = iso => Math.round((new Date(iso + 'T00:00:00Z') - new Date('1899-12-30T00:00:00Z')) / 86400000)
const days = Math.round((new Date(input.end) - new Date(input.start)) / 86400000) + 1
if (days !== 14) {
  console.error(`✗ 캠페인 기간 ${days}일 — 현재 양식은 14일 전용 (Daily 블록 행 확장은 3차 과제)`)
  process.exit(1)
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(TEMPLATE)
const ws = wb.worksheets[0]
wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true }   // Excel이 열 때 전체 재계산

/* 캠페인 개요 치환 */
ws.getCell('P6').value = input.advertiser
ws.getCell('P7').value = `${input.start} ~ ${input.end} (${days}일)`
ws.getCell('P8').value = `${input.start} ~ ${input.end} (${days}일)`
if (input.products) ws.getCell('P11').value = input.products
if (input.budget) ws.getCell('P12').value = input.budget

/* 일자별 Summary 날짜 (Daily 블록 E열이 =E39.. 로 참조) */
for (let i = 0; i < 14; i++) {
  const d = new Date(input.start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i)
  ws.getCell(`E${SUMMARY_DATE_START + i}`).value = serial(d.toISOString().slice(0, 10))
}

/* BT/BU/BV 입력존 */
let filled = 0
for (const [slot, startRow] of Object.entries(SLOT_ROWS)) {
  const rows = input.daily[slot] || []
  if (rows.length !== 14) { console.error(`✗ ${slot}: 일자 데이터 ${rows.length}건 ≠ 14`); process.exit(1) }
  rows.forEach((r, i) => {
    ws.getCell(`BT${startRow + i}`).value = Number(r.date)
    ws.getCell(`BU${startRow + i}`).value = r.imps
    ws.getCell(`BV${startRow + i}`).value = r.clicks
    filled++
  })
}

mkdirSync(join(ROOT, 'data', 'rmn-out'), { recursive: true })
const out = opt('out') || join(ROOT, 'data', 'rmn-out', `결과보고서_${input.advertiser}_${input.start.replace(/-/g, '')}.xlsx`)
await wb.xlsx.writeFile(out)
console.log(`✓ 결과보고서 생성: ${out} (입력 ${filled}행 — CTR·CPM·CPC는 Excel이 열 때 자동 계산)`)
