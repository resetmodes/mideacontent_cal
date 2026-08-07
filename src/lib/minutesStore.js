/* 회의록 저장 어댑터 ('26.8) — meeting_minutes + minutes-audio 비공개 버킷.

   회의 내용은 개인 데이터와 같은 급이라 my_* 와 같은 owner-or-shared RLS를 쓴다.
   테이블 미설정이면 목록은 null → 화면은 안내 문구만 (myTaskStore와 동일 원칙).
   SQL: data/minutes-setup.sql (setup.md 16장) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken, getSession } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const api = t => `${SUPABASE_URL}/rest/v1/${t}`
const STORE = `${SUPABASE_URL}/storage/v1/object`
const BUCKET = 'minutes-audio'
export const myEmail = () => (getSession()?.email || '').toLowerCase()

/* 소유자 폴더 — minutes-setup.sql 정책의 replace(replace(email,'@','_'),'.','_') 와 같은 규칙 */
const folderOf = () => myEmail().replace(/@/g, '_').replace(/\./g, '_')

async function req(url, options = {}, json = true) {
  const token = await getAccessToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (res.ok) return res
  let detail = ''
  try { const j = await res.json(); detail = j.message || j.error || '' } catch { /* 본문 없음 */ }
  if (res.status === 403) throw new Error('이 계정은 이 회의록을 바꿀 권한이 없습니다')
  if (res.status === 404 || /bucket not found/i.test(detail))
    throw new Error('회의록 테이블이나 버킷이 없습니다, data/minutes-setup.sql 실행 필요 (setup.md 16장)')
  throw new Error(`회의록 ${res.status}${detail ? `, ${detail}` : ''}`)
}
const one = async res => (await res.json())[0]
const REP = { Prefer: 'return=representation' }

const from = r => ({
  id: r.id, title: r.title, date: r.met_on, dur: r.dur_sec || 0,
  audioPath: r.audio_path || null, source: r.source || 'browser',
  transcript: r.transcript || '', summary: r.summary || null,
  todoIds: r.todo_ids || {}, shared: r.shared_with || [], sharedEdit: !!r.shared_edit,
  owner: r.owner_email, createdAt: r.created_at,
})

export async function listMinutes() {
  if (!REMOTE) return null
  try {
    const res = await req(`${api('meeting_minutes')}?select=*&order=met_on.desc,created_at.desc`)
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(from) : null
  } catch { return null }
}

export async function createMinutes({ title, date, dur = 0, transcript = '', source = 'browser', audioPath = null }) {
  const body = {
    owner_email: myEmail(), title, met_on: date, dur_sec: dur,
    transcript, source,
  }
  if (audioPath) body.audio_path = audioPath
  const res = await req(api('meeting_minutes'), { method: 'POST', headers: REP, body: JSON.stringify(body) })
  return from(await one(res))
}

export async function updateMinutes(id, patch) {
  const body = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.date !== undefined) body.met_on = patch.date
  if (patch.transcript !== undefined) body.transcript = patch.transcript
  if (patch.summary !== undefined) body.summary = patch.summary
  if (patch.todoIds !== undefined) body.todo_ids = patch.todoIds
  if (patch.audioPath !== undefined) body.audio_path = patch.audioPath
  if (patch.shared !== undefined) body.shared_with = patch.shared
  if (patch.sharedEdit !== undefined) body.shared_edit = patch.sharedEdit
  const res = await req(`${api('meeting_minutes')}?id=eq.${id}`, {
    method: 'PATCH', headers: REP, body: JSON.stringify(body),
  })
  return from(await one(res))
}

export async function deleteMinutes(id, audioPath) {
  if (audioPath) await removeAudio(audioPath).catch(() => {})
  await req(`${api('meeting_minutes')}?id=eq.${id}`, { method: 'DELETE' })
}

/* ── 녹음 파일 ── */
/* 업로드 — 경로 첫 칸이 소유자 폴더라 남의 폴더는 Storage 정책이 막는다.
   확장자는 브라우저가 준 MIME에서 뽑는다 (크롬 webm, 사파리 mp4) */
export async function uploadAudio(blob, id) {
  const ext = /mp4|m4a/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'
  const path = `${folderOf()}/${id}_${Date.now()}.${ext}`
  await req(`${STORE}/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  }, false)
  return path
}

export async function removeAudio(path) {
  await req(`${STORE}/${BUCKET}/${path}`, { method: 'DELETE' }, false)
}

/* 비공개 버킷이라 <audio src>로 못 씀 — 토큰 fetch 후 blob URL (다 쓰면 revoke) */
export async function audioUrl(path) {
  const res = await req(`${STORE}/authenticated/${BUCKET}/${path}`, {}, false)
  return URL.createObjectURL(await res.blob())
}

/* ── 요약 (Vercel 함수) ── */
export async function summarize(transcript, title) {
  const token = await getAccessToken()
  const res = await fetch('/api/minutes-summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify({ transcript, title }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `요약 실패 (${res.status})`)
  return data
}
