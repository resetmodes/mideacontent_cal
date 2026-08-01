/* 바이럴 라운지 저장 어댑터 ('26.8) — Supabase 전용 (media_requests + lounge-src 버킷).
   테이블 미설정, 로컬 모드면 목록은 null → 화면은 안내 문구만 (settleStore와 동일 원칙).
   신청 INSERT는 anon 정책이 있어 로그인 없이도 접수 가능 (2차 미러 공개 대비) —
   지금은 어드민 게이트 뒤라 사실상 팀 대리 입력. SQL: data/lounge-setup.sql (setup.md 14장) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'
import { compressImage } from './settleStore.js'
import { imageUrl } from './eventImages.js'
import { makeReqNo, isoOf } from '../data/lounge.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const API = () => `${SUPABASE_URL}/rest/v1/media_requests`
const STORE = () => `${SUPABASE_URL}/storage/v1/object`
const BUCKET = 'lounge-src'
const MAX_FILE = 10 * 1024 * 1024

async function req(path, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      ...options.headers,
    },
  })
  if (res.status === 403) throw new Error('이 계정은 처리 권한이 없습니다 (team_writers 미등록)')
  if (!res.ok) throw new Error(`라운지 ${res.status}, 테이블과 버킷 설정 확인 (setup.md 14장)`)
  return res
}

const toDb = r => ({
  req_no: r.reqNo || null,
  dept: r.dept, name: r.name, email: r.email, agenda: r.agenda,
  sell_points: r.sellPoints || [], sell_note: r.sellNote || null, goal: r.goal || null,
  media: r.media || [],
  event_start: r.eventStart || null, event_end: r.eventEnd || null,
  wish_date: r.wishDate || null, wish_end: r.wishEnd || null,
  details: r.details || {}, sources: r.sources || [],
  source_link: r.sourceLink || null, source_later: !!r.sourceLater, has_plan: !!r.hasPlan,
})
const fromDb = row => ({
  id: row.id, reqNo: row.req_no,
  dept: row.dept, name: row.name, email: row.email, agenda: row.agenda,
  sellPoints: row.sell_points || [], sellNote: row.sell_note, goal: row.goal,
  media: row.media || [],
  eventStart: row.event_start, eventEnd: row.event_end,
  wishDate: row.wish_date, wishEnd: row.wish_end,
  details: row.details || {}, sources: row.sources || [],
  sourceLink: row.source_link, sourceLater: !!row.source_later, hasPlan: !!row.has_plan,
  status: row.status, owner: row.owner, rejectReason: row.reject_reason,
  linkedEvents: row.linked_events || [], memo: row.memo,
  createdAt: row.created_at,
})

export async function listRequests() {
  if (!REMOTE) return null
  try {
    const res = await req(`${API()}?select=*&order=created_at.desc`, { headers: { 'Content-Type': 'application/json' } })
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(fromDb) : null
  } catch { return null }
}

/* 접수 — 접수번호는 오늘 등록 건수 기준 순번 (todayCount는 호출측이 공개 보드에서 계산).
   주의('26.8 점검에서 발견): anon(미러 무로그인)은 원본 테이블 SELECT 정책이 없어
   return=representation이 INSERT째 거부된다 (RETURNING이 SELECT 권한을 요구) —
   무로그인이면 최소 응답으로 넣고 화면용 객체는 로컬에서 구성한다 */
export async function createRequest(r, todayCount) {
  const today = isoOf(new Date())
  const seq = todayCount != null ? todayCount + 1
    : (new Date().getHours() * 60 + new Date().getMinutes()) % 99 + 1
  const reqNo = makeReqNo(today, seq)
  const body = JSON.stringify({ ...toDb(r), req_no: reqNo })
  const token = await getAccessToken()
  if (!token) {
    await req(API(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body,
    })
    return { ...r, reqNo, status: '접수', createdAt: new Date().toISOString() }
  }
  const res = await req(API(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body,
  })
  const rows = await res.json()
  return fromDb(rows[0])
}

/* 상태, 배정, 메모 등 부분 PATCH — snake_case 키를 직접 받는다 (관리함 전용) */
export async function updateRequest(id, patch) {
  const res = await req(`${API()}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
  return fromDb((await res.json())[0])
}

export async function deleteRequest(id) {
  await req(`${API()}?id=eq.${id}`, { method: 'DELETE' })
}

/* ── 브랜드 소스 업로드 — 자동 압축 + ASCII 경로 (한글 파일명 사고 '26.7.27 규칙) ── */
export async function uploadLoungeSource(file) {
  if (!/^image\//i.test(file.type)) throw new Error('이미지 파일만 첨부할 수 있습니다, 영상은 링크로 전달해 주세요')
  const f = await compressImage(file)
  if (f.size > MAX_FILE) throw new Error(`파일이 10MB를 넘습니다 (${(f.size / 1048576).toFixed(1)}MB)`)
  const ext = (f.name.match(/\.([A-Za-z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
  const path = `src/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
  await req(`${STORE()}/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': f.type || 'application/octet-stream' },
    body: f,
  })
  return { name: f.name, path, size: f.size }
}

/* ── 공개 진행 현황 보드 ('26.8 전사 공개) — lounge_board 뷰 (개인정보 컬럼 제외).
   anon 키만으로 읽힘 (미러 무로그인). 뷰 미생성이면 null → 안내 문구 */
export async function listBoard() {
  if (!REMOTE) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lounge_board?select=*&order=created_at.desc&limit=100`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    if (!res.ok) return null
    const rows = await res.json()
    if (!Array.isArray(rows)) return null
    return rows.map(r => ({
      id: r.id, reqNo: r.req_no, dept: r.dept, name: r.name, agenda: r.agenda,
      media: r.media || [], goal: r.goal,
      eventStart: r.event_start, eventEnd: r.event_end,
      wishDate: r.wish_date, wishEnd: r.wish_end,
      status: r.status, owner: r.owner,
      linkedEvents: r.linked_events || [], createdAt: r.created_at,
    }))
  } catch { return null }
}

/* 게시 완료 카드의 집행 결과 이미지 — 확정 시 등록한 캘린더 일정의 첨부(공개 버킷)를
   재사용. 일정 읽기는 미러 anon SELECT 정책 기준이라 정책 미설정이면 조용히 빈 값 */
export async function listBoardImages(eventIds) {
  if (!REMOTE || !eventIds?.length) return {}
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/media_events?id=in.(${eventIds.join(',')})&select=id,images`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    )
    if (!res.ok) return {}
    const rows = await res.json()
    const map = {}
    for (const r of rows)
      if (Array.isArray(r.images) && r.images.length) map[r.id] = r.images.map(i => imageUrl(i.path))
    return map
  } catch { return {} }
}

/* 비공개 버킷이라 <img src>로 직접 못 씀 — 토큰 fetch 후 blob URL (관리함 열람용) */
export async function loungeSourceUrl(path) {
  const res = await req(`${STORE()}/authenticated/${BUCKET}/${path}`)
  return URL.createObjectURL(await res.blob())
}
