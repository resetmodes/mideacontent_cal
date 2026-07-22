/* 정산 저장 어댑터 ('26.7) — Supabase 전용 (settlements 테이블 + settle-docs Storage 버킷).
   증빙 파일·금액 정보라 번들·미러에 싣지 않음 (rmnStore와 동일 원칙).
   테이블 미설정·로컬 모드면 null → 화면은 안내 문구만. SQL: data/settle-setup.sql (setup.md 9장)

   첨부 파일:
   - 이미지는 업로드 전 브라우저에서 자동 압축 (긴 변 1600px JPEG — 3~5MB 폰 사진이 ~300KB로)
   - PDF 등 비이미지는 원본 유지, 파일당 10MB 상한
   - 실파일은 Storage({정산id}/{슬롯}_{파일명}), settlements.files에 메타만 저장 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'

const REMOTE = !!(SUPABASE_URL && SUPABASE_ANON_KEY)
const API = () => `${SUPABASE_URL}/rest/v1/settlements`
const STORE = () => `${SUPABASE_URL}/storage/v1/object`
const BUCKET = 'settle-docs'
export const MAX_FILE = 10 * 1024 * 1024   // 10MB

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
  if (res.status === 403) throw new Error('이 계정은 쓰기 권한이 없습니다 (team_writers 미등록)')
  if (!res.ok) throw new Error(`정산 ${res.status} — 테이블·버킷 설정 확인 (setup.md 9장)`)
  return res
}

const toDb = s => ({
  stype: s.stype, title: s.title, owner_email: s.owner_email || null, owner_name: s.owner_name || null,
  month: s.month || null, amount: s.amount || 0,
  account: s.account || null, easy_doc: s.easy_doc || null,
  alloc: s.alloc || null, alloc_excluded: s.alloc_excluded || null,
  recurring: !!s.recurring, status: s.status || '작성',
  files: s.files || [], memo: s.memo || null,
})

export async function listSettle() {
  if (!REMOTE) return null
  try {
    const res = await req(`${API()}?select=*&order=created_at.desc`, { headers: { 'Content-Type': 'application/json' } })
    const rows = await res.json()
    return Array.isArray(rows) ? rows : null
  } catch {
    return null
  }
}

export async function createSettle(s) {
  const res = await req(API(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(toDb(s)),
  })
  return (await res.json())[0]
}

export async function updateSettle(id, patch) {
  const res = await req(`${API()}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  return (await res.json())[0]
}

export async function deleteSettle(id) {
  await req(`${API()}?id=eq.${id}`, { method: 'DELETE' })
}

/* ── 이미지 자동 압축 — 긴 변 1600px JPEG 0.85. 비이미지는 그대로 통과 ── */
export async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type)) return file
  try {
    const bmp = await createImageBitmap(file)
    const MAXPX = 1600
    const scale = Math.min(1, MAXPX / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file   // 압축이 오히려 크면 원본
    return new File([blob], file.name.replace(/\.(png|webp|heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file   // 압축 실패(HEIC 미지원 브라우저 등)는 원본 그대로
  }
}

/* 업로드 — 반환 메타를 settlements.files에 추가해 저장할 것 */
export async function uploadSettleFile(settleId, file, slot) {
  const f = await compressImage(file)
  if (f.size > MAX_FILE) throw new Error(`파일이 10MB를 넘습니다 (${(f.size / 1048576).toFixed(1)}MB) — PDF 분할·이미지 변환 후 재시도`)
  const safe = f.name.replace(/[^\w가-힣.\-]/g, '_')
  const path = `${settleId}/${slot}_${Date.now()}_${safe}`
  await req(`${STORE()}/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: f,
  })
  return { name: f.name, path, size: f.size, slot }
}

/* 다운로드 — 비공개 버킷이라 토큰 필요. blob 반환 (개별 저장·ZIP 묶음 공용) */
export async function downloadSettleFile(path) {
  const res = await req(`${STORE()}/authenticated/${BUCKET}/${path}`)
  return res.blob()
}

export async function removeSettleFile(path) {
  await req(`${STORE()}/${BUCKET}/${path}`, { method: 'DELETE' })
}

/* blob 저장 헬퍼 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
