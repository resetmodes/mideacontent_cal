# 알림센터 설계서 — "지난 방문 이후 변경된 일정 N건"

> 상태: **구현 완료 ('26.7)** — `src/NotifyCenter.jsx`, App.jsx 탭 바 우측.
> 목 응답 E2E로 5시나리오 검증(배지·본인 제외·열람=확인·소진·첫 방문 0건).
> 전제: 변경 이력 SQL(supabase-setup.md 6장) 적용 — 미적용이면 알림센터는 자동 숨김.
> 남은 것: 행 클릭→일정 모달 딥링크(2차, 아래 3장), SQL 적용 후 실사이트 검증(6장 시나리오).

## 1. 목적

팀즈 발송 없이(보안 제약) 팀 동기화: 로그인하면 **남이 바꾼 일정**이 몇 건인지 보이고,
펼치면 누가·언제·무엇을 등록/수정/삭제했는지 확인.

## 2. 확정된 설계 결정 (구현 시 임의 변경 금지)

| 결정 | 내용 | 이유 |
|---|---|---|
| 데이터 원천 | `media_events_history` (listChangesSince) | 트리거 기록 = 조작 불가·추가 스키마 없음 |
| 마지막 확인 시점 | **localStorage** `media-cal-notify-seen` (ISO) | 기기별 관리로 충분, DB 테이블 추가 없이. 기기 바뀌면 첫 1회 0건 초기화 |
| 첫 방문(키 없음) | **지금 시각으로 조용히 초기화, 배지 0** | 전체 이력을 새 소식으로 쏟아내지 않기 |
| "확인됨" 시점 | **패널을 열 때** seen=now 갱신 (열람=확인) | 별도 버튼 없이 자연스러운 소진 |
| 본인 변경 | **제외** (`actor !== 로그인 이메일`, 소문자 비교) | 내가 한 걸 나에게 알릴 필요 없음 |
| 촬영 건 | **포함**, 항목에 "촬영" 표기 | 촬영탭 변경도 팀이 알아야 함 |
| 갱신 주기 | 마운트 + window focus (폴링 없음) | 기존 refresh 패턴과 동일, 서버 부담 0 |
| 상한 | 최근 50건, 다 차면 "50+" 표기 | 그 이상은 각 일정의 변경 이력에서 |
| 실패/미설정 | **통째 숨김** (에러 배너 금지) | 이력 테이블 미적용 환경 배려 — 기존 원칙 |
| 노출 조건 | REMOTE 모드 + 로그인 세션 + 미러/외부 아님 | 미러는 anon이라 이력 접근 불가(빈 배열) |

## 3. UI 명세 (디자인 규칙 준수)

- **위치**: `App.jsx` 탭 바 우측 `tabs-session` 영역, 이메일 왼쪽에 텍스트 버튼
  - N>0: `새 변경 3` — 현대그린, font-weight 700 (형광·빨강·pill 금지)
  - N=0: 버튼 자체 숨김 (뱃지 0 노출 안 함 — 조용한 기본)
- **클릭 → 패널**: 기존 `.modal` 재사용 (새 컴포넌트 NotifyPanel)
  - 제목: "지난 확인 이후 변경" + 부제(마지막 확인 시각 `fmtTs`)
  - 행 형식 (변경 이력 UI와 동일 문법 재사용 — `md-hist-row` 계열):
    `7.8 09:12 · 하지훈 책임 · 등록 — 7/15 여름 룩북 (인스타)` /
    수정이면 바뀐 필드 diff 한 줄 (CalendarPage의 `histDiff` 재사용 — export 필요) /
    삭제는 삭제된 제목·날짜
  - 촬영 건은 제목 앞 `[촬영]`
  - 패널 열리는 순간 seen=now → 닫으면 버튼 사라짐
- **행 클릭 → 해당 일정 모달**: event_id가 현재 events에 있으면 열기 (삭제분은 클릭 불가,
  회색). App→CalendarPage로 "이 일정 열어줘" 전달 필요 — `openEventId` prop 패턴
  (specFocus와 동일한 {id, seq} 방식)

## 4. 데이터 계층 (구현 완료 — store.js)

```js
listChangesSince(iso, excludeEmail) → [{ id, event_id, action, actor, changed_at, data }]
```
- REMOTE 아니면 `[]`. `changed_at=gt.{iso}` + `order=changed_at.desc` + `limit=50`
- actor 제외는 **클라이언트에서** (excludeEmail 소문자 비교) — PostgREST neq는
  대소문자 구분이라 서버 필터에 맡기지 않는다

## 5. 구현 체크리스트 (저가 모델용 — add-feature 스킬 절차로)

1. CalendarPage의 `histDiff`·`fmtTs`·`ACTION_KO`를 export (이동 금지, export만 추가)
2. `src/NotifyCenter.jsx` 생성: 버튼+패널 (위 명세 그대로)
3. App.jsx: 세션 있을 때 `<NotifyCenter session={session} />`를 tabs-session에 삽입
4. 행 클릭→일정 열기는 **2단계로 나눠도 됨** (1차: 패널 목록만, 2차: 딥링크) —
   1차 배포 후 사용자 피드백 받고 진행
5. `npm run verify` + `npm run smoke` (버튼은 로컬 모드에서 숨겨지는 것 확인)
6. CLAUDE.md 기능 한 줄 + 이 문서 상태를 "구현됨"으로

## 6. 검증 시나리오 (구현 후 실사이트)

- 계정 A로 일정 등록 → 계정 B 브라우저 focus → "새 변경 1" 표시
- B가 패널 열면 A의 등록 내역 → 닫으면 버튼 사라짐 → A가 또 수정 → 다시 "새 변경 1"
- B 본인이 등록 → B에게는 안 뜸
- 이력 SQL 미적용 프로젝트에서는 버튼 자체가 안 보임
