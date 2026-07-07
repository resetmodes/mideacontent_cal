/* SNS 지표 추이 스냅샷 축적 ('26.7) — 수집 정제 후 실행
   instagram.js/youtube.js의 핵심 지표만 뽑아 src/data/sns/trend.js에 날짜별로 누적.
   MonitorPage가 직전 스냅샷 대비 증감(▲▼)을 표시하는 데 사용.
   같은 날짜 재수집 시 그날 항목을 교체, 최대 60개(격주 기준 약 2년) 보관 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const SNS = join(ROOT, 'src', 'data', 'sns')
const OUT = join(SNS, 'trend.js')

const { IG } = await import(pathToFileURL(join(SNS, 'instagram.js')))
const { YT } = await import(pathToFileURL(join(SNS, 'youtube.js')))

const date = (IG.generatedAt || YT.generatedAt || '').slice(0, 10)
if (!date) {
  console.error('❌ generatedAt 없음 — 추이 기록 생략')
  process.exit(1)
}

let trend = []
try {
  const txt = await readFile(OUT, 'utf8')
  trend = JSON.parse(txt.slice(txt.indexOf('[')))
} catch { /* 최초 실행 — 빈 배열에서 시작 */ }

const entry = { date, ig: {}, yt: {} }
for (const a of [...(IG.accounts || []), ...(IG.competitors || [])]) {
  if (a.followers != null) entry.ig[a.handle] = { f: a.followers, e: a.engagementPer1k, p: a.postsLast30, d: !!a.dormant }
}
for (const c of YT.channels || []) {
  entry.yt[c.key] = { s: c.subscribers, v: c.avgViews }
}

trend = trend.filter(t => t.date !== date)
trend.push(entry)
trend.sort((a, b) => a.date.localeCompare(b.date))
trend = trend.slice(-60)

await writeFile(
  OUT,
  '/* 자동 생성 — scripts/sns/append-trend.mjs 로 갱신. 직접 수정 금지 */\nexport const TREND = '
  + JSON.stringify(trend, null, 1) + '\n', 'utf8'
)
console.log(`✅ src/data/sns/trend.js — 스냅샷 ${trend.length}개 (최신 ${date})`)
