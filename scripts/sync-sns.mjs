/* SNS 모니터링 데이터 동기화
   hyundai-monitor(수집 파이프라인)의 최신 데이터를 이 프로젝트의 ES 모듈로 변환.
   실행: node scripts/sync-sns.mjs
   (hyundai-monitor에서 npm run scrape 등으로 수집을 갱신한 뒤 이 스크립트 실행 → git push) */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MONITOR = path.resolve(__dirname, '../../hyundai-monitor')
const OUT = path.resolve(__dirname, '../src/data/sns')

const readWindowData = (file, varName) => {
  const src = fs.readFileSync(file, 'utf8')
  return JSON.parse(src.replace(new RegExp(`^window\\.${varName}\\s*=\\s*`), '').replace(/;\s*$/, ''))
}

fs.mkdirSync(OUT, { recursive: true })

/* 인스타그램 — 계정 요약만 (원본 게시물 목록 제외) */
const ig = readWindowData(path.join(MONITOR, 'data/instagram/posts.js'), 'IG_DATA')
const igOut = { source: ig.source, generatedAt: ig.generatedAt, note: ig.note, accounts: ig.accounts }
fs.writeFileSync(
  path.join(OUT, 'instagram.js'),
  '/* 자동 생성 — scripts/sync-sns.mjs 로 갱신. 직접 수정 금지 */\nexport const IG = ' + JSON.stringify(igOut, null, 1) + '\n'
)

/* 유튜브 — 채널 요약 + 수집 영상 전체 */
const yt = readWindowData(path.join(MONITOR, 'data/youtube/videos.js'), 'YT_DATA')
fs.writeFileSync(
  path.join(OUT, 'youtube.js'),
  '/* 자동 생성 — scripts/sync-sns.mjs 로 갱신. 직접 수정 금지 */\nexport const YT = ' + JSON.stringify(yt, null, 1) + '\n'
)

console.log(`done — IG accounts: ${igOut.accounts.length} (${igOut.generatedAt})`)
console.log(`done — YT channels: ${yt.channels.length}, videos: ${yt.videos?.length ?? 0} (${yt.generatedAt})`)
