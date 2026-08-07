/* 내 일정 저장 어댑터 ('26.8) — 개인 투두와 개인 일정 (my_spaces, my_todos, my_events).
   개인 데이터라 media_events와 물리적으로 분리된 테이블을 쓴다 — 미러 사이트가 열리면
   media_events에는 무로그인 읽기 정책이 걸리기 때문 (data/mytask-setup.sql 주석 참조).

   테이블 미설정이면 목록은 null → 화면은 안내 문구만 (settleStore와 동일 원칙).
   SQL: data/mytask-setup.sql (setup.md 15장) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken, getSession } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const api = t => `${SUPABASE_URL}/rest/v1/${t}`
export const myEmail = () => (getSession()?.email || '').toLowerCase()

async function req(url, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.ok) return res
  if (res.status === 403) throw new Error('이 계정은 이 항목을 바꿀 권한이 없습니다')
  /* 409는 대개 사라진 스페이스를 참조한 것이다 — 설치 안내를 띄우면 엉뚱한 곳을 보게 된다 */
  if (res.status === 409) throw new Error('없는 스페이스를 가리키고 있습니다, 담을 곳을 다시 고르고 저장해 주세요')
  if (res.status === 404) throw new Error('내 일정 테이블이 없습니다, data/mytask-setup.sql 실행 필요 (setup.md 15장)')
  throw new Error(`내 일정 ${res.status}, 잠시 후 다시 시도해 주세요`)
}
/* PostgREST는 RLS using 절에 걸려 대상 행이 0개일 때 403이 아니라 200 + [] 를 준다.
   그대로 두면 undefined가 흘러가 "Cannot read properties of undefined"라는 영문
   TypeError가 한글 화면에 뜬다 — 무슨 상황인지 알 수 있는 문구로 바꾼다.
   실제 발생 경로: 공유받았지만 수정 권한이 없는 항목을 고칠 때,
   다른 기기에서 이미 지운 항목을 고칠 때 */
const one = async res => {
  const rows = await res.json()
  const r = Array.isArray(rows) ? rows[0] : rows
  if (!r) throw new Error('이 항목을 바꾸지 못했습니다, 이미 지워졌거나 수정 권한이 없습니다')
  return r
}
const REP = { Prefer: 'return=representation' }

/* ── 스페이스 ── */
const spFrom = r => ({ id: r.id, name: r.name, color: r.color, sort: r.sort })

export async function listSpaces() {
  if (!REMOTE) return null
  try {
    const res = await req(`${api('my_spaces')}?select=*&order=sort.asc,created_at.asc`)
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(spFrom) : null
  } catch { return null }
}
export async function createSpace(name, color, sort = 0) {
  const res = await req(api('my_spaces'), {
    method: 'POST', headers: REP,
    body: JSON.stringify({ owner_email: myEmail(), name, color, sort }),
  })
  return spFrom(await one(res))
}
export async function deleteSpace(id) {
  await req(`${api('my_spaces')}?id=eq.${id}`, { method: 'DELETE' })
}

/* ── 투두 ── */
const tdFrom = r => ({
  id: r.id, txt: r.txt, spaceId: r.space_id, done: !!r.done,
  shared: r.shared_with || [], sharedEdit: !!r.shared_edit,
  memo: r.memo || '', images: r.images || [],
  owner: r.owner_email, sort: r.sort, createdAt: r.created_at,
})

export async function listTodos() {
  if (!REMOTE) return null
  try {
    const res = await req(`${api('my_todos')}?select=*&order=sort.asc,created_at.desc`)
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(tdFrom) : null
  } catch { return null }
}
export async function createTodo({ txt, spaceId = null, shared = [], memo = null, images = null }) {
  const body = { owner_email: myEmail(), txt, space_id: spaceId, shared_with: shared }
  /* memo·images는 값이 있을 때만 — 컬럼 추가(setup.md 15장) 전이라도 기본 등록은 되게 */
  if (memo) body.memo = memo
  if (images?.length) body.images = images
  const res = await req(api('my_todos'), { method: 'POST', headers: REP, body: JSON.stringify(body) })
  return tdFrom(await one(res))
}
export async function updateTodo(id, patch) {
  const body = {}
  if (patch.txt !== undefined) body.txt = patch.txt
  if (patch.done !== undefined) body.done = patch.done
  if (patch.spaceId !== undefined) body.space_id = patch.spaceId
  if (patch.shared !== undefined) body.shared_with = patch.shared
  if (patch.sharedEdit !== undefined) body.shared_edit = patch.sharedEdit
  if (patch.memo !== undefined) body.memo = patch.memo
  if (patch.images !== undefined) body.images = patch.images
  const res = await req(`${api('my_todos')}?id=eq.${id}`, {
    method: 'PATCH', headers: REP, body: JSON.stringify(body),
  })
  return tdFrom(await one(res))
}
export async function deleteTodo(id) {
  await req(`${api('my_todos')}?id=eq.${id}`, { method: 'DELETE' })
}

/* ── 개인 일정 ── */
const evFrom = r => ({
  id: r.id, title: r.title, date: r.on_date, time: r.at_time || null,
  dur: r.dur_min ?? 60, spaceId: r.space_id, linkedId: r.linked_id || null,
  shared: r.shared_with || [], sharedEdit: !!r.shared_edit,
  memo: r.memo || '', images: r.images || [], owner: r.owner_email,
})

export async function listMyEvents() {
  if (!REMOTE) return null
  try {
    const res = await req(`${api('my_events')}?select=*&order=on_date.asc`)
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(evFrom) : null
  } catch { return null }
}
export async function createMyEvent({ title, date, time = null, dur = 60, spaceId = null, shared = [], memo = null, images = null }) {
  const body = {
    owner_email: myEmail(), title, on_date: date, at_time: time,
    dur_min: dur, space_id: spaceId, shared_with: shared,
  }
  if (memo) body.memo = memo
  if (images?.length) body.images = images
  const res = await req(api('my_events'), { method: 'POST', headers: REP, body: JSON.stringify(body) })
  return evFrom(await one(res))
}
export async function updateMyEvent(id, patch) {
  const body = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.date !== undefined) body.on_date = patch.date
  if (patch.time !== undefined) body.at_time = patch.time
  if (patch.dur !== undefined) body.dur_min = patch.dur
  if (patch.spaceId !== undefined) body.space_id = patch.spaceId
  if (patch.linkedId !== undefined) body.linked_id = patch.linkedId
  if (patch.shared !== undefined) body.shared_with = patch.shared
  if (patch.sharedEdit !== undefined) body.shared_edit = patch.sharedEdit
  if (patch.memo !== undefined) body.memo = patch.memo
  if (patch.images !== undefined) body.images = patch.images
  const res = await req(`${api('my_events')}?id=eq.${id}`, {
    method: 'PATCH', headers: REP, body: JSON.stringify(body),
  })
  return evFrom(await one(res))
}
export async function deleteMyEvent(id) {
  await req(`${api('my_events')}?id=eq.${id}`, { method: 'DELETE' })
}
