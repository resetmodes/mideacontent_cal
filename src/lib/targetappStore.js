/* 타겟APP 실적 저장 어댑터 ('26.7) — Supabase 전용 (내부 전용 데이터).
   실적 수치는 번들 파일에 두지 않는다 — 공개 미러 번들로 새는 것 방지.
   테이블·RLS·'26.1~4월 이관분: data/targetapp-seed.sql (절차 supabase-setup.md 7장).
   테이블 미설정·로컬 모드·빈 데이터면 null 반환 → 화면은 안내 문구만 표시 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

async function req(path) {
  const token = await getAccessToken()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`targetapp ${res.status}`)
  return res.json()
}

export async function listTargetApp() {
  if (!REMOTE) return null
  try {
    const [rows, media] = await Promise.all([
      req('targetapp_stats?select=*&order=year.asc,month.asc,office.asc'),
      req('targetapp_media?select=*&order=exp.desc'),
    ])
    if (!Array.isArray(rows) || rows.length === 0) return null
    return { rows, media: Array.isArray(media) ? media : [] }
  } catch {
    return null
  }
}
