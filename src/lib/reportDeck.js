/* 월간 리포트 덱 — 수치 계산 계층 ('26.7.31)
   시안(12장) 구조의 슬라이드별 수치를 전부 여기서 계산한다. 서술(인사이트)은
   api/report-narrate.js 가 이 결과의 digest 만 받아 쓴다 — 모델은 숫자를 만들지 않는다.

   원칙
   - 데이터가 없는 슬라이드는 null (화면에서 자동 생략) — 추정·날조 없음
   - 전월 비교는 양쪽 다 있을 때만 계산, 아니면 null
   - digest 에 없는 숫자가 서술에 나오면 checkNarration 이 잡는다 */

import { buildMonthlyReport, snsMonthlyDelta } from './report.js'

const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`
const prevYm = (y, m) => (m === 1 ? [y - 1, 12] : [y, m - 1])
export const fmtMan = n => {
  if (n == null) return ''
  if (Math.abs(n) < 10000) return n.toLocaleString()
  const v = n / 10000
  return (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) + '만'
}
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)

/* 팀·촬영·휴점을 뺀 매체 집행만 */
const isMedia = e => !['팀', '촬영', '휴점'].includes(e.kind || '')

export function buildReportDeck({ year, month, events = [], yta = null, trend = [], ig = null, ugc = null, yt = null, targetRows = null, rmnRows = null }) {
  const key = ym(year, month)
  const [py, pm] = prevYm(year, month)
  const mediaEvents = events.filter(isMedia)
  const cur = buildMonthlyReport(mediaEvents, year, month)
  const prev = buildMonthlyReport(mediaEvents, py, pm)
  const shoots = events.filter(e => e.kind === '촬영' && e.date?.startsWith(key)).length

  /* ── 유튜브: YTA 월 버킷 (있는 채널만) ── */
  let youtube = null
  if (yta?.channels) {
    const chans = Object.entries(yta.channels).map(([k, v]) => {
      const m0 = (v.monthly || []).find(x => x.month === key)
      const m1 = (v.monthly || []).find(x => x.month === ym(py, pm))
      if (!m0) return null
      const name = yt?.channels?.find(c => c.key === k)?.name || k
      return { key: k, name, views: m0.views, prevViews: m1?.views ?? null,
        delta: m1 ? pct(m0.views, m1.views) : null, subsNet: m0.subsNet,
        mult: m1 && m1.views > 0 ? +(m0.views / m1.views).toFixed(1) : null }
    }).filter(Boolean).sort((a, b) => b.views - a.views)
    if (chans.length) {
      const total = chans.reduce((s, c) => s + c.views, 0)
      const prevTotal = chans.every(c => c.prevViews != null) ? chans.reduce((s, c) => s + c.prevViews, 0) : null
      youtube = { chans, total, prevTotal, delta: prevTotal ? pct(total, prevTotal) : null }
    }
  }

  /* ── 유입 구조: 대표 채널 traffic (수집 창 전체 — 기준 병기용 range 포함) ── */
  let traffic = null
  const mainKey = yt?.channels?.find(c => c.isMain)?.key
  if (yta?.channels?.[mainKey]?.traffic?.length) {
    const rows = yta.channels[mainKey].traffic
    const total = rows.reduce((s, t) => s + (t.views || 0), 0)
    const top = rows[0]
    traffic = {
      range: yta.range, rows: rows.slice(0, 5),
      total, topSource: top.source, topShare: total ? Math.round((top.views / total) * 100) : null,
    }
  }

  /* ── 인스타: 월 스냅샷 증감 (스냅샷 2개 미만이면 생략) ── */
  let instagram = null
  const delta = snsMonthlyDelta(trend, year, month)
  if (delta) {
    const groupOf = {}
    for (const a of ig?.accounts || []) groupOf[a.handle] = a.group || '기타'
    const byGroup = {}
    let total = 0
    for (const [h, d] of Object.entries(delta.igFollowers)) {
      const g = groupOf[h] || '기타'
      byGroup[g] = (byGroup[g] || 0) + d
      total += d
    }
    const groups = Object.entries(byGroup).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v)
    instagram = { from: delta.from, to: delta.to, total, groups }
  }

  /* ── 고객 게시물 ── */
  let ugcSlide = null
  if (ugc?.totalPosts) {
    const top = (ugc.topPosts || [])[0] || null
    ugcSlide = {
      windowSince: ugc.windowSince, posts: ugc.totalPosts, engagement: ugc.totalEngagement,
      influencer: ugc.influencerPosts, ad: ugc.adPosts,
      sentiment: ugc.sentiment || null,
      top: top ? { owner: top.owner, likes: top.likes, caption: (top.caption || '').slice(0, 60) } : null,
    }
  }

  /* ── 타겟APP: 해당 월 실적 대장 행 합산 ── */
  let target = null
  const tRows = (targetRows || []).filter(r => r.year === year && r.month === month)
  if (tRows.length) {
    const sum = f => tRows.reduce((s, r) => s + (r[f] || 0), 0)
    const exp = sum('exp'), clk = sum('clk')
    const byMedia = {}
    for (const r of tRows) for (const m of r.media || []) byMedia[m] = (byMedia[m] || 0) + (r.exp || 0) / (r.media?.length || 1)
    const medias = Object.entries(byMedia).map(([name, v]) => ({ name, v: Math.round(v) })).sort((a, b) => b.v - a.v)
    target = { rows: tRows.length, exp, clk, ctr: exp ? +((clk / exp) * 100).toFixed(2) : null, medias,
      top3Share: exp && medias.length > 3 ? Math.round((medias.slice(0, 3).reduce((s, m) => s + m.v, 0) / exp) * 100) : null }
  }

  /* ── RMN: 시작일이 이 달인 부킹 (취소 제외) ── */
  let rmn = null
  const rRows = (rmnRows || []).filter(b => b.start_date?.startsWith(key) && b.status !== '취소')
  if (rRows.length) {
    const amount = rRows.reduce((s, b) => s + (b.actual_price || 0), 0)
    const advertisers = [...new Set(rRows.map(b => b.advertiser))]
    const taxPending = rRows.filter(b => ['집행', '결과 리포트'].includes(b.status)).length
    rmn = { count: rRows.length, advertisers: advertisers.length, amountK: Math.round(amount / 1000), taxPending }
  }

  /* ── 다음 달 예정 ── */
  const [ny, nm] = month === 12 ? [year + 1, 1] : [year, month + 1]
  const next = buildMonthlyReport(mediaEvents, ny, nm)
  const nextSlide = next.total ? {
    month: nm, total: next.total, byChannel: next.byChannel,
    campaigns: next.campaigns.map(c => ({ name: c.name, count: c.count })),
  } : null

  const deck = {
    year, month,
    summary: { exec: cur.total, shoots, ytViews: youtube?.total ?? null, ugcPosts: ugcSlide?.posts ?? null, confirmed: cur.confirmedTotal },
    exec: cur.total ? {
      total: cur.total, prevTotal: prev.total || null, byChannel: cur.byChannel,
      topChannel: Object.entries(cur.byChannel).sort((a, b) => b[1] - a[1])[0] || null,
      topShare: cur.total ? Math.round(((Object.entries(cur.byChannel).sort((a, b) => b[1] - a[1])[0]?.[1] || 0) / cur.total) * 100) : null,
    } : null,
    campaigns: cur.total ? {
      tagged: cur.total - cur.noCampaign, noCampaign: cur.noCampaign,
      taggedShare: Math.round(((cur.total - cur.noCampaign) / cur.total) * 100),
      list: cur.campaigns.map(c => ({ name: c.name, count: c.count, channels: c.channels, period: c.period })),
    } : null,
    youtube, traffic, instagram, ugc: ugcSlide, target, rmn, next: nextSlide,
  }
  deck.digest = buildDigest(deck)
  return deck
}

/* ── 서술용 수치 요약 — 모델이 인용해도 되는 숫자는 전부 이 문자열 안에 있어야 한다 ── */
function buildDigest(d) {
  const L = []
  const p = s => L.push(s)
  p(`대상 월 ${d.year}년 ${d.month}월`)
  p(`매체 집행 ${d.summary.exec}건, 촬영 ${d.summary.shoots}건, 실적 확정 ${d.summary.confirmed}건`)
  if (d.exec) {
    const ch = Object.entries(d.exec.byChannel).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}건`).join(', ')
    p(`매체별 집행 ${ch}`)
    if (d.exec.topChannel) p(`최다 매체 ${d.exec.topChannel[0]} ${d.exec.topChannel[1]}건, 집중도 ${d.exec.topShare}%`)
    if (d.exec.prevTotal != null) p(`전월 집행 ${d.exec.prevTotal}건`)
  }
  if (d.campaigns) {
    p(`캠페인 태그된 집행 ${d.campaigns.tagged}건 (${d.campaigns.taggedShare}%), 미지정 ${d.campaigns.noCampaign}건`)
    for (const c of d.campaigns.list) p(`캠페인 ${c.name} ${c.count}건 (${c.channels.join(', ')})`)
  }
  if (d.youtube) {
    p(`유튜브 합계 조회 ${fmtMan(d.youtube.total)}${d.youtube.prevTotal != null ? `, 전월 ${fmtMan(d.youtube.prevTotal)}, 증감 ${d.youtube.delta}%` : ''}`)
    for (const c of d.youtube.chans) {
      p(`유튜브 ${c.name} 조회 ${fmtMan(c.views)}${c.prevViews != null ? `, 전월 ${fmtMan(c.prevViews)}, 증감 ${c.delta}%` : ''}${c.mult != null ? `, 배수 ${c.mult}배` : ''}, 구독 순증 ${c.subsNet >= 0 ? '+' : ''}${c.subsNet.toLocaleString()}명`)
    }
  }
  if (d.traffic) p(`대표 채널 유입 1위 ${d.traffic.topSource} 비중 ${d.traffic.topShare}% (조회 ${fmtMan(d.traffic.total)} 중, 기준 ${d.traffic.range?.start}부터 ${d.traffic.range?.end})`)
  if (d.instagram) {
    p(`인스타 팔로워 순증 합계 ${d.instagram.total >= 0 ? '+' : ''}${d.instagram.total.toLocaleString()}명 (${d.instagram.from}부터 ${d.instagram.to})`)
    for (const g of d.instagram.groups) p(`인스타 ${g.name} 계정군 순증 ${g.v >= 0 ? '+' : ''}${g.v.toLocaleString()}명`)
  }
  if (d.ugc) {
    p(`고객 게시물 ${d.ugc.posts}건, 총 반응 ${d.ugc.engagement.toLocaleString()}, 인플루언서 ${d.ugc.influencer}건, 협찬 표기 ${d.ugc.ad}건`)
    if (d.ugc.top) p(`최다 반응 게시물 좋아요 ${d.ugc.top.likes.toLocaleString()} (${d.ugc.top.caption})`)
  }
  if (d.target) {
    p(`타겟APP 노출 ${fmtMan(d.target.exp)}, 클릭 ${fmtMan(d.target.clk)}, 클릭률 ${d.target.ctr}%${d.target.top3Share != null ? `, 상위 3개 매체 비중 ${d.target.top3Share}%` : ''}`)
    for (const m of d.target.medias.slice(0, 5)) p(`타겟APP ${m.name} 노출 ${fmtMan(m.v)}`)
  }
  if (d.rmn) p(`RMN 부킹 ${d.rmn.count}건, 광고주 ${d.rmn.advertisers}곳, 광고비 ${d.rmn.amountK.toLocaleString()}천원, 세금계산서 대기 ${d.rmn.taxPending}건`)
  if (d.next) {
    const ch = Object.entries(d.next.byChannel).map(([k, v]) => `${k} ${v}건`).join(', ')
    p(`다음 달(${d.next.month}월) 예정 ${d.next.total}건 (${ch})`)
    for (const c of d.next.campaigns) p(`다음 달 캠페인 ${c.name} ${c.count}건`)
  }
  return L.join('\n')
}

/* ── 서술 검증 — 서술 속 숫자가 digest 에 없으면 반환 (경고용, 발행은 막지 않음) ──
   한 자리 소수(2.3배 등)와 연도·월(1~12)은 허용, 콤마는 제거 후 비교 */
export function checkNarration(text, digest) {
  const nums = s => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/,/g, ''))
  const allowed = new Set(nums(digest))
  for (let i = 0; i <= 12; i++) allowed.add(String(i))
  const bad = []
  for (const n of nums(text)) {
    if (allowed.has(n)) continue
    if (/^(19|20)\d\d$/.test(n)) continue
    bad.push(n)
  }
  return [...new Set(bad)]
}
