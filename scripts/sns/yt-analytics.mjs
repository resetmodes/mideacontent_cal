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
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200)
    /* invalid_grant은 원인이 여럿인데 구글은 사유를 안 알려준다 — 확인 순서를 안내에 담는다 */
    const hint = body.includes('invalid_grant')
      ? '\n  확인 순서\n'
        + '  1 리프레시 토큰 칸에 액세스 토큰(ya29 로 시작)을 넣지 않았는지\n'
        + '  2 토큰을 발급한 클라이언트와 시크릿의 클라이언트 ID·보안 비밀이 같은 것인지\n'
        + '  3 동의 화면이 테스트 상태면 7일 만에 만료되므로 프로덕션으로 게시했는지\n'
        + '  4 위가 모두 맞으면 토큰이 취소된 것이므로 재발급 (docs/yt-analytics-setup.md)'
      : ''
    throw new Error(`토큰 교환 실패 ${res.status}: ${body}${hint}`)
  }
  return (await res.json()).access_token
}

async function api(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`${url.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/* 채널 ID 자동 해결 ('26.7.30) — accounts.mjs의 URL에서 @핸들을 뽑아 Data API로 조회.
   채널 ID를 사람이 찾아 넣을 필요가 없다. channelId가 이미 있으면 그대로 사용 */
const handleOf = url => {
  const m = decodeURIComponent(url || '').match(/@([^/?#]+)/)
  return m ? m[1] : null
}
async function resolveChannelId(token, c) {
  if (c.channelId) return c.channelId
  const h = handleOf(c.url)
  if (!h) return null
  try {
    const r = await api(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent('@' + h)}`, token)
    const id = r.items?.[0]?.id
    if (id) { console.log(`· ${c.key}: 채널 ID 자동 확인 ${id}`); return id }
  } catch (e) { console.warn(`· ${c.key}: 핸들 조회 실패 (${e.message.slice(0, 60)})`) }
  /* 폴백 — 내 채널 목록에서 이름으로 매칭 (OAuth 계정이 소유한 채널만) */
  try {
    const mine = await api('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50', token)
    const hit = (mine.items || []).find(i =>
      (i.snippet?.customUrl || '').replace('@', '').toLowerCase() === h.toLowerCase())
    if (hit) { console.log(`· ${c.key}: 내 채널 목록에서 확인 ${hit.id}`); return hit.id }
  } catch { /* 폴백 실패는 조용히 */ }
  return null
}

