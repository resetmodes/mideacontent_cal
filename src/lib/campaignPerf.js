/* 캠페인 통합 성과 ('26.7.30) — 캠페인 하나에 묶인 일정들의 집행 결과를 매체별로 모은다.

   설계 원칙
   - 매체마다 집계 출처가 다르다 (인스타·유튜브 = 주간 수집, 타겟APP = 어드민 실적 입력,
     나머지는 미집계). 행마다 출처를 함께 돌려주고 화면에서 배지로 노출한다
   - 값이 없는 매체는 추정하지 않고 비워 둔다 (수치 날조 금지)
   - 유튜브는 좋아요·댓글을 수집하지 않으므로 반응이 항상 비어 있다. 0으로 채우지 않는다 */
import { matchContent } from './perf.js'
import { channelById, mediaRank } from '../data/channels.js'

/* 매체별 집계 출처. 여기 없는 매체는 "집계 확인 중"으로 남는다.
   백화점APP은 자사 집행분이 GA4에 잡히는지 확인되면 여기에 한 줄 추가 */
export const PERF_SOURCE = { '인스타': '주간 수집', '유튜브': '주간 수집', '타겟APP': '실적 입력' }

const norm = s => (s || '').toLowerCase().replace(/[\s\-_.,()[\]#]/g, '')

/* 캘린더 캠페인 태그 ↔ 타겟APP 실적 대장 캠페인명.
   대장은 사람이 쓴 표기라 캘린더 태그와 글자가 다를 수 있어 공백·기호를 지우고 비교한다.
   완전일치 또는 포함관계(짧은 쪽 4자 이상)만 인정 — 짧은 태그가 아무 캠페인에나 걸리는 것 방지 */
export function matchTargetApp(campaign, rows) {
  const a = norm(campaign)
  if (!a || !Array.isArray(rows)) return []
  return rows.filter(r => {
    const b = norm(r.name)
    if (!b) return false
    if (a === b) return true
    const [s, l] = a.length <= b.length ? [a, b] : [b, a]
    return s.length >= 4 && l.includes(s)
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
      let exp = 0, act = 0, hit = 0
      for (const e of g.list) {
        /* 일정 1건당 가장 가까운 게시물 1건만 — 모달의 후보 3건은 사람이 눈으로 고르는 용도라
           그대로 합산하면 캠페인과 무관한 게시물까지 실적에 섞인다 */
        for (const m of matchContent(e).slice(0, 1)) {
          if (seen.has(m.url)) continue
          seen.add(m.url)
          hit++
          exp += m.views || 0
          act += (m.likes || 0) + (m.comments || 0)
          contents.push({ ...m, ch: g.ch, chLabel: row.label, sub: e.sub || '', event: e })
        }
      }
      row.matched = hit
      row.exp = exp || null
      row.act = act || null
      if (!hit) row.note = '수집분에서 매칭된 게시물 없음'
      else if (g.ch === '유튜브') row.note = '유튜브는 좋아요와 댓글을 수집하지 않음'
    }

    if (g.ch === '타겟APP') {
      if (taRows) {
        const hits = matchTargetApp(campaign, taRows)
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
