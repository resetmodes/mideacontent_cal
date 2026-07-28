/* GA4 → RMN 부킹 노출·클릭 자동 수집 ('26.7 — 3차 파이프라인)
   탐색 분석 "노규빈 스터디_*" 수기 측정을 Data API 동일 쿼리로 자동화.

   모드:
   · --discover : 속성 메타데이터(맞춤 측정기준 API 실명)와 최근 30일 이벤트명 목록 출력.
     ⚠ 공개 리포라 Actions 로그에 남음 — 스키마·이름만 출력, 실적 수치는 절대 출력 금지
   · --collect  : 진행·완료 부킹(가부킹·취소 제외)을 캠페인 단위로 GA 조회 →
     rmn_bookings.impressions/clicks 갱신 (setup.md 8-4 컬럼 필요)
   · --dry-run  : Supabase 쓰기 생략 (건수만 출력)

   시크릿: GA4_KEY_JSON(서비스 계정 키 JSON 전체) · SUPABASE_SERVICE_KEY
   구좌 매핑·파라미터 실명은 아래 CONFIG — discover 결과로 확정 ('26.7 탐색 분석 대조:
   구좌 = 맞춤 측정기준 "광고_광고게시위치", 광고주 = "광고_광고주명", 노출 = view_ad) */
import crypto from 'node:crypto'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/config.js'

const PROPERTY = 'properties/404178718'
/* ── CONFIG — discover 실행 결과로 확정하는 값 (API 실명) ── */
/* '26.7.28 discover 실행으로 확정 (Actions run #1 로그) */
const EV_VIEW = 'view_ad'
const EV_CLICK = 'click_ad'
const DIM_SLOT = 'customEvent:ep_ad_location'      // "광고_광고게시위치"
const DIM_ADVERTISER = 'customEvent:ep_ad_agency'  // "광고_광고주명" (표시명과 달리 param은 ad_agency)
const SLOT_MAP = {                                // GA 게시위치 값 → RMN 상품명
  '통합앱_스플래시': '스플래시',
  '통합앱_메인배너': '메인배너',
  '통합앱_메인하단배너': '하단배너',
  '통합앱_오픈팝업': '팝업배너',
  '통합앱_헤드라인뉴스': '헤드라인 뉴스',
  '통합앱_이벤트메뉴': '이벤트 메뉴',
}

const DISCOVER = process.argv.includes('--discover')
const DRY = process.argv.includes('--dry-run')
const KEY = process.env.GA4_KEY_JSON ? JSON.parse(process.env.GA4_KEY_JSON) : null
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY

const b64u = s => Buffer.from(s).toString('base64url')

/* 서비스 계정 JWT → 액세스 토큰 (SDK 없이 — 의존성 0) */
async function getToken() {
  const now = Math.floor(Date.now() / 1000)
  const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64u(JSON.stringify({
    iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${hdr}.${claim}`)
  const assertion = `${hdr}.${claim}.${signer.sign(KEY.private_key, 'base64url')}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).access_token
}

async function ga(path, body, token) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GA ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res
}

const iso = d => d.toISOString().slice(0, 10)
const todayKST = () => iso(new Date(Date.now() + 9 * 3600e3))

/* ── discover: 스키마만 출력 (수치 출력 금지 — 공개 리포 로그) ── */
async function discover(token) {
  const meta = await ga(`${PROPERTY}/metadata`, null, token)
  console.log('── 맞춤 측정기준 (customEvent:*) ──')
  for (const d of meta.dimensions || []) {
    if (d.apiName.startsWith('customEvent:') || d.apiName.startsWith('customUser:'))
      console.log(`  ${d.apiName}  ←  "${d.uiName}"`)
  }
  const end = todayKST()
  const start = iso(new Date(Date.now() - 30 * 86400000))
  const rep = await ga(`${PROPERTY}:runReport`, {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    limit: 200,
  }, token)
  const names = (rep.rows || []).map(r => r.dimensionValues[0].value)
  console.log('── 최근 30일 이벤트명 (수치 미출력) ──')
  for (const n of names) console.log(`  ${n}${/ad|광고/i.test(n) ? '   ← 광고 관련' : ''}`)
}

/* ── audit: 대장 광고주명 ↔ GA 광고주명 표기 대조 ('26.7.28) —
   결과는 팀즈 채널로만 (공개 리포 Actions 로그에 광고주 목록 금지) ── */
async function audit(token) {
  const rows = await (await sb('rmn_bookings?select=advertiser,product,impressions&status=not.in.(가부킹,취소)')).json()
  const target = rows.filter(b => Object.values(SLOT_MAP).includes(b.product))
  const dbAdv = [...new Set(target.map(b => b.advertiser))]
  const noData = [...new Set(target.filter(b => !b.impressions).map(b => b.advertiser))]
    .filter(a => !target.some(b => b.advertiser === a && b.impressions > 0))   // 한 건이라도 잡힌 광고주는 제외
  const rep = await ga(`${PROPERTY}:runReport`, {
    dateRanges: [{ startDate: '2025-01-01', endDate: todayKST() }],
    dimensions: [{ name: DIM_ADVERTISER }],
    metrics: [{ name: 'eventCount' }],
    limit: 1000,
  }, token)
  const gaAdv = (rep.rows || []).map(r => r.dimensionValues[0].value).filter(v => v && v !== '(not set)')
  const norm = s => s.replace(/[\s()·._-]/g, '').toLowerCase()
  const lines = noData.map(a => {
    const cand = gaAdv.filter(g => norm(g).includes(norm(a)) || norm(a).includes(norm(g)))
    return `**${a}** → ${cand.length ? `후보: ${cand.join(', ')}` : 'GA에 유사 표기 없음'}`
  })
  const body = [
    { type: 'TextBlock', text: 'GA 광고주명 표기 대조 결과', weight: 'Bolder', size: 'Medium' },
    { type: 'TextBlock', text: `대장 광고주 ${dbAdv.length}곳 중 GA 미매칭 ${noData.length}곳 (GA 표기 ${gaAdv.length}종)`, wrap: true },
    ...lines.map(t => ({ type: 'TextBlock', text: `- ${t}`, wrap: true, spacing: 'Small' })),
    { type: 'TextBlock', text: '후보가 있는 건은 SLOT/광고주 매핑 추가로 살릴 수 있음 — 목록을 검토해 알려주세요. 후보 없음 = GA 집계 시작(고도화) 전 캠페인일 가능성.', wrap: true, isSubtle: true },
  ]
  const webhook = process.env.TEAMS_WEBHOOK_URL
  if (!webhook) { console.error('TEAMS_WEBHOOK_URL 없음 — audit 결과를 보낼 수 없음'); process.exit(1) }
  const res = await fetch(webhook, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: { type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body },
      }],
    }),
  })
  if (!res.ok) throw new Error(`팀즈 발송 실패 ${res.status}`)
  console.log(`✓ 대조 완료 — 미매칭 ${noData.length}건, 결과는 팀즈로 발송 (로그 미출력)`)
}

