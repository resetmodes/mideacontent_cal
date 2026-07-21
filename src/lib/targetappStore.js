/* 타겟APP 실적 저장 어댑터 ('26.7) — Supabase 전용 (내부 전용 데이터).
   실적 수치는 번들 파일에 두지 않는다 — 공개 미러 번들로 새는 것 방지.
   테이블·RLS·'26.1~4월 이관분: data/targetapp-seed.sql (절차 supabase-setup.md 7장).
   테이블 미설정·로컬 모드·빈 데이터면 null 반환 → 화면은 안내 문구만 표시 */
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
  if (!res.ok) throw new Error(`targetapp ${res.status} — 테이블 설정 확인 (setup.md 7장)`)
  return res
}

const json = async res => res.json()

export async function listTargetApp() {
  if (!REMOTE) return null
  try {
    const [rows, media] = await Promise.all([
      req('targetapp_stats?select=*&order=year.asc,month.asc,office.asc').then(json),
      req('targetapp_media?select=*&order=exp.desc').then(json),
    ])
    if (!Array.isArray(rows) || rows.length === 0) return null
    return { rows, media: Array.isArray(media) ? media : [] }
  } catch {
    return null
  }
}

/* ── 어드민 입력용 CRUD ('26.7) — 쓰기는 RLS(team_writers)가 최종 차단 */
const toDb = r => ({
  year: r.year, month: r.month, office: r.office, name: r.name,
  period: r.period || null, media: r.media || [],
  exp: r.exp || 0, clk: r.clk || 0, vis: r.vis || 0, inst: r.inst || 0,
  note: r.note || null,
  /* 예산·비용 ('26.7 실적 대장 양식) — 값이 있을 때만 전송: 컬럼 추가 SQL(setup.md 7장)을
     아직 안 돌린 DB에서도 비용 없는 입력은 계속 동작 */
  ...(r.budget ? { budget: r.budget } : {}),
  ...(r.cost ? { cost: r.cost } : {}),
})

export async function createTargetApp(row) {
  const res = await req('targetapp_stats', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(toDb(row)),
  })
  return (await res.json())[0]
}

export async function updateTargetApp(id, row) {
  const res = await req(`targetapp_stats?id=eq.${id}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(toDb(row)),
  })
  return (await res.json())[0]
}

export async function deleteTargetApp(id) {
  await req(`targetapp_stats?id=eq.${id}`, { method: 'DELETE' })
}

/* 대체 업로드용 전체 삭제 ('26.7) — 어드민 엑셀 업로드의 "기존 실적 전체 삭제 후 반영"
   체크 시에만 호출. PostgREST는 필터 없는 delete를 거부하므로 전행 매칭 필터 사용 */
export async function deleteAllTargetApp() {
  await req('targetapp_stats?id=not.is.null', { method: 'DELETE' })
}
