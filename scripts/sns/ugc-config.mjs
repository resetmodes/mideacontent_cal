/* UGC 수집·분석 설정 — 단일 소스 ('26.7)
   해시태그·기준을 바꾸려면 이 파일만 수정 (다음 수집부터 반영).

   비용 참고: 해시태그 수집도 Apify instagram-scraper 결과당 과금($2.70/1,000건).
   태그 5개 × 60건 = 최대 300건 ≈ $0.8/회. 태그를 늘리면 그만큼 증가. */

/* 추적 해시태그 — # 없이. 태그당 최근 1개월 게시물을 수집 */
export const UGC_TAGS = [
  '더현대서울',
  '더현대',
  '현대백화점',
  '더현대대구',
  '현대프리미엄아울렛',
]

export const UGC_RESULTS_LIMIT = 60      // 태그당 최대 수집 건수 (과금 상한)
export const UGC_WINDOW = '1 month'      // 수집 윈도우 — 계정 수집과 동일 기준

/* 인플루언서 판정: 팔로워 이 값 이상이면 대시보드에 표시 */
export const INFLUENCER_MIN_FOLLOWERS = 10000
export const PROFILE_LOOKUP_TOP = 30     // 팔로워 수를 실제 조회할 상위 작성자 수 (반응 순)

/* Claude 분석 — ANTHROPIC_API_KEY 없으면 감정·주제·요약 없이 정량만 저장 */
export const ANALYZE_MODEL = 'claude-opus-4-8'
export const ANALYZE_CAP = 500           // 감정·주제 분석 상한 (반응 순 상위)
export const UGC_TOPICS = [
  '팝업·전시',
  'F&B·식음',
  '쇼핑·상품',
  '공간·인테리어',
  '이벤트·프로모션',
  '서비스·불만',
  '기타',
]
