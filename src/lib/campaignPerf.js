/* 캠페인 통합 성과 ('26.7.30) — 캠페인 하나에 묶인 일정들의 집행 결과를 매체별로 모은다.

   설계 원칙
   - 매체마다 집계 출처가 다르다 (인스타·유튜브 = 주간 수집, 타겟APP = 어드민 실적 입력,
     나머지는 미집계). 행마다 출처를 함께 돌려주고 화면에서 배지로 노출한다
   - 값이 없는 매체는 추정하지 않고 비워 둔다 (수치 날조 금지)
   - 유튜브는 좋아요·댓글을 수집하지 않으므로 반응이 항상 비어 있다. 0으로 채우지 않는다 */
import { matchContent, pickAuto } from './perf.js'
import { channelById, mediaRank } from '../data/channels.js'

/* 매체별 집계 출처. 여기 없는 매체는 "집계 확인 중"으로 남는다.
   백화점APP은 자사 집행분이 GA4에 잡히는지 확인되면 여기에 한 줄 추가 */
export const PERF_SOURCE = { '인스타': '주간 수집', '유튜브': '주간 수집', '타겟APP': '실적 입력' }

const norm = s => (s || '').toLowerCase().replace(/[\s\-_.,()[\]#]/g, '')

/* 캘린더 일정 기간이 걸치는 연월 집합 — 'YYYY-M' */
export function spanMonths(list) {
  const set = new Set()
  for (const e of list) {
    if (!e.date) continue
    const s = new Date(e.date + 'T00:00:00')
    const t = new Date((e.endDate || e.date) + 'T00:00:00')
    for (const d = new Date(s.getFullYear(), s.getMonth(), 1); d <= t; d.setMonth(d.getMonth() + 1)) {
      set.add(`${d.getFullYear()}-${d.getMonth() + 1}`)
    }
  }
  return set
}

/* 캘린더 캠페인 태그 ↔ 타겟APP 실적 대장 캠페인명.
   대장은 사람이 쓴 표기라 캘린더 태그와 글자가 다를 수 있어 공백·기호를 지우고 비교한다.

   조건 2개를 모두 만족해야 매칭 ('26.7.30 강화 — 이름만 보면 다른 시기 캠페인까지 끌어온다)
   ① 이름: 완전일치, 또는 대장 표기가 캠페인 태그를 통째로 품고 있을 것(태그 4자 이상)
      역방향(대장 표기가 태그 안에 들어가는 경우)은 인정하지 않는다 — 대장의 짧은 이름이
      긴 태그에 우연히 걸리는 과매칭이 생긴다
   ② 시기: 대장 행의 연월이 캘린더 타겟APP 일정이 걸치는 달 안에 있을 것 */
export function matchTargetApp(campaign, rows, months = null) {
  const a = norm(campaign)
  if (!a || !Array.isArray(rows)) return []
  return rows.filter(r => {
    const b = norm(r.name)
    if (!b) return false
    if (!(a === b || (a.length >= 4 && b.includes(a)))) return false
    if (months && months.size && !months.has(`${r.year}-${r.month}`)) return false
    return true
  })
}

/* events = 이 캠페인에 묶인 일정 전체, taRows = targetapp_stats 행 (없으면 null) */
export function buildCampaignPerf(events, { taRows = null, campaign = '' } = {}) {
  const byCh = new Map()
  for (const e of events) {
    const ch = e.channel || '기타'
    if (!byCh.has(ch)) byCh.set(ch, { ch, list: [], subs: new Set() })
    const g = byCh.get(ch)
    g.list.push(e)
    if (e.sub) g.subs.add(e.sub)
  }

  const contents = []
  const rows = []
  for (const g of byCh.values()) {
    const row = {
      ch: g.ch, label: channelById(g.ch)?.label || g.ch,
      subs: [...g.subs], count: g.list.length,
      exp: null, act: null, rate: null,
      source: PERF_SOURCE[g.ch] || null, note: '',
    }

    if (g.ch === '인스타' || g.ch === '유튜브') {
      const seen = new Set()
      let exp = 0, act = 0, near = 0
      for (const e of g.list) {
        /* 일정 1건당 게시물 1건. 우선순위는 담당자 확정, 제목 대조 자동 확정, 날짜 근사 순서 —
           모달의 후보 3건은 사람이 눈으로 고르는 목록이라 그대로 합산하면 무관한 게시물이 섞인다 */
        const hits = matchContent(e)
        const auto = pickAuto(hits)
        const m = (e.perfUrl && hits.find(h => h.url === e.perfUrl)) || auto || hits[0]
        if (!m || seen.has(m.url)) continue
        seen.add(m.url)
        const how = e.perfUrl === m.url ? 'pin' : auto && auto.url === m.url ? 'auto' : 'near'
        if (how === 'near') near++
        exp += m.views || 0
        act += (m.likes || 0) + (m.comments || 0)
        contents.push({ ...m, how, ch: g.ch, chLabel: row.label, sub: e.sub || '', event: e })
      }
      row.matched = seen.size
      row.exp = exp || null
      row.act = act || null
      if (!seen.size) row.note = '수집분에서 매칭된 게시물 없음'
      else {
        const parts = []
        if (near) parts.push(`날짜만으로 추정한 건 ${near}건`)
        if (g.ch === '유튜브') parts.push('유튜브는 좋아요와 댓글을 수집하지 않음')
        row.note = parts.join(', ')
      }
    }

    if (g.ch === '타겟APP') {
      if (taRows) {
        const hits = matchTargetApp(campaign, taRows, spanMonths(g.list))
        if (hits.length) {
          row.exp = hits.reduce((a, r) => a + (r.exp || 0), 0) || null
          row.act = hits.reduce((a, r) => a + (r.clk || 0), 0) || null
          row.note = '대장 표기 ' + [...new Set(hits.map(r => r.name))].join(', ')
        } else row.note = '실적 대장에서 같은 캠페인명을 찾지 못함'
      } else row.note = '실적 입력분 없음'
    }

    if (row.exp && row.act) row.rate = (row.act / row.exp) * 100
    rows.push(row)
  }

  /* 매체 표시 우선순위 ('26.7.29 MEDIA_RANK) — SNS, 기타, 장기 상시, 타겟APP 순 */
  rows.sort((a, b) => mediaRank(a.ch) - mediaRank(b.ch) || b.count - a.count)
  contents.sort((a, b) => b.t - a.t)

  const measured = rows.filter(r => r.exp != null || r.act != null)
  return {
    rows,
    contents,
    pending: rows.filter(r => r.exp == null && r.act == null).map(r => r.label),
    total: {
      exp: measured.reduce((a, r) => a + (r.exp || 0), 0),
      act: measured.reduce((a, r) => a + (r.act || 0), 0),
      count: events.length,
      media: rows.length,
      measured: measured.length,
    },
  }
}
