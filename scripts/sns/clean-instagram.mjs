/* 인스타그램 정제·통합 (hyundai-monitor에서 이식, '26.7)
   data/sns-raw/instagram/*.json → src/data/sns/instagram.js (ES 모듈, 계정 요약만)

   사용법: node scripts/sns/clean-instagram.mjs
   기존 raw 재정제: SNS_RAW_DIR="../hyundai-monitor/data/instagram/raw" node scripts/sns/clean-instagram.mjs

   규칙
   - likes=-1(비공개) → null, 평균 좋아요는 공개분만 집계
   - 모든 지표(평균 좋아요·릴스 비중 등)는 최근 1개월 윈도우 기준
   - 휴면 = 최근 1개월(30일) 미게시. 원본 수집 범위도 1개월이라, 빈 결과(게시 0건)인 계정은
     지표 없이 "휴면"으로만 표시 (계정이 대시보드에서 사라지지 않게 유지)
   - 휴면 = 60일+ 미게시 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { IG_ACCOUNTS, IG_COMPETITORS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'instagram')
const OUT_DIR = process.env.SNS_OUT_DIR || join(ROOT, 'src', 'data', 'sns')
const OUT = join(OUT_DIR, 'instagram.js')

/* 직전 출력 로드 — 수집 실패 계정의 "이전 값 유지"(carry-forward)용.
   '26.7.7 사고 2: Apify 크레딧이 수집 도중 소진되면 뒷순서 계정들의 raw가 아예 없어
   대시보드에서 계정째 사라짐 → 실패 계정은 직전 수집값을 그대로 유지한다 */
let PREV = { accounts: [], competitors: [], posts: [] }
try {
  const txt = await readFile(OUT, 'utf8')
  PREV = JSON.parse(txt.slice(txt.indexOf('{')))
} catch { /* 최초 실행 */ }
const prevByHandle = new Map([...(PREV.accounts || []), ...(PREV.competitors || [])].map(a => [a.handle, a]))

const round = n => Math.round(n)

function classify(p) {
  if (p.productType === 'clips') return 'Reels'
  if (p.type === 'Sidecar') return 'Carousel'
  if (p.type === 'Image') return 'Image'
  if (p.type === 'Video') return 'Reels'
  return 'Other'
}

const WINDOW_MONTHS = 1   // 집계용 윈도우. scrape-instagram.mjs의 원본 수집 범위(2개월)보다 좁아도 됨
const CUTOFF_TS = (() => { const d = new Date(); d.setMonth(d.getMonth() - WINDOW_MONTHS); return d.getTime() })()
const CUTOFF_DATE = new Date(CUTOFF_TS).toISOString().slice(0, 10)

/* 게시물 단위(IG.posts) 내보내기 대상 — 캘린더 실적 매칭용 ('26.7 확정: 이 2개 계정만)
   본계정(the_hyundai)·도시메뉴얼(dosi.manual) 외 계정·경쟁사는 요약만 유지 */
const PERF_HANDLES = new Set(['the_hyundai', 'dosi.manual'])

/* postRows: 실적 매칭용 게시물 목록 축적 (PERF_HANDLES 계정만)
   반환: { summaries, fresh } — fresh는 이번에 실제 수집된 계정 수 (carry-forward 제외) */
