/* 팀즈 아침 브리핑 ('26.7) — 매일 08:00 KST에 팀즈 채널로 요약 카드 발송.
   .github/workflows/notify.yml이 실행 (수동 실행도 가능 — Actions → Run workflow)

   내용(없는 섹션은 숨김, 전부 비면 발송 생략):
   ① 오늘 촬영 (kind='촬영', 오늘이 기간에 포함)
   ② 오늘 업로드 콘텐츠 (매체 캘린더 게시 시작일=오늘, 촬영/팀/휴점 제외)
   ③ RMN 확인 필요 — 가부킹 전환(시작 3개월 이내 진입) · 세금계산서 미교부 (buildRmnNotices 재사용)
   + 오늘이 휴점/공휴일이면 상단에 한 줄, 하단에 "보러가기" 버튼(웹 링크)

   인증:
   - TEAMS_WEBHOOK_URL (GitHub Secret, 필수) — Power Automate 워크플로 웹훅 (docs/teams-webhook-setup.md)
   - SUPABASE_SERVICE_KEY (Secret, 권장) — 없으면 anon 키: RMN 섹션은 내부 전용 RLS라 생략됨
   옵션: --dry-run(발송 대신 카드 JSON 출력) · --mock(고정 픽스처로 카드 생성 검증) · ALWAYS_SEND=1(빈 브리핑도 발송) */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/config.js'
import { buildRmnNotices } from '../../src/data/rmn.js'
import { CHANNELS, TEAM_TYPES } from '../../src/data/channels.js'
import { HOLIDAYS, CLOSED_DAYS } from '../../src/data/holidays.js'

const SITE = 'https://mediacontent-cal.vercel.app'
const DRY = process.argv.includes('--dry-run')
const MOCK = process.argv.includes('--mock')
const WEBHOOK = process.env.TEAMS_WEBHOOK_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const KEY = SERVICE_KEY || SUPABASE_ANON_KEY

/* KST 기준 오늘 (Actions 러너는 UTC) */
const kstNow = new Date(Date.now() + 9 * 3600e3)
const todayISO = kstNow.toISOString().slice(0, 10)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const fmtD = iso => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))} (${DOW[new Date(iso + 'T00:00:00Z').getUTCDay()]})`
const fmtRange = e => (e.end_date && e.end_date !== e.date ? `${fmtD(e.date)}~${fmtD(e.end_date)}` : fmtD(e.date))
const chLabel = id => CHANNELS.find(c => c.id === id)?.label || TEAM_TYPES?.find?.(c => c.id === id)?.label || id

async function fetchRows(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`${table} ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error(`${table} 응답이 배열이 아님`)
  return rows
}

async function collect() {
  if (MOCK) {
    return {
      shoots: [{ title: '여름 룩북 촬영', channel: '인스타', sub: null, date: todayISO, end_date: null }],
      uploads: [{ title: '크리스마스 릴스', channel: '인스타', sub: null, date: todayISO, end_date: null }],
      rmn: buildRmnNotices([
        { id: 't', advertiser: '샤넬', product: '스플래시', start_date: '2026-10-12', end_date: '2026-10-18', status: '가부킹' },
        { id: 'u', advertiser: '부쉐론', product: '팝업배너', start_date: '2026-07-13', end_date: '2026-07-26', status: '결과 리포트' },
      ], todayISO),
      rmnSkipped: false,
    }
  }
  /* ① 오늘 촬영 — 기간이 오늘을 포함하는 촬영 건 */
  const shoots = (await fetchRows('media_events',
    `select=title,channel,sub,date,end_date&kind=eq.%EC%B4%AC%EC%98%81&date=lte.${todayISO}&or=(end_date.gte.${todayISO},and(end_date.is.null,date.eq.${todayISO}))&order=date.asc`))

  /* ② 오늘 업로드 콘텐츠 — 매체 캘린더 게시 시작일=오늘 (촬영/팀/휴점 제외) */
  const uploads = (await fetchRows('media_events',
    `select=title,channel,sub,date,end_date,kind&date=eq.${todayISO}&order=channel.asc`))
    .filter(e => e.kind !== '촬영' && e.kind !== '팀' && e.kind !== '휴점')

  /* ③ RMN — 내부 전용 RLS: 서비스 키 없으면(또는 테이블 미설정) 섹션 생략 */
  let rmn = { tentative: [], tax: [] }, rmnSkipped = false
  try {
    const bookings = await fetchRows('rmn_bookings', 'select=id,advertiser,product,start_date,end_date,send_at,status&limit=2000')
    rmn = buildRmnNotices(bookings, todayISO)
  } catch (e) {
    rmnSkipped = true
    console.warn(`⚠ RMN 섹션 생략 (${e.message})${SERVICE_KEY ? '' : ' — SUPABASE_SERVICE_KEY 시크릿 설정 시 포함됨'}`)
  }

  /* ④ 정산 증빙 미첨부 ('26.7 테스트) — 완료 아니고 파일 0건. 테이블 미설정이면 생략 */
  let settleMissing = []
  try {
    const st = await fetchRows('settlements', 'select=title,owner_name,files,status,recurring&limit=500')
    settleMissing = st.filter(s => !s.recurring && s.status !== '완료' && (!s.files || s.files.length === 0))
  } catch { /* 정산 미설정 — 조용히 생략 */ }

  return { shoots, uploads, rmn, rmnSkipped, settleMissing }
}

