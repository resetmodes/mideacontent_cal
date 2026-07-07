/* 캘린더 일정 자동 백업 ('26.7) — Supabase → data/backup/*.json
   .github/workflows/backup.yml이 주 1회 실행해 리포에 커밋 (git 이력 = 시점별 복원점)

   인증 (둘 중 하나):
   - SUPABASE_SERVICE_KEY 환경변수(GitHub Secret) — 전체 읽기 + 변경 이력까지 백업
   - 없으면 anon 키 — 미러 읽기 정책(mirror-setup.md 2장) 적용 후 일정만 백업 가능

   안전장치: 0건 응답이면 저장하지 않고 실패 처리 — RLS 차단/사고로 빈 백업이
   기존 백업을 덮어쓰는 일 방지 (SNS 수집 빈 결과 사고와 동일 원칙) */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'data', 'backup')

const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const KEY = SERVICE_KEY || SUPABASE_ANON_KEY
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function fetchAll(table, order) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}&limit=10000`, { headers })
  if (!res.ok) throw new Error(`${table} 조회 실패 (${res.status})`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error(`${table} 응답이 배열이 아님`)
  return rows
}

async function main() {
  const events = await fetchAll('media_events', 'date.asc,created_at.asc')
  if (events.length === 0) {
    console.error('❌ 일정 0건 — 저장하지 않음. 원인: ① anon 읽기 정책 미적용(mirror-setup.md) 또는')
    console.error('   SUPABASE_SERVICE_KEY 미설정 ② 실제 데이터 소실. 확인 후 재실행.')
    process.exit(1)
  }
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(
    join(OUT_DIR, 'media-events.json'),
    JSON.stringify({ count: events.length, events }, null, 1) + '\n', 'utf8'
  )
  console.log(`✅ data/backup/media-events.json — 일정 ${events.length}건`)

  if (SERVICE_KEY) {
    try {
      const hist = await fetchAll('media_events_history', 'changed_at.asc')
      await writeFile(
        join(OUT_DIR, 'media-events-history.json'),
        JSON.stringify({ count: hist.length, rows: hist }, null, 1) + '\n', 'utf8'
      )
      console.log(`✅ data/backup/media-events-history.json — 이력 ${hist.length}건`)
    } catch (e) {
      console.warn(`⚠ 이력 백업 생략 (${e.message}) — 이력 테이블 미설정일 수 있음`)
    }
  } else {
    console.log('· 이력 백업 생략 — SUPABASE_SERVICE_KEY 시크릿 설정 시 포함됨')
  }
}

main().catch(e => { console.error('❌ 백업 실패:', e.message); process.exit(1) })
