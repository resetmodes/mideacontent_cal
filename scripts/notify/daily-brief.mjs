/* 팀즈 아침 브리핑 ('26.7 개편) — 매일 08:00 KST에 팀즈 채널로 요약 카드 발송.
   .github/workflows/notify.yml이 실행 (수동 실행도 가능 — Actions → Run workflow)

   내용 ('26.7 사용자 확정 — RMN·정산 등 기타 항목 제외, 아래 3개만):
   ① 오늘 팀원 일정 (팀 캘린더 kind='팀' — 연차·외근·교육 등. '업무' 유형·제외, 기념일은 월-일 일치 시)
   ② 오늘 촬영 일정 (kind='촬영', 오늘이 기간에 포함)
   ③ 오늘 매체 일정 (매체 캘린더 게시 시작일=오늘)
   비는 섹션은 "일정 없음" 표기 (카드는 평일 매일 발송) + 하단 "캘린더 보러가기" 버튼.
   주말은 cron(월~금)으로, 공휴일은 스크립트가 HOLIDAYS 대조로 발송 생략

   시크릿: TEAMS_WEBHOOK_URL(필수 — Power Automate 워크플로, docs/teams-webhook-setup.md)
   SUPABASE_SERVICE_KEY(권장 — 없으면 anon 키로 조회, 미러 정책 필요)
   옵션: --dry-run(발송 대신 카드 JSON 출력) · --mock(고정 픽스처 검증) · ALWAYS_SEND=1 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/config.js'
import { CHANNELS, TEAM_TYPES } from '../../src/data/channels.js'
import { HOLIDAYS } from '../../src/data/holidays.js'

const SITE = 'https://mediacontent-cal.vercel.app'
const DRY = process.argv.includes('--dry-run')
const MOCK = process.argv.includes('--mock')
const WEBHOOK = process.env.TEAMS_WEBHOOK_URL || ''
const KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY

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
      team: [{ title: '노규빈 연차', channel: '연차', date: todayISO, end_date: null }],
      shoots: [{ title: '여름 룩북 촬영', channel: '인스타', sub: null, date: todayISO, end_date: null }],
      uploads: [{ title: '크리스마스 릴스', channel: '인스타', sub: null, date: todayISO, end_date: null }],
    }
  }
  /* ① 오늘 팀원 일정 — kind='팀', 오늘이 기간에 포함 (기념일은 월-일 일치로 매년 반복).
     '업무' 유형은 브리핑 제외 ('26.7 사용자 확정 — 근태·기념일만) */
  const teamAll = await fetchRows('media_events',
    `select=title,channel,date,end_date&kind=eq.%ED%8C%80&order=date.asc&limit=2000`)
  const mmdd = todayISO.slice(5)
  const team = teamAll.filter(e =>
    e.channel !== '업무' &&
    (e.channel === '기념일'
      ? e.date.slice(5) === mmdd
      : e.date <= todayISO && (e.end_date || e.date) >= todayISO))

  /* ② 오늘 촬영 — 기간이 오늘을 포함하는 촬영 건 */
  const shoots = await fetchRows('media_events',
    `select=title,channel,sub,date,end_date&kind=eq.%EC%B4%AC%EC%98%81&date=lte.${todayISO}&or=(end_date.gte.${todayISO},and(end_date.is.null,date.eq.${todayISO}))&order=date.asc`)

  /* ③ 오늘 업로드 — 매체 캘린더 게시 시작일=오늘 (촬영/팀/휴점 제외) */
  const uploads = (await fetchRows('media_events',
    `select=title,channel,sub,date,end_date,kind&date=eq.${todayISO}&order=channel.asc`))
    .filter(e => !e.kind)

  return { team, shoots, uploads }
}

function buildCard({ team, shoots, uploads }) {
  const body = []
  const tb = (text, opts = {}) => body.push({ type: 'TextBlock', wrap: true, text, ...opts })
  /* 비는 섹션도 "일정 없음"으로 표기 ('26.7 확정 — 섹션 숨김 대신 명시) */
  const section = (title, rows) => {
    tb(title, { weight: 'Bolder', spacing: 'Large' })
    if (!rows.length) { tb('일정 없음', { isSubtle: true, spacing: 'Small' }); return }
    rows.slice(0, 8).forEach(r => tb(r, { spacing: 'Small' }))
    if (rows.length > 8) tb(`외 ${rows.length - 8}건`, { isSubtle: true, spacing: 'Small' })
  }

  tb(`미디어콘텐츠팀 아침 브리핑 · ${fmtD(todayISO)}`, { size: 'Medium', weight: 'Bolder' })

  section(`오늘 팀원 일정${team.length ? ` ${team.length}건` : ''}`,
    team.map(e => `${e.title} — ${chLabel(e.channel)}${e.end_date && e.end_date !== e.date ? ` (${fmtRange(e)})` : ''}`))
  section(`오늘 촬영 일정${shoots.length ? ` ${shoots.length}건` : ''}`,
    shoots.map(e => `${e.title} — ${chLabel(e.channel)}${e.sub ? ` (${e.sub})` : ''}`))
  section(`오늘 매체 일정${uploads.length ? ` ${uploads.length}건` : ''}`,
    uploads.map(e => `${chLabel(e.channel)}${e.sub ? ` (${e.sub})` : ''} — ${e.title}`))

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body,
        actions: [{ type: 'Action.OpenUrl', title: '캘린더 보러가기', url: `${SITE}/#calendar` }],
      },
    }],
  }
}

async function main() {
  /* 공휴일 발송 생략 (주말은 cron 월~금으로 차단, 수동 실행은 ALWAYS_SEND=1이라 발송) */
  if (HOLIDAYS[todayISO] && !process.env.ALWAYS_SEND) {
    console.log(`· ${todayISO} 공휴일(${HOLIDAYS[todayISO]}) — 발송 생략`)
    return
  }
  const data = await collect()
  const payload = buildCard(data)
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
