/* 일정 저장 어댑터 — Supabase 키가 있으면 팀 공유 DB, 없으면 localStorage
   테이블 스키마·RLS 정책은 data/supabase-setup.md 참고.
   REMOTE 모드에서는 로그인한 사용자의 토큰으로만 접근 가능 (RLS: auth.uid() is not null) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const TABLE = 'media_events'
const API = `${SUPABASE_URL}/rest/v1/${TABLE}`

export const storageMode = REMOTE ? 'supabase' : 'local'

/* kind('촬영')·perf_url(실적 확정)은 조건부 전송 — 해당 컬럼이 아직 없는 DB에서도
   일반 일정 등록·수정은 깨지지 않게 (촬영·실적확정만 setup.md 5장 SQL 필요)
   perfUrl은 명시적으로 넘길 때만 포함 (null = 확정 해제) */
const toDb = e => ({
  title: e.title, date: e.date, end_date: e.endDate || null,
  channel: e.channel, sub: e.sub || null, campaign: e.campaign || null,
  owner: e.owner || null, memo: e.memo || null,
  ...(e.kind ? { kind: e.kind } : {}),
  ...(e.perfUrl !== undefined ? { perf_url: e.perfUrl } : {}),
})
const fromDb = r => ({
  id: r.id, title: r.title, date: r.date, endDate: r.end_date,
  channel: r.channel, sub: r.sub, campaign: r.campaign,
  owner: r.owner, memo: r.memo, kind: r.kind || null,
  perfUrl: r.perf_url ?? null, createdAt: r.created_at,
})

const KEY = 'media-cal-events'
const load = () => JSON.parse(localStorage.getItem(KEY) || '[]')
const save = a => localStorage.setItem(KEY, JSON.stringify(a))

async function req(url, options = {}) {
  const token = await getAccessToken()
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers,
  }
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401) throw new Error('로그인이 필요하거나 세션이 만료됨 — 다시 로그인해 주세요')
  if (res.status === 403) throw new Error('이 계정은 읽기 전용 — 등록·수정 권한이 없습니다 (권한 문의: 미디어콘텐츠팀)')
  if (!res.ok) throw new Error(`서버 응답 ${res.status} — Supabase 설정 확인 필요`)
  return res
}

export async function listEvents() {
  if (REMOTE) {
    const res = await req(`${API}?select=*&order=date.asc`)
    return (await res.json()).map(fromDb)
  }
  return load()
}

export async function createEvent(e) {
  if (REMOTE) {
    const res = await req(API, {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify(toDb(e)),
    })
    return fromDb((await res.json())[0])
  }
  const ev = { ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  save([...load(), ev])
  return ev
}

export async function updateEvent(id, patch) {
  if (REMOTE) {
    const res = await req(`${API}?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify(toDb(patch)),
    })
    return fromDb((await res.json())[0])
  }
  const next = load().map(e => (e.id === id ? { ...e, ...patch } : e))
  save(next)
  return next.find(e => e.id === id)
}

export async function deleteEvent(id) {
  if (REMOTE) {
    await req(`${API}?id=eq.${id}`, { method: 'DELETE' })
    return
  }
  save(load().filter(e => e.id !== id))
}

/* 변경 이력 ('26.7) — DB 트리거가 등록·수정·삭제를 자동 기록 (setup.md 6장).
   REMOTE 모드 전용: 로컬 모드는 빈 배열 (이력 UI 자동 숨김) */
const HIST_API = `${SUPABASE_URL}/rest/v1/media_events_history`

export async function listHistory(eventId) {
  if (!REMOTE) return []
  const res = await req(`${HIST_API}?event_id=eq.${eventId}&order=changed_at.desc&limit=50`)
  return res.json()
}

export async function listDeleted(days = 30) {
  if (!REMOTE) return []
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const res = await req(`${HIST_API}?action=eq.DELETE&changed_at=gte.${since}&order=changed_at.desc&limit=100`)
  return res.json()
}

/* 캠페인 이름 변경 — to가 기존 캠페인명이면 자연스럽게 통합됨 */
export async function renameCampaign(from, to) {
  if (REMOTE) {
    await req(`${API}?campaign=eq.${encodeURIComponent(from)}`, {
      method: 'PATCH',
      body: JSON.stringify({ campaign: to }),
    })
    return
  }
  save(load().map(e => (e.campaign === from ? { ...e, campaign: to } : e)))
}
