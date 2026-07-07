/* YouTube 수집 (streamers/youtube-channel-scraper — hyundai-monitor에서 이식, '26.7)
   사용법:
     node scripts/sns/scrape-youtube.mjs the_hyundai  → 한 채널만 (테스트)
     node scripts/sns/scrape-youtube.mjs              → accounts.mjs 전체
   결과: data/sns-raw/youtube/{key}.json */

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { YT_CHANNELS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'youtube')

const ACTOR = 'streamers~youtube-channel-scraper'
const MAX_VIDEOS = 30
const MAX_SHORTS = 20
const API = 'https://api.apify.com/v2'

try { process.loadEnvFile(join(ROOT, '.env')) } catch { /* CI: 환경변수 */ }
const TOKEN = process.env.APIFY_TOKEN
if (!TOKEN || TOKEN.includes('PASTE_YOUR_TOKEN')) {
  console.error('❌ APIFY_TOKEN이 없습니다. 로컬은 .env, CI는 GitHub Secret을 설정하세요.')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function scrapeChannel(key, url) {
  const input = {
    startUrls: [{ url }],
    maxResults: MAX_VIDEOS,
    maxResultsShorts: MAX_SHORTS,
    maxResultStreams: 0,
    sortVideosBy: 'NEWEST',
  }
  console.log(`\n▶ [${key}] 수집 시작 (${url})…`)

  const startRes = await fetch(`${API}/acts/${ACTOR}/runs?token=${TOKEN}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
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
  if (status !== 'SUCCEEDED') throw new Error(`run 상태 비정상: ${status}`)

  const itemsRes = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true&format=json`)
  if (!itemsRes.ok) throw new Error(`데이터셋 조회 실패 (${itemsRes.status})`)
  const items = await itemsRes.json()

  await writeFile(join(RAW_DIR, `${key}.json`), JSON.stringify(items, null, 2), 'utf8')
  console.log(`  ✅ ${items.length}개 영상 저장 → ${key}.json`)
  return { key, count: items.length }
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })
  const arg = process.argv[2]
  const targets = arg ? [arg] : YT_CHANNELS.map(c => c.key)

  const results = []
  for (const key of targets) {
    const ch = YT_CHANNELS.find(c => c.key === key)
    if (!ch) { console.error(`❌ 알 수 없는 채널 key: ${key}`); continue }
    try { results.push(await scrapeChannel(key, ch.url)) }
    catch (e) {
      console.error(`  ❌ [${key}] 실패: ${e.message}`)
      results.push({ key, count: 0, error: e.message })
    }
  }
  console.log('\n=== 유튜브 수집 요약 ===')
  for (const r of results) console.log(`  ${r.error ? '❌' : '✅'} ${r.key}: ${r.count}개${r.error ? ` (${r.error})` : ''}`)
}

main()
