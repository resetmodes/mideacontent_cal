/* UI 전수 조사 ('26.7.30 하네스) — 실행: npm run audit

   smoke가 "핵심 플로우가 도는가"를 보는 반면 이건 "화면이 깨진 데가 있는가"를 훑는다.
   탭 9개 × 폭 4개 × 공유 뷰 3개를 돌면서 아래를 모은다.

   - JS 오류와 콘솔 경고 (리액트 key 중복, 훅 경고 포함)
   - 요소가 화면 밖으로 나감 (스크롤 컨테이너 안이거나 잘리는 건 제외)
   - 문서 가로 스크롤
   - 문자열 규칙 위반 문자 (중점, em dash, 화살표, 말줄임표)
   - 이름 없는 버튼 (스크린리더가 읽을 게 없는 버튼)
   - 깨진 이미지

   시드 데이터를 가짜 응답으로 주입하므로 실 Supabase에 접속하지 않는다.
   긴 제목 모드(--long)는 같은 화면을 아주 긴 문자열로 밀어붙여 말줄임 처리를 확인한다.

   playwright가 없으면 안내만 출력하고 통과 — smoke.mjs와 같은 원칙 */

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { spawn, execSync } from 'node:child_process'

const PORT = 4398
const LONG_MODE = process.argv.includes('--long')

async function loadPlaywright() {
  try { return await import('playwright') } catch { /* 다음 */ }
  try { return await import('/opt/node22/lib/node_modules/playwright/index.js') } catch { return null }
}
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
  console.log('· playwright 미설치 — UI 전수 조사 생략')
  process.exit(0)
}
const { chromium } = pwMod.default || pwMod

/* ── 시드 ─────────────────────────────────────────────── */
const LONG = '더현대서울 도쿄장난감미술관 팝업스토어 오픈 기념 인스타그램 릴스 콘텐츠 업로드 안내'
let seq = 0
const ev = o => ({
  id: 'e' + (++seq), title: LONG_MODE ? LONG : '샘플 일정', date: '2026-07-15', end_date: null,
  channel: '기타', sub: null, campaign: null, owner: '노규빈 책임', memo: null, kind: null,
  perf_url: null, images: null, notion_id: null, notion_gone: false,
  created_at: '2026-07-01T00:00:00Z', ...o,
})
const EVENTS = [
  ev({ channel: '인스타', sub: '공식', date: '2026-07-24', campaign: '썸머페스타' }),
  ev({ channel: '유튜브', sub: '공식', date: '2026-07-08', campaign: '썸머페스타' }),
  ...['아파트너', '바이비', '키즈노트', '리멤버', '아파트아이', '하이클래스', '에브리타임', '위버스']
    .map(s => ev({ channel: '타겟APP', sub: s, date: '2026-07-01', end_date: '2026-07-14', campaign: '썸머페스타' })),
  ev({ channel: '카카오톡', sub: '친구톡', date: '2026-07-22', campaign: '썸머페스타' }),
  ev({ channel: '백화점APP', sub: '팝업', date: '2026-07-08', end_date: '2026-07-14' }),
  ev({ channel: '버스광고', date: '2026-07-05', end_date: '2026-08-04' }),
  ev({ channel: '연차', kind: '팀', date: '2026-07-31' }),
  ev({ channel: '기념일', sub: '생일', kind: '팀', date: '2026-07-30' }),
  ev({ channel: '유튜브', sub: '공식', kind: '촬영', date: '2026-08-01' }),
  ev({ kind: '휴점', title: '휴점', date: '2026-08-10' }),
]
const ADV = LONG_MODE ? '아주긴광고주명주식회사코리아리테일' : '까르띠에'
const RMN = [
  { id: 'r1', advertiser: ADV, campaign: LONG_MODE ? LONG.slice(0, 25) : '홀리데이', product: '메인배너',
    qty: 1, start_date: '2026-07-01', end_date: '2026-07-14', list_price: 14000000, discount: 10,
    actual_price: 12600000, net_amount: 12600000, agency: '', status: '집행',
    impressions: 2410000, clicks: 18400, created_at: '2026-06-20T00:00:00Z' },
  { id: 'r2', advertiser: ADV, campaign: '', product: '팝업배너', qty: 3, start_date: '2026-08-01',
    end_date: '2026-08-07', list_price: 9000000, discount: 20, actual_price: 7200000,
    net_amount: 7200000, agency: '', status: '가부킹', created_at: '2026-07-10T00:00:00Z' },
  { id: 'r3', advertiser: ADV, campaign: '', product: '카카오톡', qty: 1, start_date: '2026-07-20',
    end_date: '2026-07-20', send_date: '2026-07-20', send_time: '11:00', msg_count: 150000,
    list_price: 15000000, discount: 0, actual_price: 15000000, net_amount: 15000000,
    agency: '', status: '취소', created_at: '2026-07-01T00:00:00Z' },
]
const SETTLE = [
  { id: 's1', stype: '법인카드', title: LONG_MODE ? LONG : '클로드 맥스 7월 구독', month: '2026-07',
    amount: 320000, account: '광고선전비', owner_name: '노규빈 책임', status: '작성', files: [],
    recurring: false, created_at: '2026-07-05T00:00:00Z' },
  { id: 's2', stype: '세금계산서', title: '영상 제작비', month: '2026-07', amount: 19102500,
    owner_name: '박준영 전임', status: '증빙 완료', files: [], created_at: '2026-07-08T00:00:00Z' },
]
const TA = [{ id: 1, year: 2026, month: 7, office: '본점', name: '썸머페스타', period: '7.1~7.14',
  media: ['아파트너'], exp: 9120000, clk: 25400, vis: 8100, inst: 240, note: null }]

