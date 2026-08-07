/* 내 일정 첨부 이미지 ('26.8) — 개인 할 일과 개인 일정에 붙는 이미지.

   event-images(공개 버킷)를 쓰지 않는다. 일정 첨부는 미러에서도 보여야 해서 공개지만,
   개인 할 일의 첨부는 링크만 알면 열리는 수준도 안 된다. 그래서 비공개 버킷 mytask-img를
   쓰고, 경로 첫 칸을 소유자 폴더로 둬 Storage 정책이 남의 폴더를 막는다.

   비공개라 <img src>로 직접 못 쓴다 — 토큰 fetch 후 blob URL (loungeStore와 같은 방식).
   SQL: data/mytask-setup.sql (setup.md 15장) */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js'
import { getAccessToken } from './auth.js'
import { compressImage } from './settleStore.js'
import { myEmail } from './myTaskStore.js'

const BUCKET = 'mytask-img'
export const MAX_IMAGES = 5
const MAX_FILE = 10 * 1024 * 1024
const STORE = `${SUPABASE_URL}/storage/v1/object`

/* 소유자 폴더 — Storage 키에 안전한 문자만 남긴다.
   mytask-setup.sql의 정책이 쓰는 replace(replace(email,'@','_'),'.','_')와 같은 규칙 */
const folderOf = () => myEmail().replace(/@/g, '_').replace(/\./g, '_')

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
  let detail = ''
  try { const j = await res.json(); detail = j.message || j.error || '' } catch { /* 본문 없음 */ }
  if (res.status === 404 || /bucket not found/i.test(detail))
    throw new Error('mytask-img 버킷이 없습니다, data/mytask-setup.sql 실행 필요 (setup.md 15장)')
  if (res.status === 403 || /row-level security|unauthorized|violates/i.test(detail))
    throw new Error(`업로드 권한 거부, Storage 정책 미생성 (setup.md 15장)${detail ? `, 서버: ${detail}` : ''}`)
  throw new Error(`이미지 업로드 실패 (${res.status})${detail ? `, ${detail}` : ''}`)
}

/* 업로드 — 반환 메타를 my_todos.images 또는 my_events.images에 넣어 저장할 것 */
export async function uploadMyImage(ownerKey, file) {
  if (!/^image\//i.test(file.type)) throw new Error('이미지 파일만 첨부할 수 있습니다 (JPG, PNG 등)')
  const f = await compressImage(file)
  if (f.size > MAX_FILE) throw new Error(`파일이 10MB를 넘습니다 (${(f.size / 1048576).toFixed(1)}MB)`)
  /* Storage 키는 ASCII만 — 한글 파일명은 경로에 쓰지 않고 메타(name)에만 보존 */
  const ext = (f.name.match(/\.([A-Za-z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
  const path = `${folderOf()}/${ownerKey}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
  await req(`${STORE}/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': f.type || 'application/octet-stream' },
    body: f,
  })
  return { name: f.name, path, size: f.size }
}

export async function removeMyImage(path) {
  await req(`${STORE}/${BUCKET}/${path}`, { method: 'DELETE' })
}

/* 비공개 버킷이라 토큰 fetch 후 blob URL — 호출측이 다 쓰면 revoke할 것 */
export async function myImageUrl(path) {
  const res = await req(`${STORE}/authenticated/${BUCKET}/${path}`)
  return URL.createObjectURL(await res.blob())
}

/* ImageAttach에 넘기는 어댑터 — 기본값(공개 event-images) 대신 이걸 쓰면 비공개로 저장된다 */
export const MY_IMAGE_API = {
  upload: uploadMyImage,
  remove: removeMyImage,
  resolve: myImageUrl,
  max: MAX_IMAGES,
}
