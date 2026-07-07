/* Supabase Auth — 팀 계정 로그인 (이메일·비밀번호)
   계정 발급 절차는 data/supabase-setup.md 4장 참고.
   supabase-js 없이 REST 엔드포인트 직접 호출 (store.js와 동일한 방식 유지) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'

const KEY = 'media-cal-session'
const AUTH_API = `${SUPABASE_URL}/auth/v1`

const loadSession = () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } }
const saveSession = s => { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY) }

let session = loadSession()
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn(session))

export const onAuthChange = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export const getSession = () => session

function setFromTokenResponse(data, email) {
  session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    email: email || session?.email,
  }
  saveSession(session)
  notify()
}

const ERROR_KO = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다',
  'Email not confirmed': '이메일 인증이 완료되지 않은 계정입니다 — 담당자에게 문의',
}

export async function signIn(email, password) {
  const res = await fetch(`${AUTH_API}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error_description || data.msg
    throw new Error(ERROR_KO[msg] || msg || '로그인 실패 — 이메일·비밀번호 확인')
  }
  setFromTokenResponse(data, email)
}

export function signOut() {
  session = null
  saveSession(null)
  notify()
}

async function refresh() {
  if (!session?.refreshToken) throw new Error('세션 만료 — 다시 로그인 필요')
  const res = await fetch(`${AUTH_API}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
  const data = await res.json()
  if (!res.ok) { signOut(); throw new Error('세션 만료 — 다시 로그인 필요') }
  setFromTokenResponse(data)
}

/* 만료 1분 전이면 자동 갱신 — 매 API 호출 전에 호출 */
export async function getAccessToken() {
  if (!session) return null
  if (Date.now() > session.expiresAt - 60_000) await refresh()
  return session.accessToken
}
