/* 유튜브 제목 한글화 백필 ('26.7) — Apify 재수집 없이 기존 src/data/sns/youtube.js의
   영문 제목만 oEmbed(크리에이터 원본 제목, 로케일 무관)로 교체.

   사용법: node scripts/sns/localize-youtube.mjs
   - 비용 0 (oEmbed는 무료 공개 엔드포인트), Apify 토큰 불필요
   - videoId·thumb 필드도 함께 채움 (구 수집분 대비)
   - 실패분은 기존 제목 유지 (never worse). 인터넷 차단 환경에선 제목 변화 없이 종료
   - GitHub Actions(인터넷 open)에서 workflow_dispatch로 실행 → 결과 커밋

   ⚠ 이 스크립트는 정상 수집 파이프라인(clean-youtube.mjs)과 별개의 1회성/보정용.
   다음 정기 수집부터는 clean-youtube.mjs가 수집 시점에 같은 보정을 수행하므로 불필요 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const OUT = join(ROOT, 'src', 'data', 'sns', 'youtube.js')

function videoId(url) {
  if (!url) return null
  const m = url.match(/[?&]v=([\w-]{11})/) || url.match(/(?:youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/)
  return m ? m[1] : null
}
const thumbOf = id => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null)

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

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

async function main() {
  const txt = await readFile(OUT, 'utf8')
  const YT = JSON.parse(txt.slice(txt.indexOf('{')))

  /* videoId·thumb 채우기 (구 수집분엔 없음) */
  for (const v of YT.videos) {
    if (!v.videoId) v.videoId = videoId(v.url)
    if (!v.thumb) v.thumb = thumbOf(v.videoId)
  }

  const targets = YT.videos.filter(v => v.videoId)
  console.log(`대상 영상 ${targets.length}개 (videoId 확보) — oEmbed 제목 조회…`)
  const titles = await mapLimit(targets, 6, v => fetchOriginalTitle(v.videoId))
  let fixed = 0
  targets.forEach((v, i) => {
    if (titles[i] && titles[i] !== v.title) { v.title = titles[i]; fixed++ }
  })
  console.log(`제목 한글화: ${fixed}/${targets.length}건 보정`)

  if (fixed === 0) {
    console.error('❌ 보정 0건 — oEmbed 접근 실패(네트워크 차단?) 가능. youtube.js 변경 없이 종료')
    return
  }

  YT.generatedAt = YT.generatedAt   // 수집 시점은 유지 (제목만 보정)
  YT.note = '영상별 좋아요·댓글은 미제공(조회수만). 날짜는 상대 표기. 제목은 oEmbed 원본(한글) 기준.'
  await writeFile(OUT, '/* 자동 생성 — scripts/sns/clean-youtube.mjs 로 갱신. 직접 수정 금지 */\nexport const YT = ' + JSON.stringify(YT, null, 1) + '\n', 'utf8')
  console.log(`✅ youtube.js — 제목 ${fixed}건 한글화 완료`)
}

main()
