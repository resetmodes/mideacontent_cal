/* 일정 이미지 첨부 ('26.7) — 결과·시안 보고용. 실파일은 event-images 공개 버킷,
   메타({name, path, size})는 media_events.images jsonb (setup.md 10장 SQL — 미실행 시
   첨부 저장만 실패, 기존 기능 무영향).

   공개 버킷인 이유: 캘린더를 매체 보고용으로 쓰는 목적상 미러(로그인 없는 읽기 전용)에서도
   이미지가 보여야 함 — 일정 자체가 미러 anon SELECT로 공개되는 것과 같은 수준.
   경로에 일정 UUID + 타임스탬프가 들어가 링크 소지자 외 추측 열람은 사실상 불가.
   업로드·삭제는 로그인 + team_writers 전용 (Storage RLS).

   압축은 정산 탭과 동일(settleStore.compressImage — 긴 변 1600px JPEG, 3~5MB 폰 사진 → ~300KB).
   일정 삭제 시 파일은 보존 — 어드민 "삭제 복원"이 이미지까지 살리기 위함 (개별 × 삭제만 실파일 제거) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'
import { compressImage } from './settleStore.js'

const BUCKET = 'event-images'
export const MAX_IMAGES = 5                  // 일정당 최대 장수
const MAX_FILE = 10 * 1024 * 1024            // 압축 후에도 10MB 넘으면 거부

/* 공개 버킷 URL — 미러·읽기 전용 뷰에서도 토큰 없이 표시됨 */
export const imageUrl = path => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

async function req(url, options = {}) {
  const token = await getAccessToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      ...options.headers,
    },
  })
  if (res.ok) return res
  /* Storage는 실패 사유를 본문에 담아 줌 — 상태코드만으로 뭉뚱그리면 오진('26.7.24).
     버킷 없음 / 권한(RLS) / 그 외를 구분하고, 서버 원문도 함께 노출해 진단이 바로 되게 */
  let detail = ''
  try { const j = await res.json(); detail = j.message || j.error || '' } catch { /* 본문 없음 */ }
  if (res.status === 404 || /bucket not found/i.test(detail))
    throw new Error('event-images 버킷이 없습니다, Supabase Storage에 버킷 생성 필요 (setup.md 10장)')
  if (res.status === 403 || /row-level security|unauthorized|violates/i.test(detail))
    throw new Error(`업로드 권한 거부, Storage 정책 미생성이거나 team_writers 미등록 (setup.md 10장)${detail ? `, 서버: ${detail}` : ''}`)
  throw new Error(`이미지 업로드 실패 (${res.status})${detail ? `, ${detail}` : ''}`)
}

/* 업로드 — 반환 메타를 media_events.images에 추가해 저장할 것 (store.updateEventImages) */
export async function uploadEventImage(eventId, file) {
  if (!/^image\//i.test(file.type)) throw new Error('이미지 파일만 첨부할 수 있습니다 (JPG, PNG 등)')
  const f = await compressImage(file)
  if (f.size > MAX_FILE) throw new Error(`파일이 10MB를 넘습니다 (${(f.size / 1048576).toFixed(1)}MB)`)
  /* Storage 키는 ASCII만 허용 — 한글 파일명은 "Invalid key" 400 ('26.7.27 사고).
     경로는 타임스탬프+난수로 만들고, 원본 이름(한글 포함)은 메타(name)에만 보존 */
  const ext = (f.name.match(/\.([A-Za-z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
  const path = `${eventId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
  /* x-upsert 미사용 — 경로에 타임스탬프가 있어 충돌이 없고, upsert는 INSERT 외에
     UPDATE 정책까지 요구해 RLS에 걸릴 수 있음 ('26.7.24) */
  await req(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': f.type || 'application/octet-stream' },
    body: f,
  })
  return { name: f.name, path, size: f.size }
}

/* 실파일 삭제 — 개별 × 버튼 전용. 실패해도 메타는 이미 지워져 화면엔 안 보임 (best-effort) */
export async function removeEventImage(path) {
  await req(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE' })
}
