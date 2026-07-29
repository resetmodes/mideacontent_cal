/* RMN 광고주 공유 리포트 스토어 ('26.7.29) — data/rmn-share-setup.sql 필요.
   발급·회수 = 팀(team_writers) / 열람 = anon RPC (토큰+비밀번호, 30일 만료) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken, getSession } from './auth.js'

const API = `${SUPABASE_URL}/rest/v1`

async function authedReq(path, opts = {}) {
  const token = await getAccessToken()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const t = await res.text()
    if (res.status === 404 || /rmn_share/.test(t) && /not exist|relation/.test(t))
      throw new Error('공유 테이블이 아직 없습니다, data/rmn-share-setup.sql을 1회 실행하세요')
    throw new Error(`공유 처리 실패 (${res.status}) ${t.slice(0, 120)}`)
  }
  return res
}

/* 임시 비밀번호 — 8자, 혼동 문자(0/O/1/l) 제외 */
export function genPw() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  const buf = new Uint32Array(8)
  crypto.getRandomValues(buf)
  for (const v of buf) out += chars[v % chars.length]
  return out
}

/* 발급 — 스냅샷 저장, 토큰 반환 */
export async function createShare({ advertiser, campaign, data, pw = null, days = 30 }) {
  const expires = new Date(Date.now() + days * 86400000).toISOString()
  const res = await authedReq('/rmn_share', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      advertiser, campaign: campaign || null, data, pw,
      expires_at: expires, created_by: getSession()?.email || null,
    }),
  })
  return (await res.json())[0]   // { token, expires_at, ... }
}

/* 이 캠페인의 활성 링크 목록 (발급 모달에서 회수용) */
export async function listShares(advertiser, campaign) {
  const q = `advertiser=eq.${encodeURIComponent(advertiser)}` +
    (campaign ? `&campaign=eq.${encodeURIComponent(campaign)}` : '&campaign=is.null') +
    `&expires_at=gt.${new Date().toISOString()}&order=created_at.desc`
  const res = await authedReq(`/rmn_share?${q}&select=id,token,pw,expires_at,created_at,created_by`)
  return res.json()
}

export async function deleteShare(id) {
  await authedReq(`/rmn_share?id=eq.${id}`, { method: 'DELETE' })
}

/* ── 광고주 열람 (로그인 없음 — anon RPC) ── */
async function rpc(name, body) {
  const res = await fetch(`${API}/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('리포트를 불러올 수 없습니다, 링크를 다시 확인해 주세요')
  return res.json()
}

export const fetchShareMeta = token => rpc('get_rmn_share_meta', { p_token: token })
export const fetchShare = (token, pw) => rpc('get_rmn_share', { p_token: token, p_pw: pw || null })

export const shareUrl = token => `${window.location.origin}/?share=${token}`
