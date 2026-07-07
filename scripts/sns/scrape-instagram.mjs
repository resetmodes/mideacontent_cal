/* Apify instagram-scraper 수집 (hyundai-monitor에서 이식, '26.7)
   사용법:
     node scripts/sns/scrape-instagram.mjs dosi.manual  → 한 계정만 (테스트)
     node scripts/sns/scrape-instagram.mjs              → accounts.mjs 전체
   결과: data/sns-raw/instagram/{핸들}.json (git 미추적 — 정제 후 src/data/sns만 커밋) */

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { IG_ACCOUNTS, IG_COMPETITORS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'instagram')

const ACTOR = 'apify~instagram-scraper'
const WINDOW = '3 months'      // 최근 3개월 기준 수집
const RESULTS_LIMIT = 200
const API = 'https://api.apify.com/v2'

try { process.loadEnvFile(join(ROOT, '.env')) } catch { /* CI에선 환경변수 사용 */ }
const TOKEN = process.env.APIFY_TOKEN
if (!TOKEN || TOKEN.includes('PASTE_YOUR_TOKEN')) {
  console.error('❌ APIFY_TOKEN이 없습니다. 로컬은 .env, CI는 GitHub Secret을 설정하세요.')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function scrapeAccount(handle) {
  const input = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts',
    resultsLimit: RESULTS_LIMIT,
    onlyPostsNewerThan: WINDOW,
    addParentData: true,
  }
  console.log(`\n▶ [${handle}] 수집 시작 (최근 ${WINDOW}, 최대 ${RESULTS_LIMIT}개)…`)

  const startRes = await fetch(`${API}/acts/${ACTOR}/runs?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!startRes.ok) throw new Error(`실행 시작 실패 (${startRes.status}): ${await startRes.text()}`)
  const { data: run } = await startRes.json()
  console.log(`  · run 시작됨 (id=${run.id})`)

  let status = run.status, waited = 0
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
    await sleep(5000); waited += 5
    const s = await fetch(`${API}/actor-runs/${run.id}?token=${TOKEN}`)
    status = (await s.json()).data.status
    process.stdout.write(`\r  · 진행 중… ${status} (${waited}s)   `)
  }
  console.log('')
  if (status !== 'SUCCEEDED') throw new Error(`run 종료 상태 비정상: ${status}`)

  const itemsRes = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`)
  if (!itemsRes.ok) throw new Error(`데이터셋 조회 실패 (${itemsRes.status})`)
  const items = await itemsRes.json()

  const safe = handle.replace(/[^a-z0-9_]/gi, '_')
  await writeFile(join(RAW_DIR, `${safe}.json`), JSON.stringify(items, null, 2), 'utf8')
  console.log(`  ✅ ${items.length}개 저장 → ${safe}.json`)
  return { handle, count: items.length }
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })
  const arg = process.argv[2]
  const all = [...IG_ACCOUNTS, ...IG_COMPETITORS].map(a => a.handle)
  const targets = arg ? [arg] : all

  console.log(`수집 대상 ${targets.length}개: ${targets.join(', ')}`)
  const results = []
  for (const handle of targets) {
    try { results.push(await scrapeAccount(handle)) }
    catch (e) {
      console.error(`  ❌ [${handle}] 실패: ${e.message}`)
      results.push({ handle, count: 0, error: e.message })
    }
  }

  console.log('\n=== 수집 요약 ===')
  for (const r of results) console.log(`  ${r.error ? '❌' : '✅'} ${r.handle}: ${r.count}개${r.error ? ` (${r.error})` : ''}`)
}

main()
