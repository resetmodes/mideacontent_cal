/* RMN 부킹 저장 어댑터 ('26.7) — Supabase 전용 (rmn_bookings, RLS 로그인 전용).
   광고주·단가·수수료 정보라 번들·미러에 싣지 않음 (targetappStore와 동일 원칙).
   테이블 미설정·로컬 모드면 null → 화면은 안내 문구만. SQL: data/rmn-setup.sql (setup.md 8장) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const API = () => `${SUPABASE_URL}/rest/v1/rmn_bookings`

async function req(path, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.status === 403) throw new Error('이 계정은 쓰기 권한이 없습니다 (team_writers 미등록)')
  if (!res.ok) throw new Error(`RMN ${res.status} — 테이블 설정 확인 (setup.md 8장)`)
  return res
}

const toDb = b => ({
  advertiser: b.advertiser, campaign: b.campaign || null, product: b.product,
  start_date: b.start_date, end_date: b.end_date || null,
  send_at: b.send_at || null, push_qty: b.push_qty || null,
  list_price: b.list_price || 0, discount_rate: b.discount_rate || 0,
  actual_price: b.actual_price || 0, net_amount: b.net_amount || 0,
  agency: b.agency || null, agency_manager: b.agency_manager || null,
  agency_phone: b.agency_phone || null, agency_email: b.agency_email || null,
  status: b.status, memo: b.memo || null,
  /* qty: 값 있을 때만 전송 (qty 컬럼 미설정 하위호환 — 단일 수량은 컬럼 없이도 동작) */
  ...(b.qty != null ? { qty: b.qty } : {}),
})

export async function listRmn() {
  if (!REMOTE) return null
  try {
    const res = await req(`${API()}?select=*&order=start_date.asc`)
    const rows = await res.json()
    return Array.isArray(rows) ? rows : null
  } catch {
    return null
  }
}

export async function createRmn(b) {
  const res = await req(API(), {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(toDb(b)),
  })
  return (await res.json())[0]
}

export async function updateRmn(id, patch) {
  const res = await req(`${API()}?id=eq.${id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch.advertiser !== undefined ? toDb(patch) : patch),
  })
  return (await res.json())[0]
}

export async function deleteRmn(id) {
  await req(`${API()}?id=eq.${id}`, { method: 'DELETE' })
}
