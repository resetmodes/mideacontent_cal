/* 월간 리포트 스냅샷 저장 ('26.7.31) — Supabase monthly_reports (setup.md 13장)
   확정 시점의 수치와 서술을 그대로 얼려 보관한다 — 나중에 수집 데이터가 갱신돼도
   발행된 리포트는 변하지 않는다 (광고주 공유 리포트와 같은 원칙).
   테이블 미설정이면 조회는 null, 저장은 에러 (다른 기능 무영향) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

async function req(path, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.status === 403) throw new Error('이 계정은 쓰기 권한이 없습니다 (team_writers 미등록)')
  if (!res.ok) throw new Error(`리포트 저장소 ${res.status} (setup.md 13장 확인)`)
  return res
}

export async function getReport(ym) {
  if (!REMOTE) return null
  try {
    const res = await req(`monthly_reports?ym=eq.${ym}&select=*`)
    const rows = await res.json()
    return rows[0] || null
  } catch { return null }
}

export async function saveReport(ym, data, narration) {
  const res = await req('monthly_reports?on_conflict=ym', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ ym, data, narration, updated_at: new Date().toISOString() }),
  })
  return (await res.json())[0]
}

export async function deleteReport(ym) {
  await req(`monthly_reports?ym=eq.${ym}`, { method: 'DELETE' })
}
