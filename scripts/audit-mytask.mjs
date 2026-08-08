/* 내 일정 탭 기능 하네스 ('26.8.8) — `npm run audit:mytask`
   audit-ui.mjs가 넘침·이름 없는 버튼 같은 화면 위생을 보는 반면, 이쪽은 **동작**을 본다.
   전부 '26.8.8 전면 개선에서 실제로 고친 결함이라, 회귀하면 사용자가 바로 겪는다

   1  공유받은 할 일이 목록에서 사라지지 않는가 (남의 스페이스라 어느 그룹에도 안 걸렸다)
   2  겹침 경고가 남발되지 않는가 (배경 일정은 시각이 없어 무조건 충돌로 판정됐다)
   3  기간 배경 일정이 걸치는 날마다 보이는가 (시작일 하루만 떴다)
   4  월간 셀 표시 상한
   5  빈 칸을 눌러 일정 만들기 (월간)
   6  한 줄에 날짜를 쓰면 일정으로
   7  날짜 없는 한 줄은 할 일로
   8  주간 격자 — 업무 시간 밖 일정과 겹침 폭 분할
   9  1시간을 넘는 칩의 길이 조절 그립이 덮이지 않는가
   10 주간 빈 칸 클릭이 시각까지 넘기는가
   11 단축키 (입력 중 미발동 포함)
   12 완료 숨기기와 검색
   13 크게 보기
   14 낙관적 갱신
   15 런타임 오류
   16 마우스 드래그로 할 일을 일정으로 (원본이 남아 이중 등록되지 않는가)
   17 드래그 이동과 실행 취소
   18 드래그 끝의 click이 상세를 열지 않는가
   19 폰 롱프레스 드래그 (예전엔 터치를 통째로 막았다)
   20 폰 상세에서 날짜와 제목을 고칠 수 있는가
   21 폰에서 할 일을 일정으로 (폰은 패널과 캘린더가 한 화면에 같이 안 보여 드래그가 성립 안 한다)

   '26.8.8 2차로 추가
   12-e 매체 캘린더가 겹쳐보기에서 빠졌는가 (사용자 지시)
   12-f 완료 일정 취소선과 상세 완료 체크
   12-g 날짜 지정된 할 일과 마감 미지정 할 일이 나뉘고, 캘린더에 붙여도 목록에 남는가
   19   폰 세그 전환, 캘린더가 화면 위쪽인가, 월간이 폭에 들어가고 색점인가
   14-b, 20-b 레이아웃 위생 — 넘침, 겹침, 글자 잘림을 실측 (모바일 레일이 뭉개지고
        월간 칩에서 제목이 폭 0으로 사라지던 것을 잡은 검사) */
