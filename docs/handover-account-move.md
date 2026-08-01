# 계정 이관 인수인계 ('26.7.31)

회사 정책으로 다른 Claude 계정에서 이 프로젝트를 이어가기 위한 문서입니다.
**코드와 데이터는 그대로 있고, 옮겨야 하는 것은 접근 권한과 자격증명뿐입니다.**

사이트 https://mediacontent-cal.vercel.app
저장소 resetmodes/mideacontent_cal

---

## 0. 새 세션 첫 마디

새 계정에서 첫 대화를 열 때 아래 한 줄이면 됩니다.

> 이 저장소를 이어받았습니다. CLAUDE.md와 PLAYBOOK.md, docs/handover-account-move.md를 읽고 현재 상태를 정리해 주세요.

`CLAUDE.md`는 저장소 루트에 있어 새 세션이 자동으로 읽습니다. 나머지는 위처럼 지목해야 읽습니다.

---

## 1. 문서 지도

### 반드시 먼저 읽을 것

| 파일 | 내용 | 분량 |
|---|---|---|
| `CLAUDE.md` | 프로젝트 전체 사양. 기능, 디자인 규칙, 문자열 규칙, 데이터 스키마, 도메인 지식 | 1,015줄 |
| `PLAYBOOK.md` | 작업 절차, 금지선, 파일 지도, 검증 도구 | 146줄 |
| `docs/handover-account-move.md` | 이 문서. 연동 자격증명과 미완료 항목 | |

이 셋이 살아있는 문서입니다. 기능을 추가하면 `CLAUDE.md`를 함께 갱신해 왔습니다.

### 절차 문서

| 파일 | 언제 보나 |
|---|---|
| `docs/runbook.md` | 장애 대응. 수집 실패, 배포 이상, 데이터 소실 |
| `docs/team-guide.md` | 팀원에게 사용법을 안내할 때 |
| `data/supabase-setup.md` | DB 테이블과 정책. 12개 장, 기능별로 나뉨 |
| `data/mirror-setup.md` | 미러 사이트 배포 절차 |
| `docs/teams-webhook-setup.md` | 팀즈 아침 브리핑 웹훅 재발급 |
| `docs/yt-analytics-setup.md` | 유튜브 스튜디오 지표 연동. 토큰 만료 시 재발급 |
| `docs/rmn-ga4-plan.md` | GA4 광고 실적 수집 설계 |

### 설계 문서 (구현 대기)

| 파일 | 상태 |
|---|---|
| `docs/ai-assistant-design.md` | 설계만. 화면 노출 없음 |
| `docs/report-data-contract.md` | 월간 리포트 데이터 계층. 양식 받으면 매핑만 하면 됨 |
| `docs/notify-center-design.md` | 알림센터. 1차 구현 완료, 딥링크는 2차 예정 |
| `docs/roadmap.md` | 향후 계획 |

### 참고 자료

| 파일 | 내용 |
|---|---|
| `data/media-kit-2025.md` | THE HYUNDAI 미디어킷 원본 정리 |
| `data/app-guja-request.md` | 앱 구좌 신청 프로세스 |
| `docs/handover-2607.md` | 이전 세션 스냅샷. 과거 기록용 |

---

## 2. 옮겨야 할 계정과 자격증명

**저장소에는 값이 없습니다.** 전부 GitHub Secrets나 외부 서비스에 있으므로, 새 계정에서 아래 접근 권한을 확보해야 합니다.

### GitHub Secrets 전체 목록

저장소 → Settings → Secrets and variables → Actions

| 시크릿 이름 | 쓰는 곳 | 없으면 |
|---|---|---|
| `APIFY_TOKEN` | SNS 주간 수집 | 인스타, 유튜브 지표 갱신 중단 |
| `ANTHROPIC_API_KEY` | 고객 게시물 감정 분석 | 감정과 주제만 빠지고 정량 지표는 정상 |
| `SUPABASE_SERVICE_KEY` | 팀즈 브리핑, 데이터 백업 | 브리핑에 일정이 안 실림 |
| `TEAMS_WEBHOOK_URL` | 팀즈 아침 브리핑 | 브리핑 발송 중단 |
| `GA4_KEY_JSON` | RMN 광고 실적 수집 | 노출, 클릭 수집 중단 |
| `NOTION_TOKEN` | 노션 캘린더 동기화 | 동기화 중단 |
| `NOTION_DB` | 노션 캘린더 동기화 | 동기화 중단 |
| `YT_OAUTH_CLIENT_ID` | 유튜브 스튜디오 지표 | 시청시간, 유입 경로 수집 중단 |
| `YT_OAUTH_CLIENT_SECRET` | 유튜브 스튜디오 지표 | 위와 같음 |
| `YT_OAUTH_REFRESH_TOKEN` | 유튜브 룸넘버 채널 | 룸넘버만 누락 |
| `YT_OAUTH_REFRESH_TOKEN_2` | 유튜브 공식 채널 | 공식만 누락 |
| `YT_OAUTH_REFRESH_TOKEN_3` | 유튜브 와지트 채널 | 와지트만 누락 |
| `YT_OAUTH_REFRESH_TOKEN_4` | 유튜브 이야호 채널 (미등록) | 이야호만 누락 |