/* reports.query — 채널 1개 분량 */
async function channelReport(token, channelId, start, end) {
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports'
  const q = extra => `${base}?ids=channel%3D%3D${channelId}&startDate=${start}&endDate=${end}&${extra}`
  /* ① 일별 추이 — 월별로 묶는 건 아래에서 직접 한다.
     month 차원은 시작·종료가 달 경계에 딱 맞아야 하는데 경계를 맞춰도 거절하는 경우가 있어
     ('26.7.31 전 채널 400) 아무 날짜나 받는 day 차원으로 바꿨다 */
  const daily = await api(q('dimensions=day&metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost&sort=day'), token)
  /* ② 기간 합계 */
  const totals = await api(q('metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration,averageViewPercentage,likes,comments,shares'), token)
  /* ③ 영상별 상위 10 */
  const top = await api(q('dimensions=video&metrics=views,estimatedMinutesWatched&sort=-views&maxResults=10'), token)
  /* ④ 트래픽 소스 — 유입 경로별 조회수 ('26.7.30) */
  const traffic = await api(q('dimensions=insightTrafficSourceType&metrics=views,estimatedMinutesWatched&sort=-views'), token)
     .catch(() => ({ rows: [], columnHeaders: [] }))
  /* ⑤ 시청자 연령·성별 — viewerPercentage는 다른 지표와 함께 못 부른다 (단독 쿼리).
     시청자 수가 임계 미만이면 구글이 빈 응답을 준다 — 그때는 화면에서 섹션째 숨김 */
  const demo = await api(q('dimensions=ageGroup,gender&metrics=viewerPercentage&sort=-viewerPercentage'), token)
     .catch(() => ({ rows: [], columnHeaders: [] }))
  /* ⑥ 기기 유형 */
  const device = await api(q('dimensions=deviceType&metrics=views&sort=-views'), token)
     .catch(() => ({ rows: [], columnHeaders: [] }))

  const row = (r, cols) => Object.fromEntries(cols.map((c, i) => [c.name, r[i]]))
  const tRow = (totals.rows || [])[0] ? row(totals.rows[0], totals.columnHeaders) : {}

  /* 일별 행을 달로 접는다. 평균 시청 시간은 날짜별 평균의 평균이 아니라
     그 달 전체 시청시간을 조회수로 나눈 값이어야 한다 */
  const byMonth = new Map()
  for (const r0 of (daily.rows || [])) {
    const r = row(r0, daily.columnHeaders)
    const key = String(r.day).slice(0, 7)
    const m = byMonth.get(key) || { month: key, views: 0, minutes: 0, gained: 0, lost: 0 }
    m.views += r.views || 0
    m.minutes += r.estimatedMinutesWatched || 0
    m.gained += r.subscribersGained || 0
    m.lost += r.subscribersLost || 0
    byMonth.set(key, m)
  }
  const mRows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
  const topRows = (top.rows || []).map(r => row(r, top.columnHeaders))
  const trafficRows = (traffic.rows || []).map(r => row(r, traffic.columnHeaders))
  const demoRows = (demo.rows || []).map(r => row(r, demo.columnHeaders))
  const deviceRows = (device.rows || []).map(r => row(r, device.columnHeaders))

  /* 영상 제목 해석 (Data API — 같은 토큰의 youtube.readonly 스코프 사용) */
  let titles = {}
  const ids = topRows.map(r => r.video).filter(Boolean)
  if (ids.length) {
    const v = await api(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.join(',')}`, token)
    titles = Object.fromEntries((v.items || []).map(i => [i.id, i.snippet.title]))
  }

  return {
    monthly: mRows.map(r => ({
      month: r.month, views: r.views, minutes: r.minutes,
      subsNet: r.gained - r.lost,
      avgViewSec: r.views ? Math.round(r.minutes * 60 / r.views) : 0,
    })),
    totals: {
      views: tRow.views || 0, minutes: tRow.estimatedMinutesWatched || 0,
      subsNet: (tRow.subscribersGained || 0) - (tRow.subscribersLost || 0),
      avgViewSec: Math.round(tRow.averageViewDuration || 0),
      avgViewPct: tRow.averageViewPercentage != null ? +tRow.averageViewPercentage.toFixed(1) : null,
      likes: tRow.likes || 0, comments: tRow.comments || 0, shares: tRow.shares || 0,
    },
    top: topRows.map(r => ({ videoId: r.video, title: titles[r.video] || r.video, views: r.views, minutes: r.estimatedMinutesWatched })),
    /* 유입 경로 — API 코드값 그대로 저장하고 한글 라벨은 화면에서 매핑 (코드가 늘어도 안전) */
    traffic: trafficRows.map(r => ({ source: r.insightTrafficSourceType, views: r.views, minutes: r.estimatedMinutesWatched })),
    /* 시청자 구성 — viewerPercentage 합이 100 (연령 × 성별 교차) */
    demo: demoRows.map(r => ({ age: r.ageGroup, gender: r.gender, pct: r.viewerPercentage })),
    device: deviceRows.map(r => ({ type: r.deviceType, views: r.views })),
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

  /* dry-run에서는 이 토큰이 실제로 무엇을 소유로 보는지 먼저 찍는다.
     스튜디오 권한으로 초대만 받은 채널은 여기 안 나오고 실적 조회에서 403이 된다 —
     "권한을 줬는데 왜 못 찾느냐"를 가르는 유일한 근거 ('26.7.31) */
  if (DRY) {
    try {
      const mine = await api('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50', token)
      const list = mine.items || []
      console.log(`이 토큰이 소유로 보는 채널 ${list.length}개`)
      for (const i of list) console.log(`  ${i.snippet?.title} ${i.snippet?.customUrl || ''} ${i.id}`)
      if (!list.length) console.log('  없음 (동의할 때 브랜드 계정이 아니라 개인 계정을 골랐을 가능성)')
    } catch (e) { console.warn(`소유 채널 목록 조회 실패 ${e.message.replace(/\s+/g, ' ')}`) }
  }

  const channels = {}
  const denied = []
  let ok = 0
  for (const c of YT_CHANNELS) {
    const cid = await resolveChannelId(token, c)
    if (!cid) { console.warn(`· ${c.key}: 채널 ID를 찾지 못함 (핸들 변경이면 accounts.mjs url 갱신)`); continue }
    try {
      channels[c.key] = await channelReport(token, cid, iso(start), iso(end))
      ok++
    } catch (e) {
      /* 403은 채널 접근 권한 문제라 원인이 분명하다. 나머지는 응답 원문을 남기되
         줄바꿈을 눕혀야 여러 채널 경고가 뒤섞이지 않는다 */
      if (/ 403:/.test(e.message)) {
        console.warn(`⚠ ${c.key}: 이 계정에 채널 실적 권한 없음 (스튜디오 권한에서 수집 계정을 뷰어 이상으로 초대할 것)`)
        denied.push(c.key)
      } else {
        console.warn(`⚠ ${c.key}: ${e.message.replace(/\s+/g, ' ')}`)
      }
    }
  }
  if (denied.length) console.warn(`권한 없는 채널 ${denied.length}개: ${denied.join(', ')} (docs/yt-analytics-setup.md 7장)`)
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