/* 내 일정 ('26.8) — 개인 데이터라 media_events와 완전히 분리된 테이블 */
const ME = 'kyuvin@thehyundai.com'
const MY_SPACES = [
  { id: 'sp1', owner_email: ME, name: '업무', color: '#0B4336', sort: 0 },
  { id: 'sp2', owner_email: ME, name: LONG_MODE ? LONG.slice(0, 20) : '개인', color: '#CFA3BD', sort: 1 },
]
const MY_TODOS = [
  { id: 't1', owner_email: ME, txt: LONG_MODE ? LONG : '임원 보고 자료 초안', space_id: 'sp1',
    done: false, shared_with: [], shared_edit: false, sort: 0, created_at: '2026-08-01T00:00:00Z' },
  { id: 't2', owner_email: ME, txt: '유튜브 섬네일 시안 확인', space_id: null, done: true,
    shared_with: ['jykim84@thehyundai.com'], shared_edit: true, sort: 1, created_at: '2026-08-02T00:00:00Z' },
]
const MY_EVENTS = [
  { id: 'm1', owner_email: ME, title: LONG_MODE ? LONG : '촬영 콘티 리뷰', on_date: '2026-07-24',
    at_time: '10:00', dur_min: 90, space_id: 'sp1', linked_id: null, shared_with: [],
    shared_edit: false, memo: null, created_at: '2026-08-01T00:00:00Z' },
  { id: 'm2', owner_email: ME, title: '월간 리포트 마감', on_date: '2026-07-24', at_time: '10:30',
    dur_min: 60, space_id: null, linked_id: 'e1', shared_with: [], shared_edit: false,
    memo: null, created_at: '2026-08-01T00:00:00Z' },
  { id: 'm3', owner_email: ME, title: '종일 외근', on_date: '2026-07-31', at_time: null,
    dur_min: 60, space_id: 'sp2', linked_id: null, shared_with: [], shared_edit: false,
    memo: null, created_at: '2026-08-01T00:00:00Z' },
]

const respond = url => {
  const t = s => new RegExp(`/rest/v1/${s}`).test(url)
  if (t('media_events_history')) return []
  if (t('media_events')) return EVENTS
  if (t('targetapp_stats')) return TA
  if (t('rmn_bookings')) return RMN
  if (t('settlements')) return SETTLE
  if (t('my_spaces')) return MY_SPACES
  if (t('my_todos')) return MY_TODOS
  if (t('my_events')) return MY_EVENTS
  return []
}