**시크릿은 GitHub에 저장돼 있고 Claude 계정과 무관합니다.** 저장소 접근 권한만 유지되면 그대로 동작합니다. 새로 만들 필요 없습니다.

### 외부 서비스 로그인

| 서비스 | 용도 | 계정 |
|---|---|---|
| Apify | SNS 수집. Starter 플랜 월 $29 | 결제 계정 확인 필요 |
| Supabase | 일정, RMN, 정산 DB | 프로젝트 `moyxlzylnasqdwwahydc` |
| Vercel | 본 사이트, 미러 사이트 배포 | GitHub 연동 |
| Google Cloud | GA4 서비스 계정, 유튜브 OAuth 클라이언트 | 프로젝트 2개 (GA4용, 유튜브용) |
| 노션 | 대행사 업무 요청 DB 연동 | 통합 토큰 발급 계정 |
| Power Automate | 팀즈 브리핑 웹훅 | 웹훅 생성 계정 |
| Anthropic Console | API 키 발급 | **새 계정으로 재발급 필요** |

---

## 3. 새 계정에서 실제로 해야 할 일

### 3-1. Anthropic API 키 재발급 (필수)

계정이 바뀌면 기존 `ANTHROPIC_API_KEY`는 이전 계정에 묶여 있습니다.

