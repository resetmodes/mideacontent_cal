/* 유튜브 Analytics 코드값 한글 라벨 ('26.7.30) — 모니터링 탭과 채널 덱이 공유.
   API가 새 코드를 추가해도 매핑이 없으면 원문을 그대로 보여준다 (화면이 비지 않게) */

export const TRAFFIC_KO = {
  YT_SEARCH: '유튜브 검색', RELATED_VIDEO: '추천 영상', SHORTS: '쇼츠 피드',
  SUBSCRIBER: '구독 피드', BROWSE: '홈 탐색', YT_CHANNEL: '채널 페이지',
  EXT_URL: '외부 사이트', PLAYLIST: '재생목록', YT_PLAYLIST_PAGE: '재생목록 페이지',
  NOTIFICATION: '알림', END_SCREEN: '최종 화면', HASHTAGS: '해시태그',
  ADVERTISING: '광고', SOUND_PAGE: '사운드 페이지', VIDEO_REMIXES: '리믹스',
  NO_LINK_EMBEDDED: '외부 임베드', NO_LINK_OTHER: '직접 유입', YT_OTHER_PAGE: '기타 페이지',
  ANNOTATION: '카드와 링크', CAMPAIGN_CARD: '캠페인 카드', PROMOTED: '프로모션',
  LIVE_REDIRECT: '라이브 이동', SHORTS_CONTENT_LINKS: '쇼츠 링크',
}
export const trafficKo = c => TRAFFIC_KO[c] || c

export const DEVICE_KO = {
  MOBILE: '모바일', DESKTOP: 'PC', TABLET: '태블릿',
  TV: 'TV', GAME_CONSOLE: '게임기', UNKNOWN_PLATFORM: '기타',
}
export const deviceKo = c => DEVICE_KO[c] || c

/* age13-17 → 13~17세, age65- → 65세 이상 */
export const ageKo = a => {
  const v = (a || '').replace('age', '')
  return v.endsWith('-') ? `${v.slice(0, -1)}세 이상` : `${v.replace('-', '~')}세`
}

export const GENDER_KO = { female: '여성', male: '남성', user_specified: '기타', gender_other: '기타' }
export const genderKo = g => GENDER_KO[g] || g

/* 채널별 demo(연령×성별 교차) → 연령 합계와 성별 합계.
   성별은 미상이 빠져 합이 100 미만이라, 확인된 시청자 기준으로 환산해 표기를 맞춘다 */
export function demoSplit(demo = []) {
  const age = {}, gender = {}
  for (const d of demo) {
    age[d.age] = (age[d.age] || 0) + (d.pct || 0)
    gender[d.gender] = (gender[d.gender] || 0) + (d.pct || 0)
  }
  const gSum = Object.values(gender).reduce((a, v) => a + v, 0) || 1
  return {
    ages: Object.entries(age).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([a, v]) => ({ code: a, label: ageKo(a), pct: +v.toFixed(1) })),
    genders: Object.entries(gender).sort((a, b) => b[1] - a[1])
      .map(([g, v]) => ({ code: g, label: genderKo(g), pct: +(v / gSum * 100).toFixed(1) })),
  }
}
