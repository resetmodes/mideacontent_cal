# PLAYBOOK.md — AI 작업 플레이북

이 문서는 **어떤 AI 모델(저사양 포함)·새 세션이든** 이 프로젝트를 안전하게 수정하기 위한
운영 매뉴얼이다. 프로젝트 배경·기능 명세는 `CLAUDE.md`, 여기는 **작업 절차와 금지선**.

## 0. 작업 순서 (모든 작업 공통)

1. `CLAUDE.md` 읽기 (기능 맥락) → 이 문서 읽기 (절차)
2. 수정
3. **`npm run verify`** — 파서 테스트 + 데이터 가드 테스트 + 프로덕션 빌드. 실패하면 push 금지
4. 파서·키워드를 수정했다면 `scripts/test-parse.mjs`에 케이스 추가
5. 커밋(한국어, `feat:`/`fix:`/`chore:` 접두) → 작업 브랜치 push → main에 merge → push
   (main push = Vercel 자동 배포 = 즉시 실사용자 노출)
6. push 후 GitHub Actions "검증" 워크플로우가 초록인지 확인

## 1. 절대 금지 (위반 = 사고)

- `.env`, API 키·토큰 커밋 금지 (`APIFY_TOKEN`은 GitHub Secret + 로컬 .env에만)
- **자동 생성 파일 직접 수정 금지**: `src/data/sns/instagram.js` · `youtube.js` · `trend.js`
  (스크립트가 갱신 — 손대면 다음 수집 때 소실)
- `src/config.js`의 Supabase 실제 키를 지운 채 커밋 금지 (지우면 팀 DB 연결 끊김)
- clean-*.mjs의 **빈 결과 가드·carry-forward 제거 금지** ('26.7.7 데이터 소실 사고 2건의
  재발 방지 장치: 전면 실패 = 저장 스킵, 부분 실패 = 실패 계정 이전 값 유지.
  `scripts/test-guards.mjs`가 감시)
- SNS 수집 워크플로우 임의 재실행 금지 — **실행마다 Apify 과금(~$1.7)**, 월 무료 한도 $5.
  실패 시 Actions 로그로 원인(한도/토큰/push)부터 확인
- 디자인 규칙 (CLAUDE.md 상세): Pretendard · 흑백+현대그린 #0B4336 · 빨강은 금지/경고 전용 ·
  이모지 아이콘, box-shadow 카드, 그라데이션 금지 · 표는 가로선만
- 사용자 지시 구조를 임의 재구성하지 말 것. 확신 없으면 물어볼 것

## 2. 파일 지도 (무엇을 만지면 되는가)

| 파일 | 역할 | 수정 |
|---|---|---|
| `src/App.jsx` | 탭 셸 + 로그인 게이트 + 스펙 딥링크 상태 | 탭 추가 시 |
| `src/CalendarPage.jsx` | 캘린더 전체 (월간·캠페인·검색·모달·빠른입력·이력). shoot 모드 = 촬영일정 탭 | 캘린더 기능 |
| `src/SpecLibrary.jsx` | 매체 스펙 (external=외부용, mirror=미러용 새니타이즈) | 스펙 UI |
| `src/MonitorPage.jsx` | SNS 모니터링 (증감 표시 포함) | 모니터링 UI |
| `src/MirrorApp.jsx` | 미러 전용 사이트 셸 (`VITE_MIRROR=1` 빌드) | 미러 구성 |
| `src/data/media.js` | **매체 스펙 데이터 단일 소스** — 스펙 수정 = 이 파일 | 자주 |
| `src/data/channels.js` | 캘린더 매체 8종 + 키워드 + 표기 통일(TITLE_ALIASES) | 키워드 추가 |
| `src/data/team.js` | 이메일→작성자 이름 매핑 | 팀원 추가 |
| `src/data/holidays.js` | 공휴일 ('26·'27) | 연 1회·임시공휴일 |
| `src/lib/parse.js` | 빠른 입력 파서 (날짜·다중매체·촬영/업로드) | **수정 시 테스트 필수** |
| `src/lib/store.js` | Supabase/localStorage 저장 어댑터 + 이력 조회 | 스키마 변경 시 |
| `src/lib/auth.js` | 로그인 (Supabase Auth REST) | 거의 안 함 |
| `src/lib/perf.js` | 일정↔SNS 실적 매칭 (인스타 2계정·유튜브만) | 매칭 규칙 |
| `src/lib/specLink.js` | 캘린더 채널→스펙 매체 매핑 | 매체 개편 시 |
| `scripts/sns/*` | 수집(scrape)·정제(clean)·추이(append-trend). accounts.mjs = 계정 단일 소스 | 계정 변경 |
| `scripts/backup-events.mjs` | 일정 백업 | 거의 안 함 |
| `scripts/test-*.mjs` | 하네스 테스트 | 기능 추가 시 케이스 추가 |
| `prototype/index.html` | 디자인 원본 레퍼런스 | **수정 금지 (보존)** |

