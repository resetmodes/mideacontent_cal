/* UGC 수집 — 해시태그 게시물 + 상위 작성자 프로필 ('26.7)
   자사 계정 밖에서 고객·인플루언서가 올리는 게시물을 해시태그로 수집.

   사용법:
     node scripts/sns/scrape-ugc.mjs 더현대서울   → 한 태그만 (테스트)
     node scripts/sns/scrape-ugc.mjs              → ugc-config.mjs 전체 태그
   결과: data/sns-raw/ugc/{태그}.json + _profiles.json (git 미추적 — 정제 후 src/data/sns만 커밋)

   2단계 구조:
   ① 태그별 최근 1개월 게시물 (apify~instagram-scraper — 계정 수집과 동일 액터·과금)
   ② 반응 상위 작성자 프로필 조회 (apify~instagram-profile-scraper) — 팔로워 수 확보,
      인플루언서 판정용. 프로필은 1계정=1건 과금이라 비용 미미. 실패해도 ①은 유지 */

import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { UGC_TAGS, UGC_RESULTS_LIMIT, UGC_WINDOW, PROFILE_LOOKUP_TOP } from './ugc-config.mjs'
import { IG_ACCOUNTS, IG_COMPETITORS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'ugc')

const TAG_ACTOR = 'apify~instagram-scraper'
const PROFILE_ACTOR = 'apify~instagram-profile-scraper'
const API = 'https://api.apify.com/v2'

try { process.loadEnvFile(join(ROOT, '.env')) } catch { /* CI에선 환경변수 사용 */ }
const TOKEN = process.env.APIFY_TOKEN
if (!TOKEN || TOKEN.includes('PASTE_YOUR_TOKEN')) {
  console.error('❌ APIFY_TOKEN이 없습니다. 로컬은 .env, CI는 GitHub Secret을 설정하세요.')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const safeName = s => s.replace(/[^\w가-힣]/g, '_')

async function runActor(actor, input, label) {
  const startRes = await fetch(`${API}/acts/${actor}/runs?token=${TOKEN}`, {
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
  return itemsRes.json()
}

async function scrapeTag(tag) {
  console.log(`\n▶ [#${tag}] 수집 시작 (최근 ${UGC_WINDOW}, 최대 ${UGC_RESULTS_LIMIT}개)…`)
  const items = await runActor(TAG_ACTOR, {
    directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`],
    resultsType: 'posts',
    resultsLimit: UGC_RESULTS_LIMIT,
    onlyPostsNewerThan: UGC_WINDOW,
    addParentData: true,
  })
  const file = `${safeName(tag)}.json`
  await writeFile(join(RAW_DIR, file), JSON.stringify(items, null, 2), 'utf8')
  console.log(`  ✅ ${items.length}개 저장 → ${file}`)
  return { tag, count: items.length }
}

/* ② 상위 작성자 프로필 — raw 전체에서 반응 상위 작성자를 뽑아 팔로워 수 조회 */
async function scrapeTopProfiles() {
  const OWN = new Set([...IG_ACCOUNTS, ...IG_COMPETITORS].map(a => a.handle.toLowerCase()))
  const byOwner = new Map()
  for (const f of await readdir(RAW_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue
    let items
    try { items = JSON.parse(await readFile(join(RAW_DIR, f), 'utf8')) } catch { continue }
    if (!Array.isArray(items)) continue
    for (const p of items) {
      const owner = (p.ownerUsername || '').toLowerCase()
      if (!owner || OWN.has(owner)) continue
      const eng = (p.likesCount > 0 ? p.likesCount : 0) + (p.commentsCount || 0)
      byOwner.set(owner, (byOwner.get(owner) || 0) + eng)
    }
  }
  const top = [...byOwner.entries()].sort((a, b) => b[1] - a[1])
    .slice(0, PROFILE_LOOKUP_TOP).map(([u]) => u)
  if (!top.length) { console.warn('⚠ 프로필 조회 대상 없음 — 건너뜀'); return }

  console.log(`\n▶ 상위 작성자 ${top.length}명 프로필 조회…`)
  const profiles = await runActor(PROFILE_ACTOR, { usernames: top })
  await writeFile(join(RAW_DIR, '_profiles.json'), JSON.stringify(profiles, null, 2), 'utf8')
  console.log(`  ✅ ${profiles.length}개 프로필 저장 → _profiles.json`)
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })
  const arg = process.argv[2]
  const targets = arg ? [arg] : UGC_TAGS

  console.log(`UGC 수집 태그 ${targets.length}개: ${targets.map(t => '#' + t).join(', ')}`)
  const results = []
  for (const tag of targets) {
    try { results.push(await scrapeTag(tag)) }
    catch (e) {
      console.error(`  ❌ [#${tag}] 실패: ${e.message}`)
      results.push({ tag, count: 0, error: e.message })
    }
  }

  try { await scrapeTopProfiles() }
  catch (e) { console.error(`  ❌ 프로필 조회 실패 (게시물 수집분은 유지): ${e.message}`) }

  console.log('\n=== UGC 수집 요약 ===')
  for (const r of results) console.log(`  ${r.error ? '❌' : '✅'} #${r.tag}: ${r.count}개${r.error ? ` (${r.error})` : ''}`)
}

main()
