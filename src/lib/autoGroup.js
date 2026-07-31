/* 캠페인 태그 없는 일정 자동 묶음 ('26.7.30 사용자 지시)

   "#태그를 안 붙였어도 웨딩페어나 미아 25주년처럼 묶을 수 있는 건 알아서 묶어달라"

   방식: 제목에서 공통으로 나오는 말을 찾는다. 두 건 이상이 같은 말을 쓰면 한 주제로 본다.
   - 채널·포맷·행사 상투어(인스타, 릴스, 팝업, 오픈 등)는 어느 제목에나 나오므로 제외한다.
     이 말들로 묶으면 서로 무관한 일정이 한 덩어리가 된다
   - 후보는 토큰 1~3개를 이어붙인 구절. 긴 구절을 먼저 잡아 "미아 25주년"이
     "25주년"보다 우선되게 한다
   - 태그가 붙은 일정은 건드리지 않는다 (사람이 정한 게 항상 우선)

   추론이라 틀릴 수 있으므로 화면에서는 "자동 묶음"으로 표시하고, 사람이 태그를 달면
   그때부터는 정식 캠페인으로 넘어간다 */

/* 어느 제목에나 나오는 말 — 이걸로 묶으면 안 된다 */
const STOP = new Set([
  '인스타', '인스타그램', '유튜브', '카톡', '카카오톡', '릴스', '쇼츠', '피드', '캐러셀', '스토리',
  'app', 'apt', 'lcd', 'bus', '타겟앱', '푸쉬', '푸시', '팝업', '배너', '스플래시', '친구톡',
  '업로드', '게시', '발행', '촬영', '공식', '영상', '콘텐츠', '컨텐츠', '이미지', '소재',
  '오픈', '안내', '진행', '집행', '광고', '홍보', '이벤트', '행사', '프로모션',
  '현대', '현대백화점', '더현대', '백화점', '본점', '지점',
])

const tokens = title => (title || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .split(' ')
  .filter(t => t.length >= 2 && !STOP.has(t))

/* 토큰 1~3개를 이어붙인 후보 구절 */
function phrases(ts) {
  const out = []
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= ts.length; i++) out.push(ts.slice(i, i + n).join(' '))
  }
  return [...new Set(out)]
}

/* 화면에 보여줄 이름 — 원문에서 그 구절이 나온 그대로 잘라 온다 (소문자화 되돌리기) */
function displayName(title, phrase) {
  const words = phrase.split(' ')
  const raw = (title || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  for (let i = 0; i + words.length <= raw.length; i++) {
    const slice = raw.slice(i, i + words.length)
    if (slice.join(' ').toLowerCase() === phrase) return slice.join(' ')
  }
  return phrase
}

/* events = 캠페인 태그가 없는 일정들. 2건 이상 같은 말을 쓰는 묶음만 돌려준다 */
export function autoGroups(events, { min = 2 } = {}) {
  const rows = (events || []).map(e => ({ e, ts: tokens(e.title) })).filter(r => r.ts.length)
  if (rows.length < min) return []

  /* 구절마다 어떤 일정이 쓰는지 모은다 */
  const byPhrase = new Map()
  for (const r of rows) {
    for (const p of phrases(r.ts)) {
      if (!byPhrase.has(p)) byPhrase.set(p, [])
      byPhrase.get(p).push(r)
    }
  }

  /* 순서 = 걸치는 건수 × 구절 길이. 건수만 보면 "미아 25주년"과 "천호 25주년"이
     "25주년" 하나로 뭉뚱그려지고, 길이만 보면 "웨딩페어"가 "웨딩페어 사전예약"에
     쪼개진다. 곱해서 보고 동점이면 더 구체적인(토큰 많은) 쪽을 먼저 */
  const score = ([p, list]) => list.length * p.split(' ').length
  const ranked = [...byPhrase.entries()]
    .filter(([, list]) => list.length >= min)
    .sort((a, b) =>
      score(b) - score(a)
      || b[0].split(' ').length - a[0].split(' ').length
      || b[0].length - a[0].length)

  const used = new Set()
  const groups = []
  for (const [phrase, list] of ranked) {
    const fresh = list.filter(r => !used.has(r.e))
    if (fresh.length < min) continue
    fresh.forEach(r => used.add(r.e))
    groups.push({
      name: displayName(fresh[0].e.title, phrase),
      list: fresh.map(r => r.e),
      auto: true,
    })
  }
  return groups
}
