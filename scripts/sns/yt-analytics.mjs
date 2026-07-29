/* YouTube 스튜디오 지표 수집 ('26.7.29) — YouTube Analytics API v2
   ─────────────────────────────────────────────────────────────
   Apify 스크레이핑(공개 지표: 구독자·조회수)으로는 못 얻는 "스튜디오 값"을 가져온다:
   월별 조회수 · 시청시간 · 구독자 증감 · 평균 시청 지속시간 · 영상별 실적.

   ⚠ 인증이 GA4와 다르다: 유튜브는 **서비스 계정을 지원하지 않는다**.
   채널 소유(관리자) 구글 계정이 1회 OAuth 동의 → refresh_token을 시크릿으로 저장 →
   실행할 때마다 access_token으로 교환한다. 절차는 docs/yt-analytics-setup.md.

   시크릿: YT_OAUTH_CLIENT_ID · YT_OAUTH_CLIENT_SECRET · YT_OAUTH_REFRESH_TOKEN
   실행: node scripts/sns/yt-analytics.mjs [--months 4] [--dry-run]
   출력: src/data/sns/ytAnalytics.js (모니터링 탭 채널 대시보드가 읽음)

   ※ 노출수·노출 클릭률(CTR)은 Analytics API가 제공하지 않는다 (스튜디오 전용).
     해당 카드는 대시보드에서 "스튜디오 확인"으로 표기 — 수치를 지어내지 않는다. */

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { YT_CHANNELS } from './accounts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const OUT_DIR = join(ROOT, 'src', 'data', 'sns')
const OUT = join(OUT_DIR, 'ytAnalytics.js')

try { process.loadEnvFile(join(ROOT, '.env')) } catch { /* CI는 환경변수 */ }
const { YT_OAUTH_CLIENT_ID: CID, YT_OAUTH_CLIENT_SECRET: CSEC, YT_OAUTH_REFRESH_TOKEN: RTOK } = process.env
const DRY = process.argv.includes('--dry-run')
const MONTHS = Number((process.argv.find(a => a.startsWith('--months=')) || '').split('=')[1]) || 4

const iso = d => d.toISOString().slice(0, 10)
const kstNow = () => new Date(Date.now() + 9 * 3600e3)

async function getToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, refresh_token: RTOK, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error(`토큰 교환 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()).access_token
}

async function api(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`${url.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/* reports.query — 채널 1개 분량 */
async function channelReport(token, channelId, start, end) {
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports'
  const q = extra => `${base}?ids=channel%3D%3D${channelId}&startDate=${start}&endDate=${end}&${extra}`
  /* ① 월별 추이 */
  const monthly = await api(q('dimensions=month&metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration&sort=month'), token)
  /* ② 기간 합계 */
  const totals = await api(q('metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration,averageViewPercentage,likes,comments,shares'), token)
  /* ③ 영상별 상위 10 */
  const top = await api(q('dimensions=video&metrics=views,estimatedMinutesWatched&sort=-views&maxResults=10'), token)

  const row = (r, cols) => Object.fromEntries(cols.map((c, i) => [c.name, r[i]]))
  const mRows = (monthly.rows || []).map(r => row(r, monthly.columnHeaders))
  const tRow = (totals.rows || [])[0] ? row(totals.rows[0], totals.columnHeaders) : {}
  const topRows = (top.rows || []).map(r => row(r, top.columnHeaders))

  /* 영상 제목 해석 (Data API — 같은 토큰의 youtube.readonly 스코프 사용) */
  let titles = {}
  const ids = topRows.map(r => r.video).filter(Boolean)
  if (ids.length) {
    const v = await api(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.join(',')}`, token)
    titles = Object.fromEntries((v.items || []).map(i => [i.id, i.snippet.title]))
  }

  return {
    monthly: mRows.map(r => ({
      month: r.month, views: r.views, minutes: r.estimatedMinutesWatched,
      subsNet: (r.subscribersGained || 0) - (r.subscribersLost || 0),
      avgViewSec: Math.round(r.averageViewDuration || 0),
    })),
    totals: {
      views: tRow.views || 0, minutes: tRow.estimatedMinutesWatched || 0,
      subsNet: (tRow.subscribersGained || 0) - (tRow.subscribersLost || 0),
      avgViewSec: Math.round(tRow.averageViewDuration || 0),
      avgViewPct: tRow.averageViewPercentage != null ? +tRow.averageViewPercentage.toFixed(1) : null,
      likes: tRow.likes || 0, comments: tRow.comments || 0, shares: tRow.shares || 0,
    },
    top: topRows.map(r => ({ videoId: r.video, title: titles[r.video] || r.video, views: r.views, minutes: r.estimatedMinutesWatched })),
  }
}

async function main() {
  if (!CID || !CSEC || !RTOK) {
    console.error('❌ YT_OAUTH_* 시크릿 없음 — docs/yt-analytics-setup.md 참조 (미설정 시 대시보드는 수집 지표만 표시)')
    process.exit(1)
  }
  const end = kstNow()
  const start = new Date(end); start.setMonth(start.getMonth() - MONTHS)
  const token = await getToken()

  const channels = {}
  let ok = 0
  for (const c of YT_CHANNELS) {
    if (!c.channelId) { console.warn(`· ${c.key}: channelId 미등록 — accounts.mjs에 추가 필요`); continue }
    try {
      channels[c.key] = await channelReport(token, c.channelId, iso(start), iso(end))
      ok++
    } catch (e) {
      console.warn(`⚠ ${c.key}: ${e.message} (권한 없는 채널이면 해당 계정으로 재동의 필요)`)
    }
  }
  if (!ok) { console.error('❌ 수집 0채널 — 기존 파일 보존'); process.exit(1) }

  const out = {
    source: 'youtube-analytics-api-v2',
    generatedAt: new Date().toISOString(),
    range: { start: iso(start), end: iso(end) },
    note: `YouTube 스튜디오 기준 ${iso(start)}~${iso(end)}. 노출수·CTR은 API 미제공(스튜디오 전용).`,
    channels,
  }
  /* 수치는 로그에 남기지 않음 (공개 리포) — 채널 수만 */
  if (DRY) { console.log(`✓ dry-run — ${ok}개 채널 수집 (저장 생략)`); return }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT, '/* 자동 생성 — scripts/sns/yt-analytics.mjs 로 갱신. 직접 수정 금지 */\nexport const YTA = ' + JSON.stringify(out, null, 1) + '\n', 'utf8')
  console.log(`✅ src/data/sns/ytAnalytics.js — ${ok}개 채널 (월별·합계·상위 영상)`)
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
