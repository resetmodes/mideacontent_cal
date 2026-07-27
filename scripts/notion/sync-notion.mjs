/* 노션 → 매체 캘린더 동기화 ('26.7 — 단방향)
   대행사 공용 "업무 요청 현황" DB의 행을 media_events에 upsert — 전 행이 인스타 일정
   ('26.7 사용자 확정, 매체 필터 없음). 업로드 일정 → 매체 캘린더 / 촬영 일정 → 촬영일정 탭.

   동작:
   1. 통합(Integration)에 연결된 DB를 검색 — NOTION_DB(환경변수)가 있으면 그 DB만,
      없으면 연결된 DB가 정확히 1개일 때 자동 선택 (여럿이면 에러 + 목록 출력)
   2. 매핑: 제목 → title · "업로드 일정" 날짜 → 매체 캘린더 건 · "촬영*" 날짜 → 촬영 건
      (한 행 = 최대 2건, 촬영 건 키는 {pageId}#shoot) · channel='인스타' 고정
      캠페인류 속성이 있으면 campaign으로 (이름에 '캠페인' 포함 시)
   4. upsert 키 = notion_id (수정 시 제목·기간만 갱신 — 팀이 붙인 메모·캠페인·이미지는 보존)
   5. 노션에서 사라진 행(notion_id 보유 & 이번 조회에 없음) → 삭제하지 않고 notion_gone=true
      마킹만 — 캘린더에서 규빈 계정에 검토 배너가 뜨고 [삭제/유지]를 사람이 결정
      ('26.7 사용자 결정. 매체가 인스타→다른 값으로 바뀐 행도 필터에서 빠져 gone 처리됨)

   시크릿: NOTION_TOKEN(필수) · SUPABASE_SERVICE_KEY(필수 — RLS 우회 쓰기)
   검증: --mock (data/notion-mock.json 사용, 네트워크 불필요) · --dry-run (쓰기 생략)
   SQL 선행: setup.md 11장 (notion_id·notion_gone 컬럼) */
import { readFileSync } from 'node:fs'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/config.js'

const MOCK = process.argv.includes('--mock')
const DRY = process.argv.includes('--dry-run')
const NOTION_TOKEN = process.env.NOTION_TOKEN
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
const NOTION_DB = process.env.NOTION_DB || ''

const N_HEADERS = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}
const SB_HEADERS = {
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
}

async function notion(path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: body ? 'POST' : 'GET', headers: N_HEADERS, body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Notion ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS, ...options, headers: { ...SB_HEADERS, ...(options.headers || {}) } })
  if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res
}

/* ── 노션 행 → 일정 매핑 ── */
const plain = rt => (rt || []).map(t => t.plain_text).join('').trim()

/* 한 노션 행("업무 요청 현황" DB)이 최대 2건의 일정이 됨 ('26.7 사용자 확정 — 전 행이
   인스타 일정이라 매체 필터 불필요):
   · "업로드 일정" 날짜 → 매체 캘린더 (kind 없음)
   · "촬영 일정"(또는 이름에 '촬영' 포함) 날짜 → 촬영일정 탭 (kind='촬영')
   촬영 건의 upsert 키는 `{pageId}#shoot` — 업로드 건과 별도 행으로 관리.
   두 날짜 다 없는 행(날짜 미정)은 스킵 (날짜가 생기면 다음 동기화 때 들어옴) */
export function mapPage(page) {
  const props = page.properties || {}
  const titleProp = Object.values(props).find(p => p.type === 'title')
  const title = plain(titleProp?.title)
  if (!title) return []
  const dates = Object.entries(props).filter(([, p]) => p.type === 'date' && p.date)
  const findDate = re => dates.find(([k]) => re.test(k))?.[1].date
  const shootD = findDate(/촬영/)
  const upD = findDate(/업로드|발행|게시/)
    || (dates.length === 1 && !findDate(/촬영/) ? dates[0][1].date : null)   // 날짜 속성이 하나뿐이면 업로드로
  const campProp = Object.entries(props).find(([k, p]) =>
    /캠페인|campaign/i.test(k) && (p.type === 'select' ? p.select : p.type === 'rich_text' ? plain(p.rich_text) : null))
  const campaign = campProp
    ? (campProp[1].type === 'select' ? campProp[1].select.name : plain(campProp[1].rich_text)) || null
    : null
  const base = { title, channel: '인스타', campaign, url: page.url }
  const out = []
  if (upD) out.push({ ...base, notion_id: page.id, kind: null, date: upD.start.slice(0, 10), end_date: upD.end ? upD.end.slice(0, 10) : null })
  if (shootD) out.push({ ...base, notion_id: `${page.id}#shoot`, kind: '촬영', date: shootD.start.slice(0, 10), end_date: shootD.end ? shootD.end.slice(0, 10) : null })
  return out
}