## 3. 검증 도구

- `npm run test` — 파서 20+ 케이스 + **데이터 정합성**(config 실키·매핑·키워드·계정 교차 검사)
  + 빈 데이터/carry-forward 가드 (네트워크·브라우저 불필요, 수 초)
- `npm run verify` — test + 프로덕션 빌드
- `npm run smoke` — **브라우저 자동 스모크** (UI 변경 시 실행): config 백업→로컬 모드
  빌드→핵심 플로우 확인→**config 원복·재빌드까지 전자동**. playwright 없는 환경은 자동 생략
- CI: `.github/workflows/verify.yml` — main·claude/** push마다 자동

## 3-1. 스킬 (.claude/skills/) — 작업 유형별 사고 절차

Claude Code가 자동 인식. 해당 유형 작업이면 반드시 스킬 절차대로:
- **add-feature** — 기능 추가: 설계 3질문·확립된 설계 원칙(비침습/숨김/하위호환/3뷰/가드)·
  구현 순서·검증·보고 형식
- **fix-incident** — 사고 대응: 층 분류(데이터/코드/배포/외부/설정)·복구 절차·
  과금 철칙·재발 방지 3종 세트(가드+테스트+기록)
- **edit-data** — 데이터 파일 수정: 파일별 레시피와 연쇄 수정 지점·함정

## 4. Supabase 현황 (스키마·정책은 data/supabase-setup.md가 원본)

- 테이블: `media_events` (일정, `kind`='촬영' 구분) · `media_events_history` (변경 이력,
  트리거 자동 기록) · `team_writers` (쓰기 권한 이메일)
- 정책: 읽기 = 로그인 필수 / 쓰기 = team_writers 등록자만 / 이력 읽기 = 로그인
- 클라이언트는 supabase-js 없이 REST 직접 호출 (store.js·auth.js 패턴 유지)
- **적용 대기 SQL** (사용자 실행 필요, 미적용 시 해당 기능만 비활성·기존 기능 무영향):
  ① kind 컬럼 (setup.md 5장) ② 이력 테이블+트리거 (setup.md 6장)
  ③ 미러 anon 읽기 (mirror-setup.md 2장) — 적용되면 이 목록에서 지울 것

## 4-1. 캘린더 데이터 복원 절차

`data/backup/media-events.json` (주 1회 자동 커밋)의 git 이력이 시점별 스냅샷.
복원: 원하는 시점의 파일을 `git show <sha>:data/backup/media-events.json` 으로 꺼내
`events` 배열을 Supabase SQL Editor에서 insert (id 충돌 시 해당 행 제외).
전체 복원 전에 반드시 현재 상태도 백업(Actions 수동 실행)해 둘 것.

## 5. 배포 지형

- 본 사이트: main push → Vercel 자동 (https://mediacontent-cal.vercel.app)
- 미러 사이트: 같은 리포, Vercel 두 번째 프로젝트(env `VITE_MIRROR=1`) — mirror-setup.md
- 워크플로우 3개: `sns-collect.yml`(격주 월 09:00 KST, **과금 주의**) ·
  `backup.yml`(주 1회 일정 백업) · `verify.yml`(push마다 테스트+빌드)

## 6. 자주 하는 작업 레시피

- **입력 키워드 추가**: channels.js `KEYWORDS`(인식) + `TITLE_ALIASES`(표기 통일) 한 줄씩
  → test-parse.mjs 케이스 추가 → verify
- **팀원 추가**: team.js 한 줄 (`'이메일': '이름 직급'`) + Supabase Users 계정 발급 +
  team_writers insert (setup.md 4장)
- **매체 스펙 수정**: media.js 해당 항목 편집 (스키마는 CLAUDE.md), verified 값 확인
- **SNS 계정 추가/이동**: scripts/sns/accounts.mjs + MonitorPage의 IG_GROUP_ORDER 동기화
- **공휴일 추가**: holidays.js 한 줄
- **새 일정 필드**: store.js toDb/fromDb + EventModal 폼 + setup.md에 ALTER SQL 장 추가
  (kind 패턴 참고 — 값 있을 때만 전송해 구 스키마 호환 유지)