import { spawn, execSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
const pwMod = await import('/opt/node22/lib/node_modules/playwright/index.js')
const { chromium } = pwMod.default || pwMod
const dirs = await readdir('/opt/pw-browsers')
const CHROME = `/opt/pw-browsers/${dirs.find(x => /^chromium-\d+$/.test(x))}/chrome-linux/chrome`

const PORT = 4399
const ROOT = new URL('..', import.meta.url).pathname
const ME = 'kyuvin@thehyundai.com'
const bad = []
const ok = m => console.log('  ok ' + m)
const no = m => { bad.push(m); console.error('  ✗ ' + m) }

const MY_SPACES = [
  { id: 'sp1', owner_email: ME, name: '기획', color: '#0B4336', sort: 0, created_at: '2026-08-01T00:00:00Z' },
  { id: 'sp2', owner_email: ME, name: '운영', color: '#CFA3BD', sort: 1, created_at: '2026-08-01T00:00:00Z' },
]
const MY_TODOS = [
  { id: 't1', owner_email: ME, txt: '콘티 초안', space_id: 'sp1', done: false, shared_with: [], shared_edit: false, memo: null, images: [], sort: 0, created_at: '2026-08-02T00:00:00Z' },
  { id: 't2', owner_email: ME, txt: '정산 정리', space_id: null, done: true, shared_with: [], shared_edit: false, memo: null, images: [], sort: 1, created_at: '2026-08-02T00:00:00Z' },
  /* 남이 자기 스페이스에 넣어 나에게 공유한 것 — 예전엔 목록에서 통째로 사라졌다 */
  { id: 't4', owner_email: ME, txt: '드래그용 항목', space_id: 'sp1', done: false, shared_with: [], shared_edit: false, memo: null, images: [], sort: 2, created_at: '2026-08-02T00:00:00Z' },
  { id: 't3', owner_email: 'jykim84@thehyundai.com', txt: '공유받은 검토건', space_id: 'other-sp', done: false, shared_with: [ME], shared_edit: false, memo: '보기만', images: [], sort: 0, created_at: '2026-08-03T00:00:00Z' },
]
/* 07:30과 21:00 — 예전 8~20시 고정에서는 화면에서 통째로 사라지던 시간대.
   09:00~11:00과 10:00 — 시(hour) 칸이 달라 폭을 안 나누던 겹침 */
const MY_EVENTS = [
  { id: 'm1', owner_email: ME, title: '이른 회의', on_date: '2026-08-12', at_time: '07:30', dur_min: 60, space_id: 'sp1', linked_id: null, shared_with: [], shared_edit: false, memo: null, images: [], created_at: '2026-08-01T00:00:00Z' },
  { id: 'm2', owner_email: ME, title: '긴 워크숍', on_date: '2026-08-12', at_time: '09:00', dur_min: 120, space_id: null, linked_id: null, shared_with: [], shared_edit: false, memo: null, images: [], created_at: '2026-08-01T00:00:00Z' },
  { id: 'm3', owner_email: ME, title: '겹치는 회의', on_date: '2026-08-12', at_time: '10:00', dur_min: 60, space_id: null, linked_id: null, shared_with: [], shared_edit: false, memo: null, images: [], created_at: '2026-08-01T00:00:00Z' },
  { id: 'm4', owner_email: ME, title: '늦은 정리', on_date: '2026-08-12', at_time: '21:00', dur_min: 60, space_id: null, linked_id: null, shared_with: [], shared_edit: false, memo: null, images: [], created_at: '2026-08-01T00:00:00Z' },
  { id: 'm5', owner_email: ME, title: '종일 외근', on_date: '2026-08-13', at_time: null, dur_min: 60, space_id: 'sp2', linked_id: null, shared_with: [], shared_edit: false, memo: null, images: [], created_at: '2026-08-01T00:00:00Z' },
  { id: 'm6', owner_email: ME, title: '끝낸 리뷰', on_date: '2026-08-14', at_time: '16:00', dur_min: 60, space_id: 'sp1', linked_id: null, done: true, shared_with: [], shared_edit: false, memo: null, images: [], created_at: '2026-08-01T00:00:00Z' },
]
/* 기간 매체 일정 — 8/10~8/20. 예전엔 8/10 하루만 떴다 */
const EVENTS = [
  { id: 'e1', title: '여름 정기 집행', date: '2026-08-10', end_date: '2026-08-20', channel: '인스타', kind: null, owner: '김자영', campaign: null, memo: null, images: [] },
  { id: 'e2', title: '팀 워크숍', date: '2026-08-13', end_date: null, channel: '업무', kind: '팀', owner: '노규빈', campaign: null, memo: null, images: [] },
  /* 기간 배경 일정 — 한산한 날에 둬야 셀 상한에 밀리지 않는다 */
  { id: 'e3', title: '가을 촬영 주간', date: '2026-08-16', end_date: '2026-08-20', channel: '인스타', kind: '촬영', owner: '노규빈', campaign: null, memo: null, images: [] },
]

const respond = url => {
  const t = s => new RegExp(`/rest/v1/${s}`).test(url)
  if (t('my_spaces')) return MY_SPACES
  if (t('my_todos')) return MY_TODOS
  if (t('my_events')) return MY_EVENTS
  if (t('media_events_history')) return []
  if (t('media_events')) return EVENTS
  return []
}


/* 드래그 헬퍼 — 두 요소가 모두 화면 안에 들어온 뒤에 좌표를 읽는다.
   앞 테스트가 일정을 늘리면 격자가 길어져 목적지가 뷰포트 밖으로 나가고,
   그 상태에서 끌면 elementFromPoint가 아무것도 못 찾아 드롭이 조용히 실패한다 */
async function dragTo(page, srcLoc, dstLoc, label) {
  await dstLoc.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  let a = await srcLoc.boundingBox(), b = await dstLoc.boundingBox()
  const vh = page.viewportSize().height
  if (!a || a.y < 0 || a.y + a.height > vh) {
    await srcLoc.scrollIntoViewIfNeeded()
    await page.waitForTimeout(150)
    a = await srcLoc.boundingBox(); b = await dstLoc.boundingBox()
  }
  if (!a || !b) { no(`${label}: 요소를 못 찾음`); return false }
  if (b.y + b.height / 2 > vh || a.y + a.height / 2 > vh) {
    no(`${label}: 출발지나 목적지가 화면 밖 (a=${Math.round(a.y)} b=${Math.round(b.y)} vh=${vh})`)
    return false
  }
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  return true
}


/* 레이아웃 위생 검사 ('26.8.8) — 넘침, 겹침, 세로 잘림을 실측한다.
   모달이 열려 있으면 모달 안만 본다 (뒤 페이지와의 겹침은 당연한 것이라 소음) */
const LAYOUT_PROBE = `(() => {
  const W = document.documentElement.clientWidth
  const out = { over: [], overlap: [], clipped: [], hscroll: document.documentElement.scrollWidth > W + 1 }
  const cls = e => (e.className || '').toString().split(' ').filter(Boolean).slice(0,2).join('.') || e.tagName.toLowerCase()
  const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 }
  const root = document.querySelector('.modal-overlay .modal') || document.querySelector('.mytask')
  if (!root) return out
  const all = [...root.querySelectorAll('*')].filter(vis)
  for (const el of all) {
    const b = el.getBoundingClientRect()
    if (!b.width || !b.height) continue
    if (b.right > W + 1 || b.left < -1) {
      let a = el, clipped = false
      while (a && a !== document.body) { if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break } a = a.parentElement }
      if (!clipped) out.over.push(cls(el) + ' r=' + Math.round(b.right))
    }
    if (el.children.length === 0 && el.textContent.trim()) {
      const s = getComputedStyle(el)
      if (s.overflow === 'visible' && el.scrollWidth > el.clientWidth + 2 && s.whiteSpace === 'nowrap')
        out.clipped.push(cls(el) + ' :: ' + el.textContent.trim().slice(0, 16))
    }
  }
  /* 흐름에 있는 글자 요소만 짝지어 본다 — 토스트나 실행 취소 바처럼 떠 있는 것은
     내용 위에 겹치는 게 정상이라 조상까지 훑어 제외한다 */
  const floating = e => {
    let a = e
    while (a && a !== document.body) {
      const p = getComputedStyle(a).position
      if (p === 'fixed' || p === 'absolute' || p === 'sticky') return true
      a = a.parentElement
    }
    return false
  }
  const flow = all.filter(e => e.children.length === 0 && e.textContent.trim() && !floating(e))
  for (let i = 0; i < flow.length; i++) for (let j = i + 1; j < flow.length; j++) {
    const A = flow[i], Bv = flow[j]
    if (A.contains(Bv) || Bv.contains(A)) continue
    const a = A.getBoundingClientRect(), b = Bv.getBoundingClientRect()
    if (Math.min(a.right,b.right) - Math.max(a.left,b.left) > 4 && Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top) > 4)
      out.overlap.push(cls(A) + ' x ' + cls(Bv))
  }
  const u = a => [...new Set(a)].slice(0, 5)
  return { over: u(out.over), overlap: u(out.overlap), clipped: u(out.clipped), hscroll: out.hscroll }
})()`

async function checkLayout(pg, tag) {
  const r = await pg.evaluate(LAYOUT_PROBE)
  let clean = true
  if (r.hscroll) { no(`${tag} 가로 스크롤`); clean = false }
  if (r.over.length) { no(`${tag} 넘침 ${r.over.join(' | ')}`); clean = false }
  if (r.overlap.length) { no(`${tag} 겹침 ${r.overlap.join(' | ')}`); clean = false }
  if (r.clipped.length) { no(`${tag} 글자 잘림 ${r.clipped.join(' | ')}`); clean = false }
  if (clean) ok(`${tag} 레이아웃 정상`)
}

let server = null
try {
  execSync('npx vite build', { stdio: 'pipe', cwd: ROOT })
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'],
    { stdio: 'ignore', cwd: ROOT })
  const B = `http://127.0.0.1:${PORT}/`
  for (let i = 0; i < 40; i++) { try { await fetch(B); break } catch { await new Promise(r => setTimeout(r, 400)) } }

  const browser = await chromium.launch({ executablePath: CHROME })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  let posted = []
  /* 상태를 가진 목 서버 — 실서버처럼 POST한 행을 기억하고 PATCH는 그 행에 병합한다.
     예전처럼 보낸 필드만 되돌려주면 제목과 날짜가 사라져 화면이 엉뚱해진다 */
  const store = { my_todos: [...MY_TODOS], my_events: [...MY_EVENTS], my_spaces: [...MY_SPACES] }
  let seq = 0
  const tableOf = url => ['my_todos', 'my_events', 'my_spaces', 'media_events_history', 'media_events']
    .find(t => new RegExp(`/rest/v1/${t}`).test(url))
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request()
    const url = req.url()
    const tb = tableOf(url)
    const J = v => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (req.method() === 'GET') return J(store[tb] || respond(url))
    let body = {}
    try { body = JSON.parse(req.postData() || '{}') } catch { /* 본문 없음 */ }
    posted.push({ method: req.method(), url, body })
    const hit = url.match(/id=eq\.([^&]+)/)
    const rows = store[tb]
    if (req.method() === 'POST') {
      const row = { id: `new-${++seq}`, owner_email: ME, images: [], shared_with: [], ...body }
      if (rows) rows.push(row)
      return J([row])
    }
    if (req.method() === 'PATCH' && hit && rows) {
      const i = rows.findIndex(x => x.id === hit[1])
      if (i === -1) return J([])                       // 실서버도 0행이면 빈 배열
      rows[i] = { ...rows[i], ...body }
      return J([rows[i]])
    }
    if (req.method() === 'DELETE' && hit && rows) {
      const i = rows.findIndex(x => x.id === hit[1])
      if (i >= 0) rows.splice(i, 1)
      return J([])
    }
    return J([{ id: hit ? hit[1] : `new-${++seq}`, owner_email: ME, images: [], shared_with: [], ...body }])
  })
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await page.addInitScript(() => localStorage.setItem('media-cal-session', JSON.stringify({
    access_token: 'x', refresh_token: 'y', email: 'kyuvin@thehyundai.com', expires_at: Date.now() + 3600000 })))
  /* 화면이 2026-08-12 주를 보게 고정 */
  await page.addInitScript(() => {
    const F = new Date(2026, 7, 12, 11, 15).getTime()
    const R = Date
    // eslint-disable-next-line no-global-assign
    Date = class extends R { constructor(...a) { super(...(a.length ? a : [F])) } static now() { return F } }
    Date.parse = R.parse; Date.UTC = R.UTC
  })

  await page.goto(B + '#mytask')
  await page.reload()
  await page.waitForTimeout(1400)

  console.log('\n[1] 공유받은 할 일이 기본 정렬에서 보이는가')
  const shared = await page.locator('.mt-todo:has-text("공유받은 검토건")').count()
  shared ? ok('공유받음 그룹에 노출') : no('공유받은 할 일이 목록에서 사라짐')
  const gotBadge = await page.locator('.mt-t-got').count()
  gotBadge ? ok('공유 표기 배지 있음') : no('공유받은 항목이 내 것과 구분되지 않음')

  console.log('\n[2] 겹침 경고가 남발되지 않는가')
  /* 8/12에 매체 기간 일정과 팀 일정이 겹쳐 있지만 둘 다 시각이 없다 →
     예전 판정이면 내 일정 전부에 경고가 붙는다 */
  const clashTxt = (await page.locator('.mt-clash').count())
    ? await page.locator('.mt-clash').innerText() : ''
  if (/겹치는 일정 [4-9]|겹치는 일정 \d\d/.test(clashTxt)) no('겹침 경고 남발: ' + clashTxt.slice(0, 60))
  else ok('경고 건수 정상 ' + (clashTxt.split('\n')[0] || '없음'))
  if (clashTxt && !/긴 워크숍|겹치는 회의/.test(clashTxt)) no('실제 이중 예약(09:00 2시간 vs 10:00)을 못 잡음')
  else if (clashTxt) ok('내 일정끼리의 이중 예약을 잡음')

  console.log('\n[3] 기간 배경 일정이 걸치는 날마다 보이는가')
  const spanDays = await page.locator('.mt-cell:has(.mt-ev:has-text("가을 촬영 주간"))').count()
  spanDays >= 5 ? ok(`${spanDays}일에 표시`) : no(`기간 일정이 ${spanDays}일에만 표시 — 시작일만 뜨던 버그`)

  console.log('\n[4] 월간 셀 상한과 더 보기')
  const perCell = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.mt-cell')]
    .map(c => c.querySelectorAll('.mt-ev').length)))
  perCell <= 4 ? ok(`셀당 최대 ${perCell}건`) : no(`셀당 ${perCell}건 — 상한이 안 걸림`)

  console.log('\n[5] 빈 칸을 눌러 일정 만들기 (월간)')
  await page.locator('.mt-cell').nth(20).hover()
  await page.locator('.mt-cell').nth(20).locator('.mt-cell-add').click()
  await page.waitForTimeout(400)
  const newSheet = await page.locator('.mt-sheet:has-text("새 일정")').count()
  newSheet ? ok('신규 시트 열림') : no('빈 칸 클릭으로 일정을 만들 수 없음')
  if (newSheet) {
    await page.locator('.mt-sheet .mt-sh-name').fill('셀 클릭 등록')
    posted = []
    await page.locator('.mt-sh-acts .primary').click()
    await page.waitForTimeout(500)
    const p = posted.find(x => x.method === 'POST' && /my_events/.test(x.url))
    p && p.body.title === '셀 클릭 등록' ? ok('my_events에 저장됨') : no('저장 요청이 안 나감')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  console.log('\n[6] 한 줄에 날짜를 쓰면 일정으로')
  await page.locator('.mt-add input').fill('8/20 오후 3시 정기 회의 90분')
  await page.waitForTimeout(300)
  const hint = await page.locator('.mt-add-hint').innerText().catch(() => '')
  const hintOk = hint.includes('15:00') && hint.includes('8월 20일')
  if (hintOk) ok('해석 미리보기 ' + hint.replace(/\n/g, ' '))
  else no('입력 해석 미리보기가 틀림: ' + hint.replace(/\n/g, ' '))
  posted = []
  await page.locator('.mt-add input').press('Enter')
  await page.waitForTimeout(600)
  const ev = posted.find(x => x.method === 'POST' && /my_events/.test(x.url))
  if (ev && ev.body.at_time === '15:00' && ev.body.dur_min === 90 && ev.body.on_date === '2026-08-20')
    ok('일정으로 저장 ' + JSON.stringify({ d: ev.body.on_date, t: ev.body.at_time, m: ev.body.dur_min }))
  else no('한 줄 입력이 일정으로 저장되지 않음: ' + JSON.stringify(ev?.body || null))

  console.log('\n[7] 날짜 없는 한 줄은 여전히 할 일로')
  await page.locator('.mt-add input').fill('보도자료 초안 검토')
  posted = []
  await page.locator('.mt-add input').press('Enter')
  await page.waitForTimeout(600)
  const td = posted.find(x => x.method === 'POST' && /my_todos/.test(x.url))
  td ? ok('할 일로 저장') : no('날짜 없는 입력이 할 일로 안 감')

  console.log('\n[8] 주간 격자 — 업무 시간 밖 일정과 겹침 폭')
  await page.locator('.seg button:has-text("주간")').click()
  await page.waitForTimeout(700)
  const week = await page.evaluate(() => {
    const q = t => [...document.querySelectorAll('.mt-wg-col .mt-ev')]
      .find(e => e.textContent.includes(t))
    const r = n => { const e = q(n); if (!e) return null
      const b = e.getBoundingClientRect(); const p = e.parentElement.getBoundingClientRect()
      return { top: Math.round(b.top - p.top), h: Math.round(b.height), w: Math.round(b.width), pw: Math.round(p.width) } }
    return {
      early: r('이른 회의'), long: r('긴 워크숍'), mid: r('겹치는 회의'),
      late: r('늦은 정리'), allday: !![...document.querySelectorAll('.mt-wg-cell.allday .mt-ev')]
        .find(e => e.textContent.includes('종일 외근')),
      slots: document.querySelectorAll('.mt-wg-slot').length,
      now: document.querySelectorAll('.mt-now').length,
    }
  })
  week.early ? ok('07:30 일정 표시됨') : no('업무 시간 이전(07:30) 일정이 주간에서 사라짐')
  week.late ? ok('21:00 일정 표시됨') : no('업무 시간 이후(21:00) 일정이 주간에서 사라짐')
  week.allday ? ok('종일 일정이 종일 줄에') : no('종일 일정 누락')
  if (week.long && week.mid) {
    const share = (week.long.w + week.mid.w) / week.long.pw
    share < 1.15 ? ok(`겹침 폭 분할 (합 ${share.toFixed(2)}배)`)
      : no(`겹치는데 폭을 안 나눔 (합 ${share.toFixed(2)}배) — 아래 칩이 덮여 클릭 불가`)
    week.long.h > week.mid.h * 1.7 ? ok('2시간 칩이 1시간의 두 배 높이')
      : no(`길이가 시간에 비례하지 않음 (${week.long.h} vs ${week.mid.h})`)
  } else no('주간 칩을 못 찾음')
  week.slots > 0 ? ok(`드롭 타깃 ${week.slots}칸 (30분 단위)`) : no('주간 드롭 타깃이 없음')
  week.now ? ok('지금 시각 선 표시') : no('지금 시각 선 없음')

  console.log('\n[9] 2시간 칩의 길이 조절 그립이 실제로 잡히는가')
  const grip = await page.evaluate(() => {
    const e = [...document.querySelectorAll('.mt-wg-col .mt-ev')].find(x => x.textContent.includes('긴 워크숍'))
    if (!e) return null
    const g = e.querySelector('.mt-ev-grip')
    if (!g) return { g: false }
    const b = g.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return { g: true, reached: !!hit?.closest('[data-resize]') }
  })
  grip?.reached ? ok('그립이 최상단에서 잡힘')
    : no('2시간 칩의 그립이 다른 요소에 덮임 — 길이 조절 불가')

  console.log('\n[10] 주간 빈 칸 클릭 = 그 시각으로 등록')
  await page.locator('.mt-wg-slot').nth(30).click()
  await page.waitForTimeout(400)
  const ns2 = await page.locator('.mt-sheet:has-text("새 일정")').count()
  const dateTxt = ns2 ? await page.locator('.mt-sheet .mt-sh-date').innerText() : ''
  const hasTime = ns2 && /\d\d:\d\d/.test(dateTxt)
  if (hasTime) ok('시각까지 프리필 ' + dateTxt); else no('주간 빈 칸 클릭이 시각을 안 넘김')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  console.log('\n[11] 단축키')
  await page.keyboard.press('m')
  await page.waitForTimeout(300)
  await page.locator('.mt-grid').count() ? ok('m = 월간') : no('m 단축키 미동작')
  await page.keyboard.press('?')
  await page.waitForTimeout(300)
  const helpOpen = await page.locator('.mt-sheet:has-text("단축키")').count()
  helpOpen ? ok('? = 도움말') : no('? 도움말 미동작')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  /* 입력 중에는 단축키가 발동하면 안 된다 */
  await page.locator('.mt-add input').fill('')
  await page.locator('.mt-add input').type('week 계획')
  await page.waitForTimeout(300)
  const stillMonth = await page.locator('.mt-grid').count()
  stillMonth ? ok('입력 중에는 단축키 미발동') : no('입력 중에 단축키가 뷰를 바꿈')

  console.log('\n[12-a] 분류 레일 (접었다 펴기)')
  {
    const rail = await page.locator('.mt-rail').count()
    if (rail) ok('레일 존재'); else no('좌측 분류 레일이 없음')
    const namesHidden = await page.locator('.mt-rail:not(.open) .mt-rail-i span').first()
      .isVisible().catch(() => false)
    if (!namesHidden) ok('접힌 상태에서는 색점만'); else no('접혔는데 이름이 보임')
    await page.locator('.mt-rail-tog').click()
    await page.waitForTimeout(350)
    const opened = await page.locator('.mt-rail.open').count()
    if (opened) ok('펼쳐짐'); else no('레일이 안 펼쳐짐')
    const nameShown = await page.locator('.mt-rail.open .mt-rail-i span').first().isVisible()
    if (nameShown) ok('펼치면 이름 노출'); else no('펼쳤는데 이름이 안 보임')
    const cnt = await page.locator('.mt-rail-i:has-text("기획") em').innerText().catch(() => '')
    if (cnt) ok('남은 건수 표기 ' + cnt); else no('분류별 건수가 없음')
    /* 레일로 필터가 걸리는가 */
    await page.locator('.mt-rail-i:has-text("기획")').click()
    await page.waitForTimeout(400)
    const filtered = await page.locator('.mt-todo').count()
    if (filtered >= 1) ok(`레일 필터 동작 (${filtered}건)`); else no('레일 필터가 목록을 비움')
    await page.locator('.mt-rail-i:has-text("전체")').click()
    await page.waitForTimeout(300)
    await page.locator('.mt-rail-tog').click()
    await page.waitForTimeout(300)
  }

  console.log('\n[12-b] 간단 입력줄 (버튼 없이 엔터, 담을 곳은 색점)')
  {
    const btn = await page.locator('.mt-add button:not(.mt-add-dot)').count()
    if (!btn) ok('추가 버튼 없이 한 줄'); else no('입력줄에 별도 추가 버튼이 남음')
    await page.locator('.mt-add-dot').click()
    await page.waitForTimeout(300)
    const pop = await page.locator('.mt-add-pop').count()
    if (pop) ok('담을 곳 팝오버 열림'); else no('담을 곳을 고를 수 없음')
    await page.locator('.mt-add-pop button:has-text("운영")').click()
    await page.waitForTimeout(300)
    posted = []
    await page.locator('.mt-add input').fill('팝오버 지정 확인')
    await page.locator('.mt-add input').press('Enter')
    await page.waitForTimeout(700)
    const made = posted.find(x => x.method === 'POST' && /my_todos/.test(x.url))
    if (made && made.body.space_id === 'sp2') ok('고른 분류로 저장됨')
    else no('담을 곳 지정이 저장에 반영 안 됨: ' + JSON.stringify(made?.body || null))
  }

  console.log('\n[12-c] 주간 칩이 분류 색으로 구분되는가 + 시각 표기')
  {
    await page.locator('.seg button:has-text("주간")').click()
    await page.waitForTimeout(700)
    const chips = await page.evaluate(() => [...document.querySelectorAll('.mt-wg-col .mt-ev.mine')]
      .map(e => {
        const cs = getComputedStyle(e)
        return { t: e.querySelector('.mt-ev-n')?.textContent,
          bg: cs.backgroundColor, bl: cs.borderLeftColor, blw: cs.borderLeftWidth,
          time: e.querySelector('.mt-ev-t')?.textContent || '' }
      }))
    const sp1 = chips.find(c => c.t === '이른 회의')      // 기획 = #0B4336
    const none = chips.find(c => c.t === '긴 워크숍')     // 분류 없음
    if (sp1 && /rgba\(11, 67, 54/.test(sp1.bg)) ok('분류 색 반투명 배경 ' + sp1.bg)
    else no('분류 색이 칩에 안 실림: ' + JSON.stringify(sp1))
    if (sp1 && sp1.blw !== '0px') ok('왼쪽 색선 ' + sp1.blw); else no('왼쪽 색선이 없음')
    if (sp1 && sp1.time.includes('07:30') && sp1.time.includes('08:30'))
      ok('시각 표기 ' + sp1.time)
    else no('칩에 시각 표기가 없음: ' + JSON.stringify(sp1?.time))
    if (none) ok('분류 없는 일정도 렌더됨')
    /* 배경 일정도 종류별로 다른 색인가 */
    const bgs = await page.evaluate(() => [...document.querySelectorAll('.mt-ev.bg')]
      .map(e => getComputedStyle(e).borderLeftColor))
    if (new Set(bgs).size >= 1) ok('배경 일정 색 구분 적용')
    await page.locator('.seg button:has-text("월간")').click()
    await page.waitForTimeout(500)
  }

  console.log('\n[12-d] 상세 시트 날짜 칸이 시각 칸과 같은 모양인가')
  {
    await page.locator('.mt-cell .mt-ev.mine').first().click()
    await page.waitForTimeout(500)
    const box = await page.evaluate(() => {
      const d = document.querySelector('.mt-sheet input[type=date]')
      const t = document.querySelector('.mt-sheet input[type=time]')
      if (!d || !t) return null
      const cd = getComputedStyle(d), ct = getComputedStyle(t)
      const rd = d.getBoundingClientRect()
      const sheet = document.querySelector('.mt-sheet').getBoundingClientRect()
      return { dr: cd.borderRadius, tr: ct.borderRadius, db: cd.borderTopWidth,
        dh: Math.round(rd.height), th: Math.round(t.getBoundingClientRect().height),
        over: rd.right > sheet.right + 1, appear: cd.appearance || cd.webkitAppearance }
    })
    if (!box) { no('상세에 날짜 또는 시각 입력이 없음') } else {
      if (box.dr === box.tr && box.dr !== '0px') ok('날짜와 시각 곡률 일치 ' + box.dr)
      else no(`날짜 칸 곡률이 시각 칸과 다름 (날짜 ${box.dr}, 시각 ${box.tr})`)
      if (Math.abs(box.dh - box.th) <= 2) ok('높이 일치 ' + box.dh + 'px')
      else no(`날짜 칸 높이가 어긋남 (${box.dh} vs ${box.th})`)
      if (box.db !== '0px') ok('테두리 적용'); else no('날짜 칸에 테두리가 없음')
      if (!box.over) ok('시트 밖으로 안 넘침'); else no('날짜 칸이 시트를 넘침')
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }


  console.log('\n[12-e] 매체 캘린더가 겹쳐보기에서 빠졌는가')
  {
    const names = await page.locator('.mt-ly').allInnerTexts()
    if (!names.some(n => n.includes('매체'))) ok('레이어에 매체 없음 ' + names.join(' '))
    else no('매체 레이어가 남아 있음: ' + names.join(' '))
    const mediaChip = await page.locator('.mt-ev:has-text("여름 정기 집행")').count()
    if (!mediaChip) ok('매체 일정이 캘린더에 안 얹힘')
    else no(`매체 일정이 여전히 ${mediaChip}건 얹힘`)
    const teamChip = await page.locator('.mt-ev:has-text("팀 워크숍")').count()
    if (teamChip) ok('팀 일정은 그대로 얹힘'); else no('팀 일정까지 사라짐')
  }

  console.log('\n[12-f] 완료 일정 취소선')
  {
    const done = page.locator('.mt-ev.done:has-text("끝낸 리뷰")').first()
    if (await done.count()) {
      const deco = await done.locator('.mt-ev-n').evaluate(el => getComputedStyle(el).textDecorationLine)
      if (deco.includes('line-through')) ok('칩에 취소선')
      else no('완료 일정에 취소선이 없음: ' + deco)
    } else no('완료 일정 칩을 못 찾음')
    /* 상세에서 완료를 켜고 끌 수 있는가 */
    await page.locator('.mt-cell .mt-ev.mine').first().click()
    await page.waitForTimeout(500)
    const chk = await page.locator('.mt-sheet .mt-sh-title .mt-box').count()
    if (chk) ok('일정 상세에 완료 체크 있음'); else no('일정 상세에 완료 체크가 없음')
    if (chk) {
      posted = []
      await page.locator('.mt-sheet .mt-sh-title .mt-box').click()
      await page.waitForTimeout(600)
      const p = posted.find(x => x.method === 'PATCH' && /my_events/.test(x.url))
      if (p && p.body.done !== undefined) ok('완료 상태 저장 ' + p.body.done)
      else no('완료 체크가 저장 안 됨: ' + JSON.stringify(p?.body || null))
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  console.log('\n[12-g] 날짜 지정된 할 일과 마감 미지정 할 일이 나뉘는가')
  {
    const heads = await page.locator('.mt-sec-h b').allInnerTexts()
    if (heads.includes('날짜 지정된 할 일') && heads.includes('마감 미지정 할 일'))
      ok('두 묶음 ' + heads.join(' / '))
    else no('묶음이 안 나뉨: ' + heads.join(' / '))
    const datedRows = await page.locator('.mt-dated').count()
    if (datedRows >= 4) ok(`날짜 지정된 할 일 ${datedRows}건`)
    else no(`날짜 지정된 목록이 비었거나 부족 (${datedRows}건)`)
    /* 캘린더에 붙여도 목록에서 사라지지 않아야 한다 */
    const before = await page.locator('.mt-dated').count()
    const inbox = await page.locator('.mt-sec:last-child .mt-todo').count()
    const row = page.locator('.mt-todo:has-text("드래그용 항목")').first()
    const cell = page.locator('.mt-cell[data-date="2026-08-21"]')
    if (await dragTo(page, row, cell, '목록 유지 확인')) {
      await page.mouse.up()
      await page.waitForTimeout(1000)
      const after = await page.locator('.mt-dated').count()
      const inboxAfter = await page.locator('.mt-sec:last-child .mt-todo').count()
      if (after === before + 1) ok('날짜 지정 목록으로 옮겨옴 (사라지지 않음)')
      else no(`캘린더에 붙였는데 목록에서 사라짐 (${before} → ${after})`)
      if (inboxAfter === inbox - 1) ok('마감 미지정에서는 빠짐')
      else no(`마감 미지정 건수가 안 줄었음 (${inbox} → ${inboxAfter})`)
    }
    /* 완료 체크가 목록에서도 되는가 */
    const dr = page.locator('.mt-dated').first()
    posted = []
    await dr.locator('.mt-box').click()
    await page.waitForTimeout(600)
    const p2 = posted.find(x => x.method === 'PATCH' && /my_events/.test(x.url))
    if (p2 && p2.body.done !== undefined) ok('목록에서 완료 체크 저장')
    else no('목록 완료 체크가 저장 안 됨')
  }

  console.log('\n[12] 완료 숨기기와 검색')
  await page.locator('.mt-add input').fill('')
  await page.locator('.mt-search button').click()
  await page.waitForTimeout(300)
  const doneGone = await page.locator('.mt-todo.done').count()
  doneGone === 0 ? ok('완료 항목 숨김') : no('완료 숨기기가 동작 안 함')
  await page.locator('.mt-search button').click()
  await page.locator('.mt-search input').fill('콘티')
  await page.waitForTimeout(400)
  const hits = [...await page.locator('.mt-t-txt').allInnerTexts(),
    ...await page.locator('.mt-dated-t').allInnerTexts()]
  hits.length === 1 ? ok('검색으로 1건 필터') : no(`검색 결과가 ${hits.length}건: ${hits.join(', ')}`)
  await page.locator('.mt-search input').fill('')

  console.log('\n[13] 크게 보기 (패널 접기)')
  await page.locator('.mt-wide').click()
  await page.waitForTimeout(400)
  const panelHidden = await page.locator('.mt-todos').isVisible()
  !panelHidden ? ok('좌측 패널 접힘') : no('크게 보기가 패널을 안 접음')
  await page.locator('.mt-wide').click()
  await page.waitForTimeout(300)

  console.log('\n[14] 낙관적 갱신 — 체크가 즉시 반영되는가')
  await ctx.route('**/rest/v1/my_todos**', async r => {
    if (r.request().method() !== 'GET') { await new Promise(x => setTimeout(x, 1500)) }
    return r.fallback()
  })
  const box = page.locator('.mt-todo:has-text("콘티 초안") .mt-box').first()
  await box.click()
  await page.waitForTimeout(150)
  const onFast = await page.locator('.mt-todo:has-text("콘티 초안") .mt-box.on').count()
  onFast ? ok('서버 응답 전에 화면 반영') : no('체크가 서버 왕복을 기다림')
  await ctx.unroute('**/rest/v1/my_todos**')
  await page.waitForTimeout(1800)

  console.log('\n[14-b] 데스크톱 레이아웃 위생')
  await checkLayout(page, '1440 월간')

  console.log('\n[15] JS 오류')
  errs.length ? no('런타임 오류 ' + errs.slice(0, 2).join(' | ')) : ok('런타임 오류 없음')

  console.log('\n[16] 마우스 드래그 — 할 일을 캘린더로')
  await page.keyboard.press('m')
  await page.waitForTimeout(500)
  posted = []
  {
    const row = page.locator('.mt-todo:has-text("콘티 초안")').first()
    const cell = page.locator('.mt-cell[data-date="2026-08-19"]')
    if (await dragTo(page, row, cell, '할 일 드래그')) {
      const ghost = await page.locator('.mt-ghost').count()
      if (ghost) ok('드래그 중 따라오는 칩 표시'); else no('드래그 고스트가 없음')
      await page.mouse.up()
      await page.waitForTimeout(900)
      const made = posted.find(x => x.method === 'POST' && /my_events/.test(x.url))
      const gone = posted.find(x => x.method === 'DELETE' && /my_todos/.test(x.url))
      if (made && made.body.on_date === '2026-08-19') ok('일정으로 생성 ' + made.body.on_date)
      else no('드롭이 일정을 안 만듦: ' + JSON.stringify(made?.body || null))
      if (gone) ok('원래 할 일 삭제'); else no('할 일이 남음 (이중 등록)')
    }
  }

  console.log('\n[17] 일정 드래그 이동과 실행 취소')
  posted = []
  {
    const chip = page.locator('.mt-cell[data-date="2026-08-13"] .mt-ev.mine').first()
    const cell = page.locator('.mt-cell[data-date="2026-08-14"]')
    if (await dragTo(page, chip, cell, '일정 드래그')) {
      await page.mouse.up()
      await page.waitForTimeout(900)
      const moved = posted.find(x => x.method === 'PATCH' && /my_events/.test(x.url))
      if (moved && moved.body.on_date === '2026-08-14') ok('PATCH로 이동')
      else no('드래그 이동이 저장 안 됨: ' + JSON.stringify(moved?.body || null))
      const undo = await page.locator('.mt-undo').count()
      if (undo) ok('실행 취소 바 노출'); else no('실행 취소 바가 없음')
      if (undo) {
        posted = []
        await page.locator('.mt-undo button:has-text("실행 취소")').click()
        await page.waitForTimeout(700)
        const back = posted.find(x => x.method === 'PATCH' && x.body.on_date === '2026-08-13')
        if (back) ok('원래 날짜로 되돌림'); else no('실행 취소가 되돌리지 않음')
      }
    }
  }

  console.log('\n[18] 드래그 뒤에 상세가 저절로 열리지 않는가')
  {
    const sheet = await page.locator('.mt-sheet').count()
    if (!sheet) ok('상세 안 열림'); else no('드래그 끝의 click이 상세를 염')
  }
  await ctx.close()

  console.log('\n[19] 폰 — 길게 눌러 드래그 (예전엔 터치를 통째로 막아 방법이 아예 없었다)')
  {
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    let mposted = []
    await mctx.route('**/rest/v1/**', r => {
      const req = r.request()
      if (req.method() === 'GET')
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respond(req.url())) })
      let body = {}
      try { body = JSON.parse(req.postData() || '{}') } catch { /* 없음 */ }
      mposted.push({ method: req.method(), url: req.url(), body })
      const h = req.url().match(/id=eq\.([^&]+)/)
      const rw = h ? (respond(req.url()).find(x => x.id === h[1]) || {}) : {}
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ ...rw, id: h ? h[1] : 'x', owner_email: ME, images: [], shared_with: [], ...body }]) })
    })
    await mctx.route('**/auth/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const mp = await mctx.newPage()
    const merr = []
    mp.on('pageerror', e => merr.push(e.message))
    await mp.addInitScript(() => localStorage.setItem('media-cal-session', JSON.stringify({
      access_token: 'x', refresh_token: 'y', email: 'kyuvin@thehyundai.com', expires_at: Date.now() + 3600000 })))
    /* 데스크톱 컨텍스트와 같은 기준일 — 없으면 실제 오늘 주를 보게 되어 시드가 안 걸린다 */
    await mp.addInitScript(() => {
      const F = new Date(2026, 7, 12, 11, 15).getTime()
      const R = Date
      // eslint-disable-next-line no-global-assign
      Date = class extends R { constructor(...a) { super(...(a.length ? a : [F])) } static now() { return F } }
      Date.parse = R.parse; Date.UTC = R.UTC
    })
    await mp.goto(B + '#mytask')
    await mp.reload()
    await mp.waitForTimeout(1400)

    /* 폰에서는 할 일 패널과 캘린더가 세로로 쌓여 한 화면에 같이 안 보인다 —
       드래그는 캘린더 안(일정 이동)에서만 성립하고, 할 일을 일정으로 만드는 길은
       상세 시트의 "날짜 지정"이다 (아래 [21]) */
    /* 폰은 세그로 할 일과 캘린더를 나눠 본다 — 먼저 캘린더로 */
    const seg = await mp.locator('.mt-mseg').isVisible()
    if (seg) ok('폰 전환 세그 노출'); else no('폰에서 할 일과 캘린더를 전환할 수 없음')
    await mp.locator('.mt-mseg button:has-text("캘린더")').click()
    await mp.waitForTimeout(700)
    const panelShown = await mp.locator('.mt-todos').isVisible()
    if (!panelShown) ok('캘린더만 보임'); else no('세그를 눌러도 할 일 패널이 남음')
    const mm = await mp.evaluate(() => {
      const c = document.querySelector('.mt-cal'), g = document.querySelector('.mt-grid')
      return { top: Math.round(c.getBoundingClientRect().top + window.scrollY),
        gr: Math.round(g.getBoundingClientRect().right), W: document.documentElement.clientWidth,
        dots: document.querySelectorAll('.mt-dots i').length }
    })
    if (mm.top < 500) ok(`캘린더가 화면 위쪽에 (${mm.top}px)`)
    else no(`캘린더가 여전히 아래로 밀림 (${mm.top}px)`)
    if (mm.gr <= mm.W) ok('월간 격자가 화면 폭에 들어감')
    else no(`월간 격자가 폭을 넘김 (${mm.gr} > ${mm.W})`)
    if (mm.dots > 0) ok(`폰 월간은 색점 표기 (${mm.dots}개)`); else no('폰 월간에 색점이 없음')

    /* 폰 월간은 색점이라 끌 칩이 없다 — 주간으로 들어가 거기서 롱프레스 드래그 */
    await mp.locator('.seg button:has-text("주간")').click()
    await mp.waitForTimeout(800)
    const chip = mp.locator('.mt-wg-col .mt-ev.mine').first()
    const slot = mp.locator('.mt-wg-slot').nth(40)
    await chip.scrollIntoViewIfNeeded()
    await mp.waitForTimeout(250)
    const a = await chip.boundingBox(), b = await slot.boundingBox()
    const vh = mp.viewportSize().height
    if (!a || !b || a.y < 0 || b.y + b.height / 2 > vh || b.y < 0) {
      no('폰 주간에서 출발지나 목적지가 화면 밖')
    } else {
      mposted = []
      const cdp = await mctx.newCDPSession(mp)
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
      await touch('touchStart', a.x + a.width / 2, a.y + 8)
      await mp.waitForTimeout(520)                       // 롱프레스 350ms 넘김
      const held = await mp.locator('.mt-ghost').count()
      if (held) ok('길게 누르면 드래그 시작'); else no('롱프레스로 드래그가 시작되지 않음')
      await touch('touchMove', b.x + b.width / 2, b.y + b.height / 2)
      await mp.waitForTimeout(250)
      await touch('touchEnd', 0, 0)
      await mp.waitForTimeout(1000)
      const moved = mposted.find(x => x.method === 'PATCH' && /my_events/.test(x.url))
      if (moved) ok('폰에서 일정 이동됨 ' + JSON.stringify(moved.body))
      else no('폰 드래그로 일정이 안 옮겨짐')
    }
    await mp.locator('.seg button:has-text("월간")').click()
    await mp.waitForTimeout(500)

    console.log('\n[20] 폰 — 상세에서 날짜와 시간을 직접 고칠 수 있는가 (드래그 없는 길)')
    await mp.locator('.seg button:has-text("주간")').click()
    await mp.waitForTimeout(700)
    await mp.locator('.mt-wg-col .mt-ev.mine').first().click()
    await mp.waitForTimeout(600)
    const dateInput = await mp.locator('.mt-sheet input[type=date]').count()
    const timeInput = await mp.locator('.mt-sheet input[type=time]').count()
    const nameInput = await mp.locator('.mt-sheet .mt-sh-name').count()
    if (dateInput) ok('날짜 입력 있음'); else no('상세에 날짜 입력이 없음 (드래그로만 옮길 수 있음)')
    if (timeInput) ok('시각 입력 있음'); else no('상세에 시각 입력이 없음')
    if (nameInput) ok('제목 수정 가능'); else no('일정 제목을 상세에서 못 고침')
    await mp.keyboard.press('Escape')
    await mp.waitForTimeout(400)

    console.log('\n[20-b] 폰 레이아웃 위생 — 넘침, 겹침, 잘림')
    await mp.keyboard.press('Escape')
    await mp.waitForTimeout(400)
    await checkLayout(mp, '폰 주간')
    await mp.locator('.seg button:has-text("월간")').click()
    await mp.waitForTimeout(600)
    await checkLayout(mp, '폰 월간')
    await mp.locator('.mt-mseg button:has-text("할 일")').click()
    await mp.waitForTimeout(600)
    await checkLayout(mp, '폰 할 일')

    console.log('\n[21] 폰 — 할 일 상세의 날짜 지정으로 일정 만들기 (드래그 없는 주 경로)')
    await mp.locator('.mt-mseg button:has-text("할 일")').click()
    await mp.waitForTimeout(600)
    await mp.locator('.mt-todo:has-text("콘티 초안")').first().click()
    await mp.waitForTimeout(500)
    const dsel = mp.locator('.mt-sheet input[type=date]').first()
    if (await dsel.count()) {
      await dsel.fill('2026-08-25')
      await mp.locator('.mt-sheet input[type=time]').first().fill('14:00')
      mposted = []
      await mp.locator('.mt-sched').click()
      await mp.waitForTimeout(900)
      const made = mposted.find(x => x.method === 'POST' && /my_events/.test(x.url))
      const gone = mposted.find(x => x.method === 'DELETE' && /my_todos/.test(x.url))
      if (made && made.body.on_date === '2026-08-25' && made.body.at_time === '14:00')
        ok('일정으로 전환 ' + made.body.on_date + ' ' + made.body.at_time)
      else no('날짜 지정이 일정을 안 만듦: ' + JSON.stringify(made?.body || null))
      if (gone) ok('원래 할 일 삭제'); else no('할 일이 남음')
    } else no('할 일 상세에 날짜 지정이 없음 — 폰에서 일정을 만들 수 없다')

    if (merr.length) no('폰 런타임 오류 ' + merr[0].slice(0, 80)); else ok('폰 런타임 오류 없음')
    await mctx.close()
  }

  await browser.close()
} finally {
  if (server) server.kill()
}

console.log(bad.length ? `\n실패 ${bad.length}건` : '\n전부 통과')
process.exit(bad.length ? 1 : 0)
