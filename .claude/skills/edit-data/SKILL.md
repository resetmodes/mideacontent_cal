---
name: edit-data
description: 매체 스펙·키워드·팀원·공휴일·SNS 계정 등 데이터 파일 수정 레시피. 스펙 갱신, 키워드/표기 추가, 팀원 등록, 계정 추가·이동 요청이면 이 스킬을 따를 것.
---

# 데이터 수정 스킬 — 파일별 레시피와 함정

공통: 수정 후 `npm run test` (정합성 테스트가 파일 간 어긋남을 잡아줌) → main push = 배포.

## 매체 스펙 (src/data/media.js)
- 스키마는 CLAUDE.md "데이터 스키마" 참조. 규격 숫자가 주인공 — size는 "1080 × 1920" 형식
  (숫자 규격일 때만 px 자동 표기됨)
- 확정값이면 `verified: true`, 가안이면 `false` (화면에 "검증 전 가안" 표기)
- `process`의 전달 마감 필수 스텝만 `hard: true` (형광 강조)
- **매체명(name)을 바꾸면** specLink.js 매핑도 함께 — 안 하면 test-data.mjs가 잡음
- 예산·비용 표기는 천 원 단위 ("40,000천 원")

## 입력 키워드·표기 (src/data/channels.js)
- 새 입력 변형 인식: `KEYWORDS`에 [키워드, 채널id, 세부|null] — **구체적인 것을 위에**
  (채널 직접 지칭 > 릴스·쇼츠 같은 포맷 유추)
- 제목 표기 통일: `TITLE_ALIASES`에 [입력 표현, 표준 표기] — 긴 표현부터 자동 적용되고
  치환 결과는 재치환 보호됨. 광역 규칙('앱'→APP)에 먹히면 안 되는 단어는 identity 행으로 잠금
- 표준 표기: 인스타 · 도시 · 카톡 · 유튜브 · APT LCD · APP푸쉬 · APP팝업 · APP · BUS
- **수정 후 scripts/test-parse.mjs에 케이스 추가** — 이 파일이 파서 동작을 정의함

## 팀원 (src/data/team.js)
- `'이메일(소문자)': '이름 직급'` 한 줄. 이메일이 대문자면 test-data.mjs가 잡음
- 계정 발급·쓰기 권한은 별도: Supabase Users 생성 + team_writers insert (setup.md 4장)

## 공휴일 (src/data/holidays.js)
- `'YYYY-MM-DD': '이름'` 한 줄 (임시공휴일 지정 시 즉시 추가)
- 연말에 다음 해 공휴일 일괄 추가 — 음력 기반(설·석탄일·추석)은 관보 확인

## SNS 계정 (scripts/sns/accounts.mjs)
- 계정 추가·그룹 이동은 이 파일이 단일 소스. 그룹 추가 시 MonitorPage.jsx의
  `IG_GROUP_ORDER` 상수도 동기화
- **주의: 계정 추가 = 수집량 증가 = Apify 비용 증가** (결과 1건당 과금, CLAUDE.md 비용 항목).
  여러 개 추가할 때는 비용 영향을 사용자에게 먼저 알릴 것
- 실적 매칭 대상을 바꾸려면 perf.js(YT_KEY·IG_HANDLE)와 clean-instagram.mjs의
  PERF_HANDLES를 함께 — 어긋나면 test-data.mjs가 잡음

## 자동 생성 파일 — 직접 수정 금지
`src/data/sns/instagram.js` · `youtube.js` · `trend.js` 는 스크립트 산출물.
데이터가 이상하면 파일을 고치지 말고 fix-incident 스킬로 (복구·가드는 거기 절차대로).
