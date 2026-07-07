/* 브라우저 스모크 테스트 ('26.7 하네스) — 실행: npm run smoke
   UI를 건드린 변경은 verify에 더해 이걸 돌릴 것.

   하는 일 (전 과정 자동 — config.js 복원까지 책임짐):
   1. src/config.js 백업 → 로컬 모드(빈 키)로 전환 → 빌드 → preview 서버
   2. 실제 브라우저로 핵심 플로우 확인 (로그인 게이트 우회 없이 로컬 모드라 바로 열림)
   3. 서버 종료 → config.js 원복 → 실키 기준 재빌드 (finally 블록 — 실패해도 복원됨)

   playwright/크로미움이 없는 환경에서는 안내만 출력하고 통과(exit 0) —
   그 경우 UI 검증은 배포 후 실사이트에서 수동 확인 필요 */

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { spawn, execSync } from 'node:child_process'
import { join } from 'node:path'

const CONFIG = 'src/config.js'
const PORT = 4399

/* playwright 로드 — 로컬 설치 → 전역(이 리포의 원격 환경) 순서로 시도 */
async function loadPlaywright() {
  try { return await import('playwright') } catch { /* 다음 */ }
  try { return await import('/opt/node22/lib/node_modules/playwright/index.js') } catch { return null }
}
/* 크로미움 실행 파일 — 기본 탐색 실패 시 /opt/pw-browsers에서 찾기 */
async function findChromium() {
  try {
    const dirs = await readdir('/opt/pw-browsers')
    const d = dirs.find(x => /^chromium-\d+$/.test(x))
    if (d) return `/opt/pw-browsers/${d}/chrome-linux/chrome`
  } catch { /* 없음 */ }
  return null
}

const pwMod = await loadPlaywright()
if (!pwMod) {
  console.log('· playwright 미설치 — 브라우저 스모크 생략 (npm i -D playwright 후 재실행 가능)')
  process.exit(0)
}
const { chromium } = pwMod.default || pwMod

const orig = await readFile(CONFIG, 'utf8')
if (!orig.includes('supabase.co')) {
  console.error('❌ config.js가 이미 로컬 모드 상태 — 먼저 실키로 복원한 뒤 실행할 것')
  process.exit(1)
}

let server = null
let failed = 0
const ok = m => console.log('✓ ' + m)
const bad = m => { failed++; console.error('✗ ' + m) }

try {
  await writeFile(CONFIG, "export const SUPABASE_URL = ''\nexport const SUPABASE_ANON_KEY = ''\n")
  execSync('npx vite build', { stdio: 'pipe' })
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' })
  for (let i = 0; i < 30; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/`); break }
    catch { await new Promise(r => setTimeout(r, 500)) }
  }

  const exe = await findChromium()
  const browser = await chromium.launch(exe ? { executablePath: exe } : {}).catch(async e => {
    console.log('· 크로미움 실행 실패 — 스모크 생략 (' + e.message.split('\n')[0] + ')')
    return null
  })
  if (!browser) process.exit(0)

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })

  // 1. 캘린더 렌더 (로컬 모드 = 게이트 없음)
  await page.waitForSelector('.cal-wrap', { timeout: 8000 })
  ok('캘린더 렌더')

  // 2. 탭 4개
  const tabs = await page.$$eval('.tabs button', els => els.map(e => e.textContent.trim()))
  ;['매체 캘린더', '촬영일정', '매체 스펙', 'SNS 모니터링'].every(t => tabs.includes(t))
    ? ok('탭 4종: ' + tabs.slice(0, 4).join('/')) : bad('탭 구성 이상: ' + JSON.stringify(tabs))

  // 3. 빠른 입력 → 등록 → 검색 → 모달
  await page.fill('.qa-input', '12/20 스모크 테스트 인스타 #스모크')
  await page.click('.qa-btn')
  await page.waitForTimeout(400)
  await page.fill('.cal-search', '스모크 테스트')
  await page.waitForSelector('.srch-ev', { timeout: 4000 })
  await page.click('.srch-ev')
  await page.waitForSelector('.modal', { timeout: 4000 })
  ok('빠른 입력 → 검색 → 모달')

  // 4. 스펙 탭 렌더
  await page.click('.modal .btn-ghost:has-text("닫기")')
  await page.click('.tabs button:has-text("매체 스펙")')
  await page.waitForSelector('.media', { timeout: 4000 })
  ok('매체 스펙 렌더')

  // 5. 모니터링 렌더
  await page.click('.tabs button:has-text("SNS 모니터링")')
  await page.waitForSelector('.mon-table', { timeout: 4000 })
  ok('SNS 모니터링 렌더')

  pageErrors.length ? bad('페이지 에러: ' + pageErrors.join(' | ')) : ok('페이지 에러 없음')
  await browser.close()
} finally {
  if (server) server.kill()
  await writeFile(CONFIG, orig)                      // 실키 복원 — 어떤 경우에도 실행
  execSync('npx vite build', { stdio: 'pipe' })      // dist도 실키 기준으로 되돌림
  console.log('· config.js 원복 + 실키 재빌드 완료')
}

console.log(failed ? `\n스모크 실패 ${failed}건` : '\n브라우저 스모크: 전부 통과')
if (failed) process.exit(1)
