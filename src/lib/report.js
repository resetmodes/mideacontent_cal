/* 월간 집행 리포트 — 데이터 계층 ('26.7 선행 구현)
   필드 정의·귀속 규칙은 docs/report-data-contract.md 가 계약 원본.
   UI·출력 양식은 규빈의 별도 양식 확정 후 별도 구현 (이 모듈은 순수 집계만).

   귀속 규칙: 일정은 "시작일이 속한 달"에 귀속 (기간 일정이 월을 걸쳐도 시작월 1건).
   집행 건수 = kind가 '촬영'이 아닌 일정. 촬영은 별도 카운트. */

export function buildMonthlyReport(events, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const inMonth = events.filter(e => e.date?.startsWith(prefix))
  const exec = inMonth.filter(e => e.kind !== '촬영')
  const shoots = inMonth.filter(e => e.kind === '촬영')

  const byChannel = {}
  for (const e of exec) byChannel[e.channel] = (byChannel[e.channel] || 0) + 1

  const campMap = {}
  for (const e of exec) {
    const c = e.campaign || null
    if (c) (campMap[c] = campMap[c] || []).push(e)
  }
  const campaigns = Object.entries(campMap).map(([name, list]) => {
    list.sort((a, b) => a.date.localeCompare(b.date))
    const lastEnd = list.reduce((m, e) => ((e.endDate || e.date) > m ? (e.endDate || e.date) : m), '')
    return {
      name,
      count: list.length,
      channels: [...new Set(list.map(e => e.channel))],
      period: { start: list[0].date, end: lastEnd },
      /* 확정 실적 — 담당자가 "선택"으로 확정한 게시물만 (후보는 리포트에 안 실음) */
      confirmed: list.filter(e => e.perfUrl).map(e => ({ date: e.date, title: e.title, url: e.perfUrl })),
      events: list.map(e => ({
        date: e.date, endDate: e.endDate || null, channel: e.channel, sub: e.sub || null,
        title: e.title, owner: e.owner || null, perfUrl: e.perfUrl || null,
      })),
    }
  }).sort((a, b) => a.period.start.localeCompare(b.period.start))

  return {
    year, month,
    total: exec.length,                       // 집행 건수 (촬영 제외)
    shootTotal: shoots.length,                // 촬영 건수 (별도)
    confirmedTotal: exec.filter(e => e.perfUrl).length,   // 실적 확정 건수
    byChannel,                                // 매체별 집행 건수
    campaigns,                                // 캠페인 단위 상세 (시작일순)
    noCampaign: exec.filter(e => !e.campaign).length,     // 캠페인 미지정 건수
  }
}

/* SNS 지표 월간 증감 — trend.js 스냅샷 중 해당 월의 처음/마지막을 비교.
   스냅샷이 그 달에 2개 미만이면 null (격주 수집 기준 한 달 = 보통 2개) */
export function snsMonthlyDelta(trend, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const inMonth = trend.filter(t => t.date.startsWith(prefix))
  if (inMonth.length < 2) return null
  const first = inMonth[0], last = inMonth[inMonth.length - 1]
  const dig = {}
  for (const h of Object.keys(last.ig || {})) {
    const a = first.ig?.[h]?.f, b = last.ig?.[h]?.f
    if (a != null && b != null) dig[h] = b - a
  }
  const dyt = {}
  for (const k of Object.keys(last.yt || {})) {
    const a = first.yt?.[k]?.s, b = last.yt?.[k]?.s
    if (a != null && b != null) dyt[k] = b - a
  }
  return { from: first.date, to: last.date, igFollowers: dig, ytSubscribers: dyt }
}
