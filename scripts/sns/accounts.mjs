/* SNS 모니터링 대상 계정 — 단일 소스 (수집·정제·화면 그룹이 모두 이 파일 기준)
   그룹 체계 ('26.7 변경): 본사 / 사업소 / 아울렛 / 콘텐츠·IP / 해외 (+경쟁사 별도)
   계정 추가·이동 = 이 파일 수정 → 다음 수집부터 반영 */

export const IG_GROUP_ORDER = ['본사', '사업소', '아울렛', '콘텐츠·IP', '해외']

export const IG_ACCOUNTS = [
  /* ── 본사 ─────────────────────────────── */
  { handle: 'the_hyundai',              file: 'the_hyundai',              name: '더현대 본계정',         group: '본사', isMain: true  },
  { handle: 'dosi.manual',              file: 'dosi_manual',              name: '도시매뉴얼',            group: '본사', isMain: false },
  { handle: 'edit.dept',                file: 'edit_dept',                name: '에딧뎁트',              group: '본사', isMain: false },
  { handle: 'wazit_wine',               file: 'wazit_wine',               name: '와지트',                group: '본사', isMain: false },

  /* ── 사업소 (점포 전체 + 신춘자) ───────── */
  { handle: 'thehyundai_seoul',         file: 'thehyundai_seoul',         name: '더현대 서울',           group: '사업소', isMain: false },
  { handle: 'thehyundai_jungdong',      file: 'thehyundai_jungdong',      name: '더현대 중동',           group: '사업소', isMain: false },
  { handle: 'thehyundai_mokdong',       file: 'thehyundai_mokdong',       name: '더현대 목동',           group: '사업소', isMain: false },
  { handle: 'mokdong.now',              file: 'mokdong_now',              name: '현대 목동점(now)',      group: '사업소', isMain: false },
  { handle: 'thehyundai_daegu',         file: 'thehyundai_daegu',         name: '더현대 대구',           group: '사업소', isMain: false },
  { handle: 'thehyundai_tradecenter',   file: 'thehyundai_tradecenter',   name: '현대 무역센터점',       group: '사업소', isMain: false },
  { handle: 'thehyundai_pangyo',        file: 'thehyundai_pangyo',        name: '현대 판교점',           group: '사업소', isMain: false },
  { handle: 'thehyundai_cheonho',       file: 'thehyundai_cheonho',       name: '현대 천호점',           group: '사업소', isMain: false },
  { handle: 'thehyundai_mia',           file: 'thehyundai_mia',           name: '현대 미아점',           group: '사업소', isMain: false },
  { handle: 'thehyundai_kintex',        file: 'thehyundai_kintex',        name: '현대 킨텍스점',         group: '사업소', isMain: false },
  { handle: 'thehyundai_ulsan',         file: 'thehyundai_ulsan',         name: '현대 울산점',           group: '사업소', isMain: false },
  { handle: 'thehyundai_chungcheong',   file: 'thehyundai_chungcheong',   name: '현대 충청점',           group: '사업소', isMain: false },
  { handle: 'sinchoonja',               file: 'sinchoonja',               name: '신춘자 (신촌점)',       group: '사업소', isMain: false },
  { handle: 'connect_hyundai_busan',    file: 'connect_hyundai_busan',    name: '커넥트현대 부산',       group: '사업소', isMain: false },
  { handle: 'connect_hyundai_cheongju', file: 'connect_hyundai_cheongju', name: '커넥트현대 청주',       group: '사업소', isMain: false },

  /* ── 아울렛 ───────────────────────────── */
  { handle: 'hyundaioutlets',           file: 'hyundaioutlets',           name: '현대아울렛 공식',       group: '아울렛', isMain: false },
  { handle: 'hyundaioutlets_space1',    file: 'hyundaioutlets_space1',    name: '현대아울렛 스페이스원', group: '아울렛', isMain: false },
  { handle: 'hyundaioutlets_gimpo',     file: 'hyundaioutlets_gimpo',     name: '현대아울렛 김포',       group: '아울렛', isMain: false },
  { handle: 'hyundaioutlets_daejeon',   file: 'hyundaioutlets_daejeon',   name: '현대아울렛 대전',       group: '아울렛', isMain: false },
  { handle: 'hyundaioutlets_songdo',    file: 'hyundaioutlets_songdo',    name: '현대아울렛 송도',       group: '아울렛', isMain: false },

  /* ── 콘텐츠·IP ────────────────────────── */
  { handle: 'thehyundaiculture',        file: 'thehyundaiculture',        name: '더현대컬처',            group: '콘텐츠·IP', isMain: false },
  { handle: 'hmoka3700',                file: 'hmoka3700',                name: '현대어린이책미술관',    group: '콘텐츠·IP', isMain: false },
  { handle: 'peer_official',            file: 'peer_official',            name: '피어 PEER',             group: '콘텐츠·IP', isMain: false },
  { handle: 'heendy.life',              file: 'heendy_life',              name: '흰디 Heendy',           group: '콘텐츠·IP', isMain: false },
  { handle: 'thehyundai_beclean',       file: 'thehyundai_beclean',       name: '비클린(인디뷰티)',      group: '콘텐츠·IP', isMain: false },
  { handle: 'till_white',               file: 'till_white',               name: '틸화이트',              group: '콘텐츠·IP', isMain: false },

  /* ── 해외 ─────────────────────────────── */
  { handle: 'the_hyundai_tw',           file: 'the_hyundai_tw',           name: '더현대 대만',           group: '해외', isMain: false },
  { handle: 'the_hyundai_jp',           file: 'the_hyundai_jp',           name: '더현대 일본',           group: '해외', isMain: false },
]

/* 경쟁사 — 자사 비교에 섞지 않고 별도 섹션 */
export const IG_COMPETITORS = [
  { handle: 'only_shinsegae', file: 'only_shinsegae', name: '신세계백화점', group: '경쟁사', isMain: false },
  { handle: 'lotteshopping',  file: 'lotteshopping',  name: '롯데백화점',   group: '경쟁사', isMain: false },
]

export const YT_CHANNELS = [
  { key: 'the_hyundai',   name: 'THE HYUNDAI',        url: 'https://www.youtube.com/@the_hyundai',   isMain: true  },
  { key: 'wazitwine',     name: '와지트 WAZIT',       url: 'https://www.youtube.com/@wazitwine',     isMain: false },
  { key: 'roomnumber',    name: '룸넘버 ROOM NUMBER', url: 'https://www.youtube.com/@%EB%A3%B8%EB%84%98%EB%B2%84ROOMNUMBER', isMain: false },
  { key: 'yiyaho_studio', name: '이야호스튜디오',     url: 'https://www.youtube.com/@yiyaho_studio', isMain: false },
]
