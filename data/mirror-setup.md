# 미러 전용 사이트 설정 — 로그인 없는 읽기 전용 공유 사이트

같은 리포에서 환경변수(`VITE_MIRROR=1`) 하나로 갈라지는 **별도 Vercel 프로젝트**입니다.
본 사이트 기능이 업데이트되면 미러도 자동으로 같이 배포됩니다 (코드 복사 없음).

- 구성: 매체 캘린더(읽기 전용) + 매체 스펙 — SNS 모니터링·등록·수정 UI 없음
- 로그인 없음 — 링크만 있으면 타 팀 누구나 열람

---

## 1장. Vercel 두 번째 프로젝트 만들기 (5분)

1. https://vercel.com 접속 → 로그인
2. 우측 상단 **Add New…** → **Project** 클릭
3. Import Git Repository 목록에서 **mideacontent_cal** 옆 **Import** 클릭
   (기존 프로젝트와 같은 리포를 한 번 더 임포트하는 것 — 정상입니다)
4. **Project Name**을 `mediacontent-cal-mirror` 로 변경
5. Framework Preset이 **Vite**인지 확인 (자동 감지됨)
6. **Environment Variables** 섹션 펼치기 →
   - Key: `VITE_MIRROR`
   - Value: `1`
   - **Add** 클릭
7. **Deploy** 클릭 → 1~2분 후 완료
8. 완료 화면의 도메인(예: `mediacontent-cal-mirror.vercel.app`)이 미러 사이트 주소입니다
   - 주소 변경: 프로젝트 → **Settings** → **Domains** 에서 수정

> 이후에는 아무것도 안 해도 됩니다 — main에 push될 때마다 본 사이트·미러 둘 다 자동 재배포.

## 2장. Supabase — 캘린더 읽기 공개 정책 (2분)

미러는 로그인이 없어서, 캘린더 일정을 읽으려면 **비로그인(anon) 읽기 허용** 정책이 필요합니다.
이 정책을 넣기 전까지 미러의 캘린더는 **비어 보이는 게 정상**입니다 (스펙 탭은 바로 동작).

1. https://supabase.com/dashboard 접속 → 프로젝트 선택
2. 왼쪽 메뉴 **SQL Editor** 클릭 → **New query**
3. 아래 한 줄 붙여넣기 → **Run** 클릭

```sql
create policy "mirror_anon_read" on media_events for select to anon using (true);
```

- **읽기만** 열립니다 — 등록·수정·삭제는 기존 정책(team_writers)이 그대로 막습니다
- 되돌리기(미러 폐쇄 시): `drop policy "mirror_anon_read" on media_events;`

## 3장. 보안 유의사항 (읽고 결정)

- 이 정책을 적용하면 **미러 주소를 아는 사람은 로그인 없이 누구나** 팀 일정을 볼 수 있습니다.
  사내 공유 전제의 설계입니다 — 외부(대행사·지점)에는 미러 대신 기존
  `?view=external`(스펙만) 링크를 주세요
- 미러 주소가 외부에 퍼졌다고 판단되면: 2장 되돌리기 SQL 실행(캘린더만 차단됨) 후
  Vercel Settings → Domains 에서 주소 변경
