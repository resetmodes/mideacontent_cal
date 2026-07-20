/* 타겟APP 내부 정리 엑셀 → 실적 행 추출 ('26.7)
   대상: "(결과)" 시트 — 규빈 팀 내부 문서 양식 기준:
     · 제목  "□ 타겟형 매체 진행 실적 - {캠페인명}"  (B열 부근)
     · "ㅁ 기간 : 6/12(금) ~ 6/27(토)"
     · 소재 섹션의 매체 헤더 행 + "노출"/"클릭" 라벨 행(C열) — 매체별 수치는 같은 열에
   방침: 매체별 1행 분할('26.7 사용자 결정), 사진(이미지)은 무시, 파일은 브라우저에서만
   읽고 어디에도 업로드하지 않음. 양식이 다른 시트는 실패 목록으로 반환 (조용한 오입력 방지).
   SheetJS는 어드민에서만 동적 import — 본 번들 크기에 영향 없음 */

const norm = v => (typeof v === 'string' ? v.replace(/\s+/g, '') : '')

/* 시트 이름 → 사업소 (괄호·말미 숫자 제거: "대구2(결과)" → "대구") */
const officeOf = sheetName =>
  sheetName.replace(/\(결과\)\s*$/, '').replace(/\d+$/, '').trim()

/* "6/12(금) ~ 6/27(토)" → { month: 6 } */
const monthOf = period => {
  const m = (period || '').match(/(\d{1,2})\s*[/.]/)
  return m ? +m[1] : null
}

function parseSheet(rows, sheetName) {
  let title = null, period = null
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    for (let c = 0; c < 6; c++) {
      const v = rows[r]?.[c]
      if (typeof v !== 'string') continue
      if (v.includes('진행 실적') && v.includes('-')) title = v.split('-').slice(1).join('-').trim()
      const m = v.match(/기간\s*:\s*(.+)/)
      if (m) period = m[1].trim()
    }
  }

  /* 라벨 행 탐색 — 병합 셀 앵커 위치가 라이브러리마다 달라 앞쪽 0~4열을 모두 본다.
     "매체"는 일정표 헤더에도 나오므로 소재 섹션(20행 이후) + "노출" 행보다 위인 마지막 것 */
  const findLabel = row => {
    for (let c = 0; c <= 4; c++) {
      const t = norm(row?.[c])
      if (t) return t
    }
    return ''
  }
  const mediaRows = []
  const labels = {}
  for (let r = 19; r < rows.length; r++) {
    const t = findLabel(rows[r])
    if (t === '매체') mediaRows.push(r)
    if ((t === '노출' || t === '클릭') && labels[t] == null) labels[t] = r
  }
  const mediaRow = labels['노출'] != null
    ? mediaRows.filter(r => r < labels['노출']).pop() ?? null
    : null

  const media = []
  if (mediaRow != null && labels['노출'] != null) {
    for (let c = 3; c < 70; c++) {
      const name = rows[mediaRow]?.[c]
      if (typeof name !== 'string' || !name.trim()) continue
      const exp = rows[labels['노출']]?.[c]
      const clk = rows[labels['클릭']]?.[c]
      if (typeof exp === 'number') {
        media.push({ media: name.trim(), exp: Math.round(exp), clk: Math.round(typeof clk === 'number' ? clk : 0) })
      }
    }
  }

  return {
    sheet: sheetName,
    office: officeOf(sheetName),
    name: title || '',
    period: period || '',
    month: monthOf(period),
    media,
    ok: !!(title && period && media.length > 0 && monthOf(period)),
  }
}

/* 워크북 전체 → { items: 인식된 시트[], skipped: 실패 시트[] }
   동일 실적 중복(미기입 템플릿 복사본)은 checked=false로 표시 */
export function parseTargetWorkbook(XLSX, workbook) {
  const items = [], skipped = []
  for (const name of workbook.SheetNames) {
    if (!name.includes('(결과)')) continue
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
    const p = parseSheet(rows, name)
    if (p.ok) items.push(p)
    else skipped.push({ sheet: name, reason: p.media.length === 0 ? '실적 숫자 미기입' : '제목·기간 인식 실패' })
  }
  /* 중복 판정 — 캠페인명+기간+수치가 완전히 같은 시트가 2개 이상이면 전부 미기입
     템플릿 복사본으로 보고 전원 체크 해제 (진짜 캠페인이 수치까지 같을 수는 없음) */
  const count = {}
  const keyOf = it => [it.name, it.period, ...it.media.map(m => m.media + m.exp)].join('|')
  for (const it of items) count[keyOf(it)] = (count[keyOf(it)] || 0) + 1
  for (const it of items) {
    it.dup = count[keyOf(it)] > 1
    it.checked = !it.dup
  }
  return { items, skipped }
}