/* ── 브라우저에서 돌릴 검사 ──────────────────────────── */
const PROBE = `(() => {
  const W = document.documentElement.clientWidth
  const over = [], noname = [], badimg = [], ctx = []
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.width && b.height && (b.right > W + 1 || b.left < -1)) {
      /* 가로 스크롤 컨테이너나 잘라내는 조상 안이면 정상 */
      let a = el, clipped = false
      while (a && a !== document.body) {
        if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break }
        a = a.parentElement
      }
      if (!clipped) over.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0])
    }
    if (el.tagName === 'BUTTON' && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.title)
      noname.push('button.' + (el.className || '').toString().split(' ')[0])
    /* 같은 오리진 이미지만 본다 — 유튜브 썸네일 같은 외부 주소는 이 환경에서 막혀 있고,
       실제로 404가 나도 onError로 숨기게 해뒀다 */
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0
        && el.getAttribute('src') && !el.getAttribute('src').startsWith('http'))
      badimg.push(el.getAttribute('src').slice(0, 60))
    if (el.children.length === 0 && /[\\u00b7\\u2014\\u2192\\u2026]/.test(el.textContent))
      ctx.push(((el.className || '').toString().split(' ')[0] || el.tagName) + ' :: ' + el.textContent.trim().slice(0, 40))
  }
  return { over: [...new Set(over)].slice(0, 6), noname: [...new Set(noname)].slice(0, 5),
    badimg: [...new Set(badimg)].slice(0, 5), ctx: [...new Set(ctx)].slice(0, 5),
    hscroll: document.documentElement.scrollWidth > W + 1 }
})()`

/* 문자열 규칙은 수집 데이터(캡션·영상 제목)에도 걸리므로 자사 UI 클래스만 본다 */
const DATA_CLASS = /^(A|B|SPAN|DIV|P|dk-top-t|ugc-|mon-acc|home-vid|cp-t|pf-title|md-memo)/

const TABS = ['', '#mytask', '#team', '#calendar', '#shoot', '#spec', '#monitor', '#rmn', '#settle', '#admin']
const findings = []
const add = (where, kind, msg) => findings.push(`[${kind}] ${where} :: ${msg}`)

let server = null
try {
  execSync('npx vite build', { stdio: 'pipe' })
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], { stdio: 'ignore' })
  const B = `http://127.0.0.1:${PORT}/`
  for (let i = 0; i < 30; i++) {
    try { await fetch(B); break } catch { await new Promise(r => setTimeout(r, 500)) }
  }

  const exe = await findChromium()
  const browser = await chromium.launch(exe ? { executablePath: exe } : {}).catch(() => null)
  if (!browser) { console.log('· 크로미움 실행 실패 — UI 전수 조사 생략'); process.exit(0) }

  for (const [w, h, size] of [[360, 780, '360'], [390, 844, '390'], [820, 1180, '820'], [1440, 1000, '1440']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })
    await ctx.route('**/rest/v1/**', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: r.request().method() === 'GET' ? JSON.stringify(respond(r.request().url())) : '[]',
    }))
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const page = await ctx.newPage()
    const seen = new Set()
    page.on('pageerror', e => {
      const k = e.message.slice(0, 80)
      if (!seen.has(k)) { seen.add(k); add(size + 'px', 'JS 오류', e.message.slice(0, 110)) }
    })
    page.on('console', m => {
      if (m.type() !== 'error' && m.type() !== 'warning') return
      const t = m.text()
      if (/Failed to load resource|ERR_|net::/.test(t)) return
      const k = t.slice(0, 80)
      if (!seen.has(k)) { seen.add(k); add(size + 'px', '콘솔 ' + m.type(), t.slice(0, 110)) }
    })
    await page.addInitScript(() => localStorage.setItem('media-cal-session', JSON.stringify({
      access_token: 'x', refresh_token: 'y', email: 'kyuvin@thehyundai.com', expires_at: Date.now() + 3600000 })))

    const paths = w === 1440 ? [...TABS, '?view=mirror', '?view=external'] : TABS
    for (const path of paths) {
      await page.goto(B + path)
      await page.reload()
      await page.waitForTimeout(1100)
      const r = await page.evaluate(PROBE)
      const where = `${size}px ${path || '#home'}`
      if (r.over.length) add(where, '넘침', r.over.join(' / '))
      if (r.hscroll) add(where, '가로 스크롤', 'document 폭 초과')
      if (r.noname.length) add(where, '이름 없는 버튼', r.noname.join(', '))
      if (r.badimg.length) add(where, '깨진 이미지', r.badimg.join(', '))
      const own = r.ctx.filter(c => !DATA_CLASS.test(c))
      if (own.length) add(where, '문자열 규칙', own.join(' | '))
    }
    await ctx.close()
  }
  await browser.close()
} finally {
  if (server) server.kill()
}

if (findings.length) {
  console.error(findings.join('\n'))
  console.error(`\nUI 전수 조사: ${findings.length}건 발견`)
  process.exit(1)
}
console.log(`UI 전수 조사: 문제 없음${LONG_MODE ? ' (긴 제목 모드)' : ''}`)