async function processList(list, postRows = null) {
  const summaries = []
  let fresh = 0
  const carry = (acc, why) => {
    const prev = prevByHandle.get(acc.handle)
    if (prev) {
      console.warn(`⚠ ${acc.handle}: ${why} — 이전 수집값 유지 (계정 소실 방지)`)
      summaries.push(prev)
      if (postRows && PERF_HANDLES.has(acc.handle)) {
        postRows.push(...(PREV.posts || []).filter(p => p.handle === acc.handle))
      }
    } else {
      console.warn(`⚠ ${acc.handle}: ${why} — 이전 값도 없어 건너뜀 (다음 수집부터 포함)`)
    }
  }
  for (const acc of list) {
    let raw
    try {
      raw = JSON.parse(await readFile(join(RAW_DIR, `${acc.file}.json`), 'utf8'))
    } catch {
      carry(acc, `${acc.file}.json 없음`)
      continue
    }
    if (raw[0]?.error) {
      carry(acc, `수집 실패 (${raw[0].error})`)
      continue
    }
    fresh++
    /* 최근 1개월 게시물 0건 = 휴면 — 지표 없이 계정만 유지 (대시보드에서 사라지지 않게) */
    if (!raw.length) {
      console.warn(`· ${acc.handle}: 최근 1개월 게시 없음 → 휴면 표시`)
      summaries.push({
        handle: acc.handle, name: acc.name, group: acc.group,
        profileUrl: `https://www.instagram.com/${acc.handle}/`, isMain: acc.isMain,
        followers: null, postCount: 0, likesVisible: 0, avgLikes: null, avgComments: 0,
        reelsCount: 0, reelsShare: 0, avgReelViews: 0, avgEngagement: null,
        lastPostDate: null, daysSinceLastPost: null, spanDays: 0, postsLast30: 0,
        dormant: true, commentsPer1k: null, engagementPer1k: null,
      })
      continue
    }

    const followers = raw[0]?.followersCount ?? null

    const posts = raw.map(p => ({
      format: classify(p),
      ts: p.timestamp,
      likes: p.likesCount === -1 ? null : (p.likesCount ?? null),
      comments: p.commentsCount ?? 0,
      views: p.videoPlayCount ?? 0,
      url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
      caption: (p.caption || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    }))
    const windowed = posts.filter(p => {
      const t = new Date(p.ts).getTime()
      return !isNaN(t) && t >= CUTOFF_TS
    })

    if (postRows && PERF_HANDLES.has(acc.handle)) {
      for (const p of windowed) {
        if (!p.url) continue
        postRows.push({
          handle: acc.handle, ts: p.ts, url: p.url, caption: p.caption,
          format: p.format, likes: p.likes, comments: p.comments, views: p.views,
        })
      }
    }

    const reels = windowed.filter(p => p.format === 'Reels')
    const likeVisible = windowed.filter(p => p.likes !== null)
    const avgLikes = likeVisible.length ? round(likeVisible.reduce((s, p) => s + p.likes, 0) / likeVisible.length) : null
    const avgComments = windowed.length ? round(windowed.reduce((s, p) => s + p.comments, 0) / windowed.length) : 0
    const avgReelViews = reels.length ? round(reels.reduce((s, p) => s + p.views, 0) / reels.length) : 0
    const avgEngagement = avgLikes !== null ? avgLikes + avgComments : null

    const DAY = 86400000
    const now = Date.now()
    const allTimes = posts.map(p => new Date(p.ts).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b)
    const wTimes = windowed.map(p => new Date(p.ts).getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b)
    const lastTs = allTimes.length ? allTimes[allTimes.length - 1] : null
    const daysSinceLastPost = lastTs != null ? Math.round((now - lastTs) / DAY) : null

    summaries.push({
      handle: acc.handle,
      name: acc.name,
      group: acc.group,
      profileUrl: `https://www.instagram.com/${acc.handle}/`,
      isMain: acc.isMain,
      followers,
      postCount: windowed.length,
      likesVisible: likeVisible.length,
      avgLikes,
      avgComments,
      reelsCount: reels.length,
      reelsShare: windowed.length ? round((reels.length / windowed.length) * 100) : 0,
      avgReelViews,
      avgEngagement,
      lastPostDate: lastTs != null ? new Date(lastTs).toISOString().slice(0, 10) : null,
      daysSinceLastPost,
      spanDays: wTimes.length >= 2 ? Math.round((wTimes[wTimes.length - 1] - wTimes[0]) / DAY) : 0,
      postsLast30: allTimes.filter(t => now - t <= 30 * DAY).length,
      dormant: daysSinceLastPost == null || daysSinceLastPost > 30,   // 1개월(30일)+ 미게시 = 휴면
      commentsPer1k: followers ? +(avgComments / followers * 1000).toFixed(2) : null,
      engagementPer1k: followers && avgEngagement !== null ? +(avgEngagement / followers * 1000).toFixed(2) : null,
    })
  }
  return { summaries, fresh }
}

async function main() {
  const postRows = []   // 자사 계정 게시물 단위 — 캘린더 실적 매칭용 (경쟁사 제외)
  const { summaries: accounts, fresh: freshA } = await processList(IG_ACCOUNTS, postRows)
  const { summaries: competitors, fresh: freshC } = await processList(IG_COMPETITORS)
  postRows.sort((a, b) => (a.ts < b.ts ? 1 : -1))

  /* 빈 결과 가드 — 이번 회차 실수집이 0이면(전면 실패) 기존 파일 보존, 저장 스킵.
     일부만 실패한 경우는 위 carry-forward가 이전 값을 유지한 채 저장됨 */
  if (freshA + freshC === 0) {
    console.error('❌ 실수집 0건 — 기존 instagram.js를 보존하고 저장을 건너뜀 (Apify 한도·토큰 확인)')
    return
  }

  const output = {
    source: 'apify/instagram-scraper',
    platform: 'instagram',
    generatedAt: new Date().toISOString(),
    windowMonths: WINDOW_MONTHS,
    windowSince: CUTOFF_DATE,
    note: `모든 지표는 최근 ${WINDOW_MONTHS}개월(${CUTOFF_DATE} 이후) 게시물 기준. likes=null 은 비공개(좋아요 평균은 공개분만).`,
    accounts,
    competitors,
    posts: postRows,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT, '/* 자동 생성 — scripts/sns/clean-instagram.mjs 로 갱신. 직접 수정 금지 */\nexport const IG = ' + JSON.stringify(output, null, 1) + '\n', 'utf8')
  console.log(`✅ src/data/sns/instagram.js — 자사 ${accounts.length} + 경쟁사 ${competitors.length} · 게시물 ${postRows.length}건 (실적 매칭용)`)
}

main()