/* ── collect: 캠페인(광고주+기간) 단위 조회 → 부킹별 노출·클릭 갱신 ── */
async function collect(token) {
  const today = todayKST()
  const rows = await (await sb(
    `rmn_bookings?select=id,advertiser,product,start_date,end_date,status&status=not.in.(가부킹,취소)&start_date=lte.${today}`
  )).json()
  /* 일일 수집은 최근 종료(30일)·진행 중 부킹만 — 과거 완료분은 --backfill 1회로.
     GA 데이터는 종료 후 변하지 않아 매일 전체 재조회는 낭비 */
  const BACKFILL = process.argv.includes('--backfill')
  const cutoff = iso(new Date(Date.now() - 30 * 86400000))
  const target = rows.filter(b => Object.values(SLOT_MAP).includes(b.product))
    .filter(b => BACKFILL || (b.end_date || b.start_date) >= cutoff)
  /* 캠페인 = 광고주+기간 겹침 묶음 대신, 부킹별로 [광고주 × 자기 기간] 조회 (단순·정확) */
  let updated = 0, noData = 0, dailySaved = 0, dailyTableMissing = false
  for (const b of target) {
    const end = (b.end_date || b.start_date) < today ? (b.end_date || b.start_date) : today
    const rep = await ga(`${PROPERTY}:runReport`, {
      dateRanges: [{ startDate: b.start_date, endDate: end }],
      dimensions: [{ name: 'date' }, { name: DIM_SLOT }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        andGroup: { expressions: [
          { filter: { fieldName: 'eventName', inListFilter: { values: [EV_VIEW, EV_CLICK] } } },
          { filter: { fieldName: DIM_ADVERTISER, stringFilter: { matchType: 'CONTAINS', value: b.advertiser } } },
        ] },
      },
      limit: 5000,
    }, token)
    let imp = 0, clk = 0
    const daily = {}   // date|slot → {imps, clicks} — 결과보고서용 일별 적재
    for (const r of rep.rows || []) {
      const slot = SLOT_MAP[r.dimensionValues[1].value]
      if (slot !== b.product) continue
      const n = Number(r.metricValues[0].value) || 0
      const d = r.dimensionValues[0].value   // YYYYMMDD
      const key = `${d}`
      daily[key] = daily[key] || { imps: 0, clicks: 0 }
      if (r.dimensionValues[2].value === EV_VIEW) { imp += n; daily[key].imps += n }
      else { clk += n; daily[key].clicks += n }
    }
    if (imp === 0 && clk === 0) { noData++; continue }
    if (!DRY) {
      await sb(`rmn_bookings?id=eq.${b.id}`, {
        method: 'PATCH', body: JSON.stringify({ impressions: imp, clicks: clk }),
      })
      /* 일별 적재 (결과보고서용) — 테이블 미설정(setup.md 8-5 전)이면 건너뛰고 계속 */
      if (!dailyTableMissing) {
        const rows = Object.entries(daily).map(([d, v]) => ({
          advertiser: b.advertiser, slot: b.product,
          date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
          impressions: v.imps, clicks: v.clicks,
        }))
        try {
          if (rows.length) {
            await sb('rmn_ga_daily?on_conflict=advertiser,slot,date', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify(rows),
            })
            dailySaved += rows.length
          }
        } catch { dailyTableMissing = true }
      }
    }
    updated++
  }
  /* 수치는 로그에 안 남김 (공개 리포) — 건수만 */
  console.log(`✓ GA 수집 완료 — 대상 ${target.length}건 중 갱신 ${updated} · 데이터 없음 ${noData} · 일별 ${dailySaved}행${dailyTableMissing ? ' (rmn_ga_daily 미설정 — setup.md 8-5)' : ''}${DRY ? ' (dry-run)' : ''}`)
}

async function main() {
  if (!KEY) { console.error('GA4_KEY_JSON 없음'); process.exit(1) }
  const token = await getToken()
  if (DISCOVER) return discover(token)
  if (process.argv.includes('--audit')) return audit(token)
  return collect(token)
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
