# 운영 런북 — 문제가 생겼을 때 (규빈용, 클릭 수준)

> AI 없이 직접 대응하는 문서. 각 증상에서 위에서부터 순서대로 확인.
> 더 깊은 문제면 AI 세션(fix-incident 스킬)으로 — 이 문서의 진단 결과를 알려주면 빠릅니다.

## 1. 사이트가 안 열린다

1. 다른 기기/네트워크(휴대폰 LTE)로 열어본다 → 열리면 사내망/기기 문제
2. https://vercel.com → 프로젝트 → **Deployments**: 최신 배포가 Error(빨강)면
   그 배포 클릭 → 로그 확인 → 직전 Ready 배포의 **⋯ → Promote to Production** (즉시 롤백)
3. GitHub → Actions → "검증" 워크플로우가 빨간색이면 마지막 커밋이 문제 —
   AI 세션에 "main 마지막 커밋이 검증 실패, 원인 봐줘"

## 2. 로그인이 안 된다

1. 이메일 오타·대소문자 확인 (비밀번호 5회 이상 틀리면 잠시 후 재시도)
2. 비밀번호 재설정: Supabase 대시보드 → **Authentication → Users** → 해당 계정
   **⋯ → Reset password** (또는 삭제 후 재발급 — Auto Confirm 체크)
3. 전원이 로그인 불가면 Supabase 프로젝트 상태 확인 (대시보드 접속 여부)

## 3. 일정이 안 보인다

1. **필터 확인** — 매체 필터가 특정 매체로 걸려 있지 않은지, 검색어가 남아 있지 않은지
2. 월간 뷰에서 해당 월로 이동했는지 (기간 일정은 **시작일**에 표시, 종료일엔 "· 종료"만)
3. 촬영 건은 **촬영일정 탭**에만 있음 (매체 캘린더엔 안 보이는 게 정상)
4. 미러 사이트 캘린더가 비어 보이면 → anon 읽기 정책 미적용이 원인 (mirror-setup.md 2장 SQL)

## 4. 등록·수정이 안 된다

| 증상 | 원인 | 조치 |
|---|---|---|
| "읽기 전용 계정" 에러 | team_writers 미등록 | Supabase SQL: `insert into team_writers (email) values ('이메일');` |
| 촬영 등록만 실패 | kind 컬럼 미적용 | supabase-setup.md **5장 SQL** 실행 |
| 실적 "선택"만 실패 | perf_url 컬럼 미적용 | 같은 5장 SQL |
| "세션 만료" | 오래 방치 | 로그아웃 → 재로그인 |

## 5. 실수로 일정을 지웠다 / 누가 지웠는지 모르겠다

1. 캘린더 하단 **"최근 30일 삭제 기록"** 펼치기 — 누가·언제·무엇을 지웠는지 확인
2. 내용 확인 후 **빠른 입력으로 재등록** (한 건이면 이게 제일 빠름)
3. 대량 소실이면: GitHub → `data/backup/media-events.json` → **History** → 사고 전 시점
   파일 열기 → AI 세션에 "이 백업 시점으로 일정 복원해줘" (PLAYBOOK 4-2 절차)

## 6. SNS 수집이 실패했다 / 모니터링 데이터가 이상하다

1. **재실행부터 누르지 말 것** — 실행마다 과금(~$1.7), 한도 초과 상태면 눌러도 또 실패
2. GitHub → Actions → "SNS 데이터 수집" → 실패한 run → 로그에서 확인:
   - `Monthly usage hard limit exceeded` → **Apify 월 한도 소진.** 리셋(결제 주기)까지 대기,
     격주 스케줄이 리셋 후 자동 정상화. 조치 불필요
   - `APIFY_TOKEN` 관련 에러 → Apify 콘솔에서 토큰 재발급 → GitHub → Settings →
     Secrets → APIFY_TOKEN 교체
   - push 단계만 실패 → 데이터만 저장 안 된 것. 다음 정기 수집이 해결 (재실행 = 재과금)
3. 계정이 사라져 보여도 **carry-forward 가드가 있어 실제로는 이전 값으로 유지**됩니다.
   그래도 사라졌다면 AI 세션(fix-incident)으로

## 7. 링크가 외부에 유출된 것 같다

**미러 주소 유출 (내부용인데 외부로 퍼짐)**
1. Supabase SQL Editor: `drop policy "mirror_anon_read" on media_events;` → 미러 캘린더
   즉시 차단 (스펙은 계속 보임 — 스펙은 외부 공유 가능 정보라 무방)
2. Vercel 미러 프로젝트 → Settings → Domains → 도메인 변경 → 새 주소를 사내에만 재공유
3. `src/config.js`의 MIRROR_URL을 새 도메인으로 수정 (AI 세션에 맡겨도 됨)
4. 정책 복구: mirror-setup.md 2장 SQL 재실행

**팀 계정 유출 (비밀번호 노출 의심)**
1. Supabase → Authentication → Users → 해당 계정 Reset password (또는 삭제)
2. 그 계정이 team_writers에 있으면 일정 변조 가능성 → 캘린더 하단 삭제 기록 +
   변경 이력으로 이상 변경 확인 → 필요 시 백업 복원(5번)

**외부용 개별 스펙 링크** — 유출돼도 위험 낮음 (담당자명·지표·캘린더 없음, 원래 외부 전달용)

## 8. 화면이 이상하다 (기능이 갑자기 다르게 동작)

1. 강력 새로고침: Mac `Cmd+Shift+R` / Windows `Ctrl+Shift+R` (구버전 캐시 문제)
2. 최근 배포와 겹치면: Vercel → Deployments → 직전 배포로 Promote (1번-2 절차)
3. 재현되면 AI 세션에 증상 + 언제부터인지 전달

## 연락 우선순위

기능 문의·복구 → AI 세션 (이 리포에서 열면 PLAYBOOK·스킬이 자동 적용됨)
Supabase/Vercel/Apify 계정 문제 → 규빈 (각 서비스 대시보드 권한 보유자)
