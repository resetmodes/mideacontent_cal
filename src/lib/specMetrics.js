/* 매체 스펙 "참고 지표" 자동 최신화 ('26.7.29)
   언드 미디어(인스타·유튜브)는 모니터링 탭이 매주 실제 수치를 수집하므로,
   media.js의 '25.1 고정 문구 대신 최신 수집분으로 대체한다.
   ─ 매핑에 없는 매체(홈페이지·앱·카카오톡 등 비SNS)는 media.js 값을 그대로 사용
   ─ 수집 실패로 값이 없으면(신규 계정 등) 역시 기존 값 유지 (빈 지표 노출 방지) */
import { IG } from '../data/sns/instagram.js'
import { YT } from '../data/sns/youtube.js'

/* 매체명 → 모니터링 계정 키 (인스타 handle · 유튜브 key) */
const LINK = {
  '인스타그램 · 공식 (the_hyundai)': { ig: 'the_hyundai' },
  '인스타그램 · 도시매뉴얼 (dosi.manual)': { ig: 'dosi.manual' },
  '인스타그램 · 에딧뎁트 (edit.dept)': { ig: 'edit.dept' },
  '유튜브 · 공식 (THE HYUNDAI)': { yt: 'the_hyundai' },
  '유튜브 · 룸넘버 (ROOMNUMBER)': { yt: 'roomnumber' },
  '유튜브 · 이야호 (이야호스튜디오)': { yt: 'yiyaho_studio' },
  '인스타+유튜브 · 와지트 (wazit_wine · WAZIT)': { ig: 'wazit_wine', yt: 'wazitwine' },
}

/* 30.4만 · 1,240 식 한글 축약 (채널이 스스로 표기하는 방식 — 소수 1자리 유지) */
const num = n => {
  if (n == null) return null
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만`
  return n.toLocaleString('ko-KR')
}
const ymd = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : null)

function igText(handle) {
  const a = (IG.accounts || []).find(x => x.handle === handle)
  if (!a || a.followers == null) return null
  const parts = [`팔로워 ${num(a.followers)}`]
  if (a.postsLast30 != null) parts.push(`최근 1개월 발행 ${a.postsLast30}건`)
  if (a.avgLikes != null) parts.push(`평균 좋아요 ${num(a.avgLikes)}`)
  if (a.engagementPer1k != null) parts.push(`참여/1k ${a.engagementPer1k}`)
  return parts.join(' · ')
}

function ytText(key) {
  const c = (YT.channels || []).find(x => x.key === key)
  if (!c || c.subscribers == null) return null
  const parts = [`구독 ${num(c.subscribers)}`]
  if (c.totalVideos != null) parts.push(`영상 ${c.totalVideos.toLocaleString('ko-KR')}개`)
  if (c.avgViews != null) parts.push(`최근 평균 조회 ${num(c.avgViews)}`)
  return parts.join(' · ')
}

/* media.extra를 받아 "참고 지표"만 최신 수집값으로 교체한 새 객체 반환 */
export function withLiveMetrics(name, extra) {
  const link = LINK[name]
  if (!link) return extra
  const bits = []
  if (link.ig) { const t = igText(link.ig); if (t) bits.push(link.yt ? `인스타 ${t}` : t) }
  if (link.yt) { const t = ytText(link.yt); if (t) bits.push(link.ig ? `유튜브 ${t}` : t) }
  if (!bits.length) return extra
  const at = ymd(link.ig ? IG.generatedAt : YT.generatedAt)
  return { ...(extra || {}), '참고 지표': `${bits.join(' / ')}${at ? ` (${at} 수집)` : ''}` }
}
