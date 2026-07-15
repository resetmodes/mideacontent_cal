/* 유튜브 정제·통합 (hyundai-monitor에서 이식, '26.7)
   data/sns-raw/youtube/*.json → src/data/sns/youtube.js (ES 모듈)

   사용법: node scripts/sns/clean-youtube.mjs
   기존 raw 재정제: SNS_RAW_DIR="../hyundai-monitor/data/youtube/raw" node scripts/sns/clean-youtube.mjs

   참고: 채널 스크레이퍼는 영상별 조회수만 제공 (좋아요·댓글 없음) */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { YT_CHANNELS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const RAW_DIR = process.env.SNS_RAW_DIR || join(ROOT, 'data', 'sns-raw', 'youtube')
const OUT_DIR = process.env.SNS_OUT_DIR || join(ROOT, 'src', 'data', 'sns')
const OUT = join(OUT_DIR, 'youtube.js')

/* 직전 출력 로드 — 수집 실패 채널의 "이전 값 유지"(carry-forward)용 (instagram과 동일 원칙) */
let PREV = { channels: [], videos: [] }
try {
  const txt = await readFile(OUT, 'utf8')
  PREV = JSON.parse(txt.slice(txt.indexOf('{')))
} catch { /* 최초 실행 */ }
const prevByKey = new Map((PREV.channels || []).map(c => [c.key, c]))

const round = n => Math.round(n)

function durToSec(d) {
  if (!d || typeof d !== 'string') return 0
  const parts = d.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  return parts.reduce((acc, v) => acc * 60 + v, 0)
}

/* URL에서 영상 ID 추출 — watch?v=ID / youtu.be/ID / shorts/ID */
function videoId(url) {
  if (!url) return null
  const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/(?:youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : null
}
const thumbOf = id => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null)

/* 한글 원본 제목 — YouTube oEmbed는 크리에이터 설정 제목을 로케일 무관하게 반환
   (채널 스크레이퍼는 러너 IP 기준 자동번역 영문 제목을 줌). 실패 시 null → 기존 제목 유지.
   비용 0(무료 공개 엔드포인트), 소규모 동시성. 네트워크 차단 환경에선 조용히 스킵됨 */
async function fetchOriginalTitle(id) {
  if (!id) return null
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: ctrl.signal, headers: { 'Accept-Language': 'ko-KR' } }
    )
    clearTimeout(to)
    if (!res.ok) return null
    const t = (await res.json()).title
    return t && t.trim() ? t.trim() : null
  } catch { return null }
}

/* 동시성 제한 병렬 처리 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

/* 전체 영상 제목을 원본(한글)으로 보정 — 실패분은 기존 제목 그대로 (never worse) */
async function localizeTitles(videos) {
  const targets = videos.filter(v => v.videoId)
  let fixed = 0
  const titles = await mapLimit(targets, 6, v => fetchOriginalTitle(v.videoId))
  targets.forEach((v, i) => {
    if (titles[i] && titles[i] !== v.title) { v.title = titles[i]; fixed++ }
  })
  console.log(`  · 제목 한글화: ${fixed}/${targets.length}건 보정 (나머지는 기존 제목 유지)`)
}

async function main() {
  const allVideos = []
  const channelSummaries = []
  let fresh = 0

  for (const ch of YT_CHANNELS) {
    let raw
    try {
      raw = JSON.parse(await readFile(join(RAW_DIR, `${ch.key}.json`), 'utf8'))
    } catch {
      const prev = prevByKey.get(ch.key)
      if (prev) {
        console.warn(`⚠ ${ch.key}.json 없음 — 이전 수집값 유지 (채널 소실 방지)`)
        channelSummaries.push(prev)
        allVideos.push(...(PREV.videos || []).filter(v => v.channel === ch.key))
      } else {
        console.warn(`⚠ ${ch.key}.json 없음 — 이전 값도 없어 건너뜀`)
      }
      continue
    }
    fresh++
    const meta = raw[0] || {}

    const videos = raw.map(v => {
      const id = videoId(v.url)
      return {
        channel: ch.key,
        title: v.title || '(제목 없음)',
        type: v.type === 'shorts' ? 'Shorts' : 'Video',
        url: v.url || null,
        videoId: id,
        thumb: thumbOf(id),
        views: v.viewCount ?? 0,
        duration: v.duration || '',
        durationSec: durToSec(v.duration),
        date: v.date || '',
      }
    })
    allVideos.push(...videos)

    const shorts = videos.filter(v => v.type === 'Shorts')
    const longform = videos.filter(v => v.type === 'Video')
    const avgViews = videos.length ? round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0
    const subs = meta.numberOfSubscribers ?? null

    channelSummaries.push({
      key: ch.key,
      name: ch.name,
      channelName: meta.channelName || ch.name,
      url: ch.url,
      isMain: ch.isMain,
      subscribers: subs,
      totalVideos: meta.channelTotalVideos ?? null,
      totalViews: meta.channelTotalViews ?? null,
      collected: videos.length,
      videoCount: longform.length,
      shortsCount: shorts.length,
      avgViews,
      avgViewsVideo: longform.length ? round(longform.reduce((s, v) => s + v.views, 0) / longform.length) : 0,
      avgViewsShorts: shorts.length ? round(shorts.reduce((s, v) => s + v.views, 0) / shorts.length) : 0,
      maxViews: videos.length ? Math.max(...videos.map(v => v.views)) : 0,
      viewsPer1kSubs: subs ? +(avgViews / subs * 1000).toFixed(1) : null,
    })
  }

  /* 빈 결과 가드 — 이번 회차 실수집 0건(전면 실패) 시 기존 데이터 보존, 저장 스킵
     ('26.7 실제 발생: 월 한도 초과 403 → 데이터 소실). 일부 실패는 carry-forward가 처리 */
  if (fresh === 0) {
    console.error('❌ 실수집 0건 — 기존 youtube.js를 보존하고 저장을 건너뜀 (Apify 한도·토큰 확인)')
    return
  }

  /* 제목 한글화 — videoId 있는 영상 전부 (carry-forward 구 데이터는 videoId 없어 자연 스킵) */
  await localizeTitles(allVideos)

  const output = {
    source: 'streamers/youtube-channel-scraper',
    platform: 'youtube',
    generatedAt: new Date().toISOString(),
    note: '영상별 좋아요·댓글은 미제공(조회수만). 날짜는 상대 표기. 제목은 oEmbed 원본(한글) 기준.',
    channels: channelSummaries,
    videos: allVideos,
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT, '/* 자동 생성 — scripts/sns/clean-youtube.mjs 로 갱신. 직접 수정 금지 */\nexport const YT = ' + JSON.stringify(output, null, 1) + '\n', 'utf8')
  console.log(`✅ src/data/sns/youtube.js — 채널 ${channelSummaries.length} / 영상 ${allVideos.length}`)
}

main()
