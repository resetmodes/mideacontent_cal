/* 타겟APP 실적 대장 엑셀 → 실적 행 추출 ('26.7 v2 — "26년도 타겟형 매체 광고 실적" 양식)
   ─ 시트명 "{N}월_{사업소}(종료|진행중)" 만 파싱 (전체/Start/End 등 요약 시트 제외)
   ─ 시트 구조: B2 제목("26년도 …") · B4 월 · C4 "캠페인명 (기간)"
     헤더 행: B형태 C매체명 D지면 E예산 F비용 G노출수 H클릭수 K방문자수 N앱다운로드수(없는 시트도 있음)
     매체 행 = C열에 매체명, D열은 매체별 기간(선택). 지면 행(C 비고 D만 있음)은 집계 불필요라 스킵
   ─ 매체 행 중 실적·비용이 전부 0인 행은 미집행 템플릿 행이라 제외
   ─ 사진(이미지)은 무시. 파일은 브라우저에서만 읽음 — 외부 전송 없음.
   ─ 이전 "(결과)" 내부 정리 문서 양식은 잘못된 소스로 확인되어 폐기 ('26.7 사용자 확인) */

const clean = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const num = v => {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''))
    return isFinite(n) ? Math.round(n) : 0   // '서비스지원'·'클릭불가' 등 문구 → 0
  }
  return 0
}

const SHEET_RE = /^(\d{1,2})월_(.+?)\((종료|진행중)\)\s*$/

function parseSheet(rows, m) {
  const month = +m[1]
  const office = m[2].trim()
  const status = m[3]

  /* 제목에서 연도, C4에서 캠페인명·기간 */
  let year = null, name = '', period = ''
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const b = clean(rows[r]?.[1]), c = clean(rows[r]?.[2])
    const ym = b.match(/(\d{2})년도/)
    if (ym) year = 2000 + +ym[1]
    if (/^\d{1,2}월$/.test(b) && c) {
      const pm = c.match(/\(([^)]*)\)\s*$/)
      period = pm ? pm[1].trim() : ''
      name = pm ? c.slice(0, pm.index).trim() : c
    }
  }

  /* 헤더 행(C열 "매체명") + 지표 컬럼 인덱스 (라벨 기준 — 앱다운로드 없는 시트 대응) */
  let head = -1
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    if (clean(rows[r]?.[2]) === '매체명') { head = r; break }
  }
  if (head < 0 || !name) return null
  const col = {}
  for (let c = 3; c < 30; c++) {
    const t = clean(rows[head]?.[c])
    if (t.includes('예산')) col.budget = c
    else if (t.includes('비용')) col.cost = c
    else if (t.includes('노출')) col.exp = c
    else if (t.startsWith('클릭수')) col.clk = c
    else if (t.includes('방문')) col.vis = c
    else if (t.includes('앱') && t.includes('다운')) col.inst = c
  }
  if (col.exp == null || col.clk == null) return null

  const media = []
  for (let r = head + 1; r < rows.length; r++) {
    const mname = clean(rows[r]?.[2])
    if (!mname) continue                          // 지면·형태·총계 행
    const g = c => (c == null ? 0 : num(rows[r]?.[c]))
    const row = {
      media: mname,
      period: clean(rows[r]?.[3]) || period,      // 매체별 기간이 있으면 우선
      budget: g(col.budget), cost: g(col.cost),
      exp: g(col.exp), clk: g(col.clk), vis: g(col.vis), inst: g(col.inst),
    }
    if (row.exp || row.clk || row.vis || row.inst || row.cost) media.push(row)   // 미집행 행 제외
  }

  return {
    office, month, year: year || new Date().getFullYear(),
    name, period, status, media,
    ok: media.length > 0,
  }
}

/* 워크북 전체 → { items: 인식된 캠페인[], skipped: 실패·미기입[] } */
export function parseTargetWorkbook(XLSX, workbook) {
  const items = [], skipped = []
  for (const sheetName of workbook.SheetNames) {
    const m = sheetName.match(SHEET_RE)
    if (!m) continue                              // 전체/Start/End 등 요약 시트
    const ws = workbook.Sheets[sheetName]
    if (!ws || !ws['!ref']) { skipped.push({ sheet: sheetName, reason: '빈 시트' }); continue }
    /* !ref가 B2처럼 중간에서 시작해도 절대 좌표(A1 기준)로 읽기 */
    const range = XLSX.utils.decode_range(ws['!ref'])
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: { s: { r: 0, c: 0 }, e: range.e } })
    const p = parseSheet(rows, m)
    if (p && p.ok) items.push({ ...p, sheet: sheetName, checked: true, dup: false })
    else skipped.push({ sheet: sheetName, reason: p ? '실적 숫자 미기입' : '양식 인식 실패' })
  }
  /* 완전 동일 중복(복사본) 안전망 — 전원 체크 해제 */
  const count = {}
  const keyOf = it => [it.office, it.name, it.period, ...it.media.map(x => x.media + x.exp)].join('|')
  for (const it of items) count[keyOf(it)] = (count[keyOf(it)] || 0) + 1
  for (const it of items) {
    if (count[keyOf(it)] > 1) { it.dup = true; it.checked = false }
  }
  return { items, skipped }
}
