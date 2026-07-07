/* 인스타그램 정제·통합 (hyundai-monitor에서 이식, '26.7)
   data/sns-raw/instagram/*.json → src/data/sns/instagram.js (ES 모듈, 계정 요약만)

   사용법: node scripts/sns/clean-instagram.mjs
   기존 raw 재정제: SNS_RAW_DIR="../hyundai-monitor/data/instagram/raw" node scripts/sns/clean-instagram.mjs

   규칙
   - likes=-1(비공개) → null, 평균 좋아요는 공개분만 집계
   - 모든 지표는 최근 3개월 윈도우 기준
   - 휴면 = 60일+ 미게시 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { IG_ACCOUNTS, IG_COMPETITORS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'instagram')
const OUT_DIR = join(ROOT, 'src', 'data', 'sns')
const OUT = join(OUT_DIR, 'instagram.js')

const round = n => Math.round(n)

function classify(p) {
  if (p.productType === 'clips') return 'Reels'
  if (p.type === 'Sidecar') return 'Carousel'
  if (p.type === 'Image') return 'Image'
  if (p.type === 'Video') return 'Reels'
  return 'Other'
}

const WINDOW_MONTHS = 3
const CUTOFF_TS = (() => { const d = new Date(); d.setMonth(d.getMonth() - WINDOW_MONTHS); return d.getTime() })()
const CUTOFF_DATE = new Date(CUTOFF_TS).toISOString().slice(0, 10)

async function processList(list) {
  const summaries = []
  for (const acc of list) {
    let raw
    try {
      raw = JSON.parse(await readFile(join(RAW_DIR, `${acc.file}.json`), 'utf8'))
    } catch {
      console.warn(`⚠ ${acc.file}.json 없음 — 건너뜀 (다음 수집부터 포함)`)
      continue
    }
    if (!raw.length || raw[0]?.error) {
      console.warn(`⚠ ${acc.handle}: 수집 실패 (${raw[0]?.error || '빈 데이터'}) — 건너뜀`)
      continue
    }

    const followers = raw[0]?.followersCount ?? null

    const posts = raw.map(p => ({
      format: classify(p),
      ts: p.timestamp,
      likes: p.likesCount === -1 ? null : (p.likesCount ?? null),
      comments: p.commentsCount ?? 0,
      views: p.videoPlayCount ?? 0,
    }))
    const windowed = posts.filter(p => {
      const t = new Date(p.ts).getTime()
      return !isNaN(t) && t >= CUTOFF_TS
    })

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
      dormant: daysSinceLastPost != null && daysSinceLastPost > 60,
      commentsPer1k: followers ? +(avgComments / followers * 1000).toFixed(2) : null,
      engagementPer1k: followers && avgEngagement !== null ? +(avgEngagement / followers * 1000).toFixed(2) : null,
    })
  }
  return summaries
}

async function main() {
  const accounts = await processList(IG_ACCOUNTS)
  const competitors = await processList(IG_COMPETITORS)

  const output = {
    source: 'apify/instagram-scraper',
    platform: 'instagram',
    generatedAt: new Date().toISOString(),
    windowMonths: WINDOW_MONTHS,
    windowSince: CUTOFF_DATE,
    note: `모든 지표는 최근 ${WINDOW_MONTHS}개월(${CUTOFF_DATE} 이후) 게시물 기준. likes=null 은 비공개(좋아요 평균은 공개분만).`,
    accounts,
    competitors,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT, '/* 자동 생성 — scripts/sns/clean-instagram.mjs 로 갱신. 직접 수정 금지 */\nexport const IG = ' + JSON.stringify(output, null, 1) + '\n', 'utf8')
  console.log(`✅ src/data/sns/instagram.js — 자사 ${accounts.length} + 경쟁사 ${competitors.length}`)
}

main()