1. https://console.anthropic.com 에 새 계정으로 로그인
2. Settings → API Keys → **Create Key**
3. 이름은 `mideacontent-cal` 정도로
4. 값 복사
5. 저장소 → Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY` → **Update**
6. 이전 계정 콘솔에서 옛 키 **Revoke**

키가 쓰이는 곳은 고객 게시물 감정 분석 한 곳입니다. 회당 약 $1이 새 계정으로 청구됩니다.

### 3-2. Apify 연결 확인

Apify 토큰은 Claude 계정과 무관하지만, 결제 주체가 바뀐다면 함께 정리해야 합니다.

1. https://console.apify.com → Settings → **Integrations**
2. Personal API token 확인 또는 재발급
3. 재발급했다면 저장소 시크릿 `APIFY_TOKEN` **Update**
4. Billing에서 Starter 플랜 결제 수단 확인

**수집 비용은 회당 약 $2.5입니다.** 주 1회 자동 실행이므로 월 $11 내외입니다. 수동 재실행은 매번 과금되니 Actions 로그로 실패 지점을 먼저 확인하세요.

### 3-3. 저장소 비공개 전환 (권장, 아직 미완료)

현재 저장소가 **공개**이고 아래 사내 자료가 올라가 있습니다.

- `data/rmn-seed.sql` 광고주 실명과 판매 금액 124건
- `data/backup/media-events.json` 광고 집행 일정 전체
- `src/data/team.js` 팀원 20명 실명과 사내 이메일
- `data/targetapp-seed.sql` 타겟APP 실적

`backup.yml`이 매주 일정을 이 공개 저장소에 커밋하고 있습니다.

1. 저장소 → **Settings** → 맨 아래 **Danger Zone**
2. **Change repository visibility** → **Change to private**
3. 전환 후 Vercel 배포가 한 번 도는지 확인

Vercel과 GitHub Actions 모두 비공개 저장소에서 동작합니다. Actions 무료 한도는 월 2,000분이고 현재 워크플로 합계는 월 150분 내외입니다.

---

## 4. Supabase SQL 실행 확인표

`data/supabase-setup.md`의 장 번호 기준입니다. 이미 실행한 것은 다시 하지 않아도 되지만, 새 세션이 상태를 모르므로 한 번 훑어 주세요.

확인 방법은 Supabase → Table Editor에서 테이블과 컬럼이 있는지 보는 것입니다.

| 장 | 내용 | 확인할 것 |
|---|---|---|
| 2 | 일정 테이블 | `media_events` 테이블 |
| 4 | 로그인, 쓰기 권한 | `team_writers` 테이블 |
| 5 | 촬영 탭, 실적 확정 | `media_events.kind`, `perf_url` 컬럼 |
| 6 | 변경 이력 | `media_events_history` 테이블 |
| 7 | 타겟APP 실적 | `targetapp_stats` 테이블 |
| 7-1 | 예산, 비용 | `targetapp_stats.budget`, `cost` 컬럼 |
| 8 | RMN 부킹 | `rmn_bookings` 테이블 |
| 8-1 | 수량 판매 | `rmn_bookings.qty` 컬럼 |
| 8-2 | 카카오 타겟팅, 인스타 구성 | `rmn_bookings.option` 컬럼 |
| 8-3 | RMN 이미지 첨부 | `rmn_bookings.images` 컬럼 |
| 8-4 | GA4 실적 | `rmn_bookings.impressions`, `clicks` 컬럼 |
| 8-5 | GA4 일별 적재 | `rmn_ga_daily` 테이블 |
| 8-6 | 발송 매체 수기 실적 | `rmn_bookings.perf_manual` 컬럼 |
| 9 | 정산 탭 | `settlements` 테이블, `settle-docs` 버킷 |
| 10 | 일정 이미지 첨부 | `media_events.images` 컬럼, `event-images` 버킷 |
| 11 | 노션 동기화 | `media_events.notion_id`, `notion_gone` 컬럼 |
| 12 | 광고주 공유 리포트 | `rmn_share` 테이블 |

**10장은 반드시 3회로 나눠 실행하세요.** 한 번에 Run 하면 뒤쪽 정책문이 실패할 때 앞의 버킷 생성까지 롤백되어, 성공 메시지를 봐도 버킷이 없는 상태가 됩니다.

### 미실행 시 증상

| 미실행 | 증상 |
|---|---|
| 5장 | 촬영 등록만 실패 |
| 7장 | 타겟APP 탭에 안내 문구만 |
| 8-x | 해당 기능 저장만 실패 |
| 10장 | 이미지 첨부 저장만 실패 |
| 12장 | 광고주 공유 링크 발급만 실패 |

**다른 기능은 영향받지 않습니다.** 실패해도 사이트가 죽지 않게 설계돼 있습니다.

---

## 5. 크론 변경 시 주의 (사고 이력)

**앱 토큰으로 push한 크론 변경은 GitHub이 재등록하지 않습니다.** '26.7.24와 7.27 두 차례 팀즈 브리핑 미발송 사고의 진짜 원인이었습니다.

크론을 바꿔야 하면 **GitHub 웹 UI에서 본인 계정으로 직접 커밋**하세요. 로컬이나 Claude를 통한 push로는 스케줄이 갱신되지 않습니다.

현재 크론 (전부 UTC 기준)

| 워크플로 | 크론 | KST |
|---|---|---|
| `notify.yml` | `0 0 * * 1-5` | 평일 09:00 |
| `notify.yml` 백업 | `25 0 * * 1-5` | 평일 09:25 |
| `ga4-collect.yml` | `40 21 * * *` | 매일 06:40 |
| `sns-collect.yml` | `0 21 * * 0` | 월요일 06:00 |
| `notion-sync.yml` | `17 * * * *` | 매시 17분 |
| `backup.yml` | `43 20 * * 0` | 월요일 05:43 |

수동 실행만 가능한 워크플로

| 워크플로 | 용도 |
|---|---|
| `yt-analytics.yml` | 유튜브 지표 확인, 토큰 교체 후 검증 |
| `localize-youtube.yml` | 유튜브 제목 한글화 |
| `verify.yml` | 테스트와 빌드 |

---

## 6. 미완료 항목

| 항목 | 상태 |
|---|---|
| 저장소 비공개 전환 | 미실행. 3-3 참조 |
| 유튜브 이야호 채널 | 토큰 미등록. `YT_OAUTH_REFRESH_TOKEN_4` 추가하면 붙음 |
| 미러 사이트 | Vercel 프로젝트 생성과 Supabase anon 정책 대기. `data/mirror-setup.md` |
| 월간 리포트 서술 생성 | Vercel 환경변수 `ANTHROPIC_API_KEY` 등록 대기 (setup.md 13장) |
| 월간 리포트 스냅샷 | `data/report-setup.sql` 1회 실행 대기 (setup.md 13장) |
| AI 어시스턴트 | 설계만. 구현 미착수 |
| 정산 계정과목 | 임시 5종. 실목록 대기 |
| 고지물(PMS) 스펙 | 가안 유지. 파트 확인 대기 |
| 앱 구좌, Shopping info 규격 | 아이랩 확인 대기 |

---

## 7. 검증 명령

새 세션이 코드를 고친 뒤 반드시 돌려야 하는 것들입니다.

| 명령 | 내용 |
|---|---|
| `npm run verify` | 파서 테스트, 데이터 가드, 빌드. **필수** |
| `npm run smoke` | 브라우저로 주요 화면 열기 |
| `npm run audit` | 탭 9개 × 폭 4개 전수 훑기 |
| `npm run audit:long` | 위의 확장판 |

---

## 8. 로컬 개발 환경

```bash
npm install
npm run dev
```

로컬 실행에 시크릿은 필요 없습니다. `src/config.js`의 Supabase 키가 저장소에 들어 있어 팀 DB에 그대로 붙습니다.

수집 스크립트를 로컬에서 돌리려면 저장소 루트에 `.env`를 만드세요. `.env`는 `.gitignore`에 있어 커밋되지 않습니다. 필요한 항목은 `.env.example`을 참고하세요.

---

## 9. 배포

`main` 브랜치에 push하면 Vercel이 자동 배포합니다. 별도 명령이 없습니다.

작업 브랜치에서 개발한 뒤 `main`에 머지하는 방식으로 운영해 왔습니다.
