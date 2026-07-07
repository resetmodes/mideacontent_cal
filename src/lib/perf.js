/* 일정 ↔ SNS 수집 데이터 매칭 — "계획(캘린더) vs 실적(모니터링)" 연결 ('26.7)
   일정 모달의 "집행 실적 후보" 섹션에 사용.

   - 유튜브: 수집분의 게시시점이 근사값("3 weeks ago")이라 단위별 오차 폭을
     감안해 후보로 매칭 (단정 아님 — 링크로 확인하는 용도)
   - 인스타: IG.posts(게시물 단위)가 있을 때만 동작. clean-instagram.mjs 확장('26.7)
     이후 첫 격주 수집부터 채워짐 — 그전에는 섹션이 자동으로 숨겨짐 */
import { YT } from '../data/sns/youtube.js'
import { IG } from '../data/sns/instagram.js'
import { fromISO } from './parse.js'

const DAY = 86400000

/* 캘린더 세부 → 수집 데이터 계정 키 */
const YT_KEY = { '공식': 'the_hyundai', '와지트': 'wazitwine', '이야호': 'yiyaho_studio', '룸넘버': 'roomnumber' }
const IG_HANDLE = { '공식': 'the_hyundai', '도시': 'dosi.manual' }

const compact = n => {
  if (n == null) return '—'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(1) + '만'
  return n.toLocaleString('ko-KR')
}
const md = t => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()}` }

/* "3 weeks ago" → 수집 시각 기준 근사 시각 + 불확실 폭(ms). ISO 날짜면 오차 0 */
function approxTime(dateStr, baseISO) {
  if (!dateStr) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return { t: new Date(dateStr.slice(0, 10)).getTime(), unc: 0 }
  const m = dateStr.match(/(\d+)\s*(minute|hour|day|week|month)s?\s+ago/)
  if (!m) return null
  const unit = { minute: 60000, hour: 3600000, day: DAY, week: 7 * DAY, month: 30 * DAY }[m[2]]
  return { t: new Date(baseISO).getTime() - (+m[1]) * unit, unc: Math.max(unit / 2, DAY) }
}

/* 일정 기간(±허용 오차) 안에 게시된 자사 콘텐츠 후보 — 근접순 최대 3건 */
export function findPerformance(event) {
  if (!event?.date) return []
  const start = fromISO(event.date).getTime()
  const end = event.endDate ? fromISO(event.endDate).getTime() : start
  const hits = []
  const inRange = (t, pad) => t >= start - pad && t <= end + pad
  const dist = t => (t < start ? start - t : t > end ? t - end : 0)

  if (event.channel === '유튜브') {
    const key = YT_KEY[event.sub] || YT_KEY['공식']
    for (const v of YT.videos || []) {
      if (v.channel !== key) continue
      const a = approxTime(v.date, YT.generatedAt)
      if (!a || !inRange(a.t, a.unc + 2 * DAY)) continue
      hits.push({
        url: v.url, title: v.title, dist: dist(a.t),
        meta: `조회 ${compact(v.views)} · ${v.type === 'Shorts' ? '쇼츠' : '롱폼'} · 게시 ≈ ${md(a.t)}`,
      })
    }
  }

  if (event.channel === '인스타') {
    const handle = IG_HANDLE[event.sub] || IG_HANDLE['공식']
    for (const p of IG.posts || []) {
      if (p.handle !== handle) continue
      const t = new Date(p.ts).getTime()
      if (isNaN(t) || !inRange(t, 3 * DAY)) continue
      const metric = p.format === 'Reels' && p.views
        ? `조회 ${compact(p.views)}`
        : p.likes != null ? `좋아요 ${compact(p.likes)}` : '좋아요 비공개'
      hits.push({
        url: p.url, title: p.caption || '(캡션 없음)', dist: dist(t),
        meta: `${metric} · 게시 ${md(t)}`,
      })
    }
  }

  return hits.sort((a, b) => a.dist - b.dist).slice(0, 3)
}