async function fetchNotionRows() {
  if (MOCK) {
    const mock = JSON.parse(readFileSync(new URL('../../data/notion-mock.json', import.meta.url), 'utf8'))
    return mock.pages
  }
  let dbId = NOTION_DB
  if (!dbId) {
    const found = await notion('/search', { filter: { property: 'object', value: 'data_source' } })
      .catch(() => notion('/search', { filter: { property: 'object', value: 'database' } }))
    const dbs = (found.results || []).filter(r => r.object === 'database' || r.object === 'data_source')
    if (dbs.length !== 1) {
      console.error(`연결된 DB가 ${dbs.length}개 — NOTION_DB 시크릿으로 하나를 지정하세요:`)
      for (const d of dbs) console.error(` - ${plain(d.title)} (${d.id})`)
      process.exit(1)
    }
    dbId = dbs[0].id
    console.log(`DB 자동 선택: ${plain(dbs[0].title)} (${dbId})`)
  }
  const pages = []
  let cursor
  do {
    const res = await notion(`/databases/${dbId}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
    pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : null
  } while (cursor)
  return pages
}

async function main() {
  if (!MOCK && !NOTION_TOKEN) { console.error('NOTION_TOKEN 없음'); process.exit(1) }
  const pages = await fetchNotionRows()
  const rows = pages.flatMap(mapPage)
  console.log(`노션 ${pages.length}행 중 인스타 일정 ${rows.length}건`)

  /* 기존 동기화분 조회 (notion_id 있는 행 전부) — mock은 파일의 existing 사용 (오프라인 검증) */
  const existing = MOCK
    ? (JSON.parse(readFileSync(new URL('../../data/notion-mock.json', import.meta.url), 'utf8')).existing || [])
    : await (await sb('media_events?select=id,notion_id,title,date,end_date,notion_gone&notion_id=not.is.null')).json()
  const byNid = new Map(existing.map(e => [e.notion_id, e]))
  const seen = new Set()
  let created = 0, updated = 0, revived = 0

  for (const r of rows) {
    seen.add(r.notion_id)
    const ex = byNid.get(r.notion_id)
    if (!ex) {
      if (!DRY) await sb('media_events', {
        method: 'POST',
        body: JSON.stringify({
          title: r.title, date: r.date, end_date: r.end_date, channel: r.channel,
          ...(r.kind ? { kind: r.kind } : {}),
          campaign: r.campaign, owner: '노션', memo: r.url, notion_id: r.notion_id, notion_gone: false,
        }),
      })
      created++
    } else {
      const changed = ex.title !== r.title || ex.date !== r.date || (ex.end_date || null) !== r.end_date
      const wasGone = !!ex.notion_gone
      if (changed || wasGone) {
        /* 제목·기간만 갱신 — 팀이 우리 쪽에서 붙인 캠페인·메모·이미지는 보존 */
        if (!DRY) await sb(`media_events?id=eq.${ex.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: r.title, date: r.date, end_date: r.end_date, notion_gone: false }),
        })
        changed ? updated++ : revived++
      }
    }
  }

  /* 노션에서 사라진 행 → gone 마킹 (삭제는 사람이 캘린더 배너에서 결정) */
  let gone = 0
  for (const ex of existing) {
    if (!seen.has(ex.notion_id) && !ex.notion_gone) {
      if (!DRY) await sb(`media_events?id=eq.${ex.id}`, { method: 'PATCH', body: JSON.stringify({ notion_gone: true }) })
      gone++
    }
  }
  console.log(`✓ 동기화 완료 — 신규 ${created} · 갱신 ${updated} · 복구 ${revived} · 노션삭제 감지 ${gone}${DRY ? ' (dry-run: 쓰기 생략)' : ''}`)
}

/* 직접 실행 시에만 동작 — test-data.mjs가 mapPage를 import해 매핑 회귀를 검사 */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch(e => { console.error('✗', e.message); process.exit(1) })
}
