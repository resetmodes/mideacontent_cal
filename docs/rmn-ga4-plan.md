# RMN × GA4 연동 계획 (3차)

'26.7 기준. 목표: 캠페인 종료 시 GA4에서 노출·클릭을 자동 수집해 ① RMN 부킹에 첨부(대시보드 표시), ② 광고주 리포트 xlsx(부쉐론 양식) 자동 생성.

## 0. 지금 상태 한 줄 요약

**코드는 준비됐고, GA 관리자의 권한 승인 하나에 전부 막혀 있다.**
규빈이 지금 할 일은 아래 1번 요청문 전달뿐. 나머지는 승인 후 순서대로 진행하면 된다.

## 1. 규빈 액션 — GA 관리자에게 전달 (지금)

GA 화면 좌하단 관리 → "조직 관리자 보기"에서 관리자를 확인하고, 아래를 그대로 전달:

> **[GA4 서비스 계정 뷰어 권한 추가 요청]**
> - 대상 속성: 통합앱 – GA4 (현대백화점), Property ID **404178718**
> - 추가할 서비스 계정: `ga4-report-bot@ehyundaiappad.iam.gserviceaccount.com`
> - 부여 권한: **뷰어** (읽기 전용)
> - 사유: 앱 광고 캠페인 리포트(노출·클릭·CTR·CPM·CPC) 자동 수집 파이프라인 연동.
>   Data API 읽기 전용, 데이터 변경·삭제 권한 불필요
> - 추가 위치: GA 관리 → 계정(또는 속성) 액세스 관리 → 사용자 추가

※ 본인 계정(ehyundaidept@gmail.com)은 속성 관리자가 아니라 직접 추가 불가 —
Analytics 360 조직 연결 계정이라 사용자 관리가 조직 레벨로 잠겨 있음 (확인 완료).

## 2. 승인 문자 오면 — GCP 작업 5분 (규빈, 클릭 순서)

1. console.cloud.google.com → 프로젝트 `ehyundaiappad` 선택
2. 좌측 메뉴 "API 및 서비스" → "라이브러리" → **Google Analytics Data API** 검색 → "사용" 클릭
   (Admin API 아님 — 정확히 "Data API")
3. 좌측 "IAM 및 관리자" → "서비스 계정" → `ga4-report-bot` 클릭 → "키" 탭
   → "키 추가" → "새 키 만들기" → **JSON** → 만들기 (파일이 자동 다운로드됨)
4. 다운로드된 JSON 파일을 Claude Code 세션에 전달 (또는 GitHub Secret 등록까지 맡기기)
   — **리포에 커밋 절대 금지**, GitHub Secret `GA4_KEY_JSON`으로만 보관

## 3. 구좌 구분 파라미터 — **확인 완료 ('26.7.27, 탐색 분석 "노규빈 스터디_구찌 캠페인" 실물 대조)**

- 이벤트: `view_ad` 존재 확인 (관리 목록에 안 보였던 건 목록 표시 한계 — 탐색 분석 표에 실데이터로 찍힘)
- **구좌 구분 = 맞춤 측정기준 `광고_광고게시위치`** — 값: 통합앱_스플래시 / 통합앱_메인하단배너 /
  통합앱_오픈팝업 / 통합앱_헤드라인뉴스 (→ RMN 스플래시/하단배너/팝업배너/헤드라인 뉴스 매핑)
- **광고주 필터 = 맞춤 측정기준 `광고_광고주명`** (탐색은 "포함 부쉐론" 식) — RMN 부킹 광고주명과 직결
- 보조: `광고_게시시작일`(회차), `광고_롤링배너순서`, 세그먼트 Android/iOS, 값 = 이벤트 수
- 팀의 수기 측정 방식 = 이 탐색 분석 (탐색은 API 실행 불가 → Data API로 동일 쿼리 재현이 자동화 방향)
- API용 실제 파라미터명(customEvent:*)과 클릭 이벤트명(click_ad 추정)은 권한 확보 후
  메타데이터 API(GET /properties/404178718/metadata)로 확정 — 추가 사용자 확인 불필요

## 4. 구현 (Claude Code 담당 — 권한·키·파라미터 확보 후)

이 리포에 이미 있는 SNS 수집 파이프라인(`.github/workflows/sns-collect.yml`)과 같은 구조:

1. **수집 잡**: `.github/workflows/ga4-collect.yml` — 매일 아침 cron.
   GA4 Data API로 전일 [날짜 × 구좌 × view_ad × click_ad] 조회 (Secret `GA4_KEY_JSON` 사용)
2. **부킹 자동 첨부**: 수집값을 기간·구좌로 rmn_bookings에 매칭 → 노출·클릭 컬럼 업데이트
   (rmn_bookings에 `impressions`/`clicks` 컬럼 ALTER 1줄 — 그때 SQL 전달)
3. **화면**: RMN 목록·정산 요약에 노출·클릭·CTR 표시 (집행 중 캠페인은 진행분까지 누적)
4. **리포트 xlsx — 출력 단계는 구현 완료 ('26.7)**: `scripts/rmn/build-report.mjs` —
   부쉐론 템플릿(data/templates/rmn-report.xlsx)의 BT(날짜)/BU(노출)/BV(클릭) 입력존 +
   캠페인 개요를 채우면 CTR·CPM·CPC 전부 Excel 자동 계산. `--mock`으로 즉시 검증 가능,
   GA 키 확보 후 수집 스크립트(ga4-collect.mjs)가 daily JSON을 만들어 넘기면 끝.
   캠페인 종료일 트리거로 자동 생성 (14일 외 기간은 Daily 블록 행 확장 로직 — 남은 과제)

전환매출은 실데이터가 없어 자동화 범위 제외 (확정). 노출·클릭은 우리가 매체사라
전부 자체 GA4에서 나옴 — 외부 매체 연동 불필요.

## 5. 참고 — 확보된 값

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `ehyundaiappad` (번호 554346525427) |
| GA4 Property ID | `404178718` (GA 계정 209344740) |
| 서비스 계정 | `ga4-report-bot@ehyundaiappad.iam.gserviceaccount.com` — IAM 탭에서 정확한 주소 재확인 |
| 수집 이벤트 | `view_ad`(노출) / `click_ad`(클릭) |
| 리포트 템플릿 구조 | Daily 블록: 스플래시 60~73 / 팝업 80~93 / 메인 99~112 / 하단 118~131 / 헤드라인 137~150행 |