function buildCard({ shoots, uploads, rmn, settleMissing = [] }) {
  const body = []
  const tb = (text, opts = {}) => body.push({ type: 'TextBlock', wrap: true, text, ...opts })
  const section = (title, rows) => {
    if (!rows.length) return
    tb(title, { weight: 'Bolder', spacing: 'Large' })
    rows.slice(0, 6).forEach(r => tb(r, { spacing: 'Small' }))
    if (rows.length > 6) tb(`외 ${rows.length - 6}건`, { isSubtle: true, spacing: 'Small' })
  }

  tb(`미디어콘텐츠팀 아침 브리핑 · ${fmtD(todayISO)}`, { size: 'Medium', weight: 'Bolder' })
  const dayNote = [CLOSED_DAYS[todayISO] && `오늘 ${CLOSED_DAYS[todayISO]}일`, HOLIDAYS[todayISO]].filter(Boolean).join(' · ')
  if (dayNote) tb(dayNote, { isSubtle: true, spacing: 'Small' })

  const rmnCount = rmn.tentative.length + rmn.tax.length
  section(`오늘 촬영 ${shoots.length}건`,
    shoots.map(e => `${e.title} — ${chLabel(e.channel)}${e.sub ? ` (${e.sub})` : ''}`))
  section(`오늘 업로드 콘텐츠 ${uploads.length}건`,
    uploads.map(e => `${chLabel(e.channel)}${e.sub ? ` (${e.sub})` : ''} — ${e.title}`))
  section(`RMN 확인 필요 ${rmnCount}건`, [
    ...rmn.tentative.map(b => `가부킹 → 부킹 전환: ${b.advertiser} — ${b.product} · ${fmtD(b.start_date)} 시작`),
    ...rmn.tax.map(b => `세금계산서 미교부: ${b.advertiser} — ${b.product} · 현재 [${b.status}]`),
  ])
  section(`정산 증빙 미첨부 ${settleMissing.length}건`,
    settleMissing.map(s => `${s.title} — ${(s.owner_name || '').split(' ')[0]}`))

  const hasContent = shoots.length + uploads.length + rmnCount + settleMissing.length > 0
  if (!hasContent) return null

  /* 보러가기 — 웹 캘린더 링크 버튼만 (RMN은 텍스트 섹션으로 충분, '26.7 버튼 제거) */
  const actions = [{ type: 'Action.OpenUrl', title: '캘린더 보러가기', url: `${SITE}/#calendar` }]

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body,
        actions,
      },
    }],
  }
}

async function main() {
  const data = await collect()
  const card = buildCard(data)
  if (!card && !process.env.ALWAYS_SEND) {
    console.log(`· ${todayISO} 알릴 내용 없음 — 발송 생략${data.rmnSkipped ? ' (RMN 섹션은 키 미설정으로 미포함)' : ''}`)
    return
  }
  const payload = card || buildCard({ ...data, uploads: [{ title: '(빈 브리핑 테스트)', channel: '기타', date: todayISO }] })
  if (DRY) {
    console.log(JSON.stringify(payload, null, 2))
    console.log('· dry-run — 발송하지 않음')
    return
  }
  if (!WEBHOOK) throw new Error('TEAMS_WEBHOOK_URL 미설정 (GitHub Secret)')
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`팀즈 발송 실패 (${res.status}) — ${(await res.text()).slice(0, 200)}`)
  console.log(`✅ 팀즈 브리핑 발송 완료 (${todayISO})`)
}

main().catch(e => { console.error('❌ 브리핑 실패:', e.message); process.exit(1) })
