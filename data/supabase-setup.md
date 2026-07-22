# Supabase 연동 설정 — 매체 캘린더 팀 공유 DB

캘린더 일정을 팀 전체가 공유하려면 아래 순서대로 진행. 소요 시간 약 5분.
연동 전까지는 각자 브라우저(localStorage)에만 저장됨.

## 1. Supabase 계정·프로젝트 만들기

1. https://supabase.com 접속 → 우상단 **Start your project** 클릭
2. GitHub 계정으로 로그인 (없으면 이메일 가입)
3. **New project** 클릭
4. 입력값:
   - Name: `media-calendar`
   - Database Password: 아무 비밀번호 (기록해 둘 것 — 이후엔 쓸 일 거의 없음)
   - Region: `Northeast Asia (Seoul)`
5. **Create new project** 클릭 → 1~2분 대기

## 2. 일정 테이블 만들기

1. 왼쪽 메뉴에서 **SQL Editor** 클릭
2. 아래 SQL 전체를 복사해 붙여넣기:

```sql
create table media_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  end_date date,
  channel text not null,
  sub text,
  campaign text,
  owner text,
  memo text,
  created_at timestamptz default now()
);

alter table media_events enable row level security;

create policy "team full access" on media_events
  for all using (true) with check (true);
```

3. 우하단 **Run** 클릭 → "Success. No rows returned" 확인

## 3. 키 2개 복사해서 코드에 붙여넣기

1. 왼쪽 메뉴 **Project Settings** (톱니바퀴) → **API** 클릭
2. 복사할 값 2개:
   - **Project URL** (예: `https://abcdefgh.supabase.co`)
   - **anon public** 키 (긴 문자열)
3. 이 프로젝트의 `src/config.js` 파일을 열어 두 값을 붙여넣기:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGci...(복사한 anon 키)'
```

4. 저장 → git push (Vercel 자동 배포) → 완료

## 확인 방법

- 캘린더 탭 상단의 "이 브라우저에만 저장 중" 안내가 사라지면 연동 성공
- 한 명이 일정을 등록하고 다른 사람 브라우저에서 새로고침하면 같이 보임

## 4. 로그인 활성화 (팀 계정으로만 접근)

3단계까지만 하면 anon 키만 알면 누구나 읽고 쓸 수 있는 퍼블릭 상태. 팀 계정 로그인을
켜려면 아래 진행. 소요 시간 약 5분.

### 4-1. 접근 정책 — 읽기는 로그인 필수, 쓰기는 등록된 팀원만

구조: 모든 조회는 로그인 필수 (URL을 알아도 로그인 없이는 아무것도 못 봄).
등록·수정·삭제는 `team_writers` 테이블에 이메일이 등록된 팀원 계정만 가능.
타 팀 공유는 **뷰어 계정**(team_writers 미등록 계정) 하나를 만들어 전달 —
그 계정으로는 `?view=mirror` 페이지에서 조회만 됨.

**SQL Editor**에서 새 쿼리 열고 아래 전체 실행 (이전에 어떤 정책을 만들었든 안전):

```sql
drop policy if exists "team full access" on media_events;
drop policy if exists "authenticated team access" on media_events;
drop policy if exists "read for all" on media_events;
drop policy if exists "insert for team" on media_events;
drop policy if exists "update for team" on media_events;
drop policy if exists "delete for team" on media_events;

create table if not exists team_writers (email text primary key);
alter table team_writers enable row level security;

create or replace function is_team_writer()
returns boolean language sql security definer stable as $$
  select exists (select 1 from team_writers where email = auth.jwt()->>'email');
$$;

create policy "read for signed-in" on media_events
  for select using (auth.uid() is not null);

create policy "insert for writers" on media_events
  for insert with check (is_team_writer());

create policy "update for writers" on media_events
  for update using (is_team_writer()) with check (is_team_writer());

create policy "delete for writers" on media_events
  for delete using (is_team_writer());
```

### 4-1-b. 쓰기 권한 팀원 등록

우리 팀원(등록·수정 가능해야 하는 사람)의 이메일을 등록. **SQL Editor**에서:

```sql
insert into team_writers (email) values
  ('kyuvin@thehyundai.com'),
  ('팀원2@thehyundai.com'),
  ('팀원3@thehyundai.com')
on conflict do nothing;
```

- 뷰어 계정(타 팀 공유용)은 여기에 **넣지 않으면** 자동으로 읽기 전용이 됨
- 팀원 추가 시 위 SQL에 이메일 한 줄 추가해 재실행

### 4-2. 계정 만들기 (직접 발급 — 자율 가입 아님)

1. 왼쪽 메뉴 **Authentication** → **Users** → 우상단 **Add user** → **Create new user**
2. Email·Password 입력, **Auto Confirm User** 체크 (이메일 인증 절차 생략) → **Create user**
3. 팀원 수만큼 반복. 비밀번호는 개인별로 다르게 설정해 직접 전달
4. **뷰어 계정도 여기서 하나 생성** (예: viewer@thehyundai.com) — 4-1-b에 등록하지 않으면
   자동으로 읽기 전용. 이 계정과 `?view=mirror` 링크를 타 팀에 전달

### 4-3. 자율 가입 막기 (필수 — 안 하면 아무나 계정 생성 가능)

1. **Authentication** → **Providers** → **Email** 클릭
2. **Allow new users to sign up** 토글 **OFF**
3. **Save**

### 4-4. 확인

- 사이트 캘린더 탭 접속 시 로그인 화면이 뜸
- 4-2에서 만든 이메일·비밀번호로 로그인 → 정상 진입
- 상단에 "OO@OO.com 로 로그인됨 · 로그아웃" 표시
- 로그인은 브라우저에 유지됨(자동 갱신) — 로그아웃 버튼을 누르기 전까지 재로그인 불필요
- `?view=mirror` 링크: 뷰어 계정 로그인 후 조회만 가능한지 확인 (등록·수정·삭제 버튼 없음)
- 뷰어 계정으로 일반 캘린더 주소에 들어가도 등록 시도 시 "읽기 전용 계정" 에러로 차단됨 (RLS)

## 참고

- anon 키는 클라이언트 공개용으로 설계된 키 — 코드에 넣어도 됨.
  단, 4장(로그인 활성화)을 하기 전까지는 사이트 주소를 아는 사람은 누구나 일정을
  읽고 쓸 수 있으니 외부 공유 시에는 반드시 `?view=external` 링크만 전달
  (캘린더 탭 자체가 숨겨짐)
- 로그인 세션은 브라우저에 저장되고 자동 갱신됨 — 매번 재로그인할 필요 없음
- 팀원 추가·삭제, 비밀번호 재설정은 모두 **Authentication → Users**에서 관리
- localStorage에 쌓아둔 일정은 자동 이전되지 않음 — 연동 전 테스트 데이터는 다시 입력

## 5장. 신규 컬럼 추가 — '26.7 기능 업데이트 (필수 2줄)

촬영일정 탭(`kind`)과 실적 확정(`perf_url`)이 쓰는 컬럼입니다. SQL Editor에서 실행:

```sql
alter table media_events add column if not exists kind text;
alter table media_events add column if not exists perf_url text;
```

- 실행 전까지: **촬영일정 등록·실적 확정만** 서버 오류로 실패 (기존 일반 일정 기능은 영향 없음)
- 실행 후: 촬영일정 탭 등록 + 일정 모달의 "집행 실적 후보 → 선택(확정)" 정상 동작

## 6장. 변경 이력 — '26.7 기능 업데이트

일정 등록·수정·삭제를 DB가 자동 기록합니다 (누가·언제·무엇을).
일정 모달의 "변경 이력"과 캘린더 하단 "최근 30일 삭제 기록"이 이 데이터를 읽습니다.

SQL Editor에서 아래 전체를 한 번에 실행:

```sql
create table media_events_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  action text not null,              -- INSERT / UPDATE / DELETE
  actor text,                        -- 로그인 이메일 (자동)
  changed_at timestamptz default now(),
  data jsonb                         -- 변경 후 스냅샷 (삭제 시엔 삭제 직전 값)
);

alter table media_events_history enable row level security;

create policy "history_read" on media_events_history
  for select to authenticated using (true);

create or replace function log_media_event_change()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    insert into media_events_history (event_id, action, actor, data)
    values (old.id, tg_op, auth.jwt()->>'email', to_jsonb(old));
    return old;
  end if;
  insert into media_events_history (event_id, action, actor, data)
  values (new.id, tg_op, auth.jwt()->>'email', to_jsonb(new));
  return new;
end $$;

create trigger media_events_audit
after insert or update or delete on media_events
for each row execute function log_media_event_change();
```

- 실행 전까지: 이력 버튼 클릭 시 "이력 테이블 미설정" 안내만 뜸 (다른 기능 무영향)
- 이력은 활성화 **이후** 변경분부터 기록됨 (소급 불가)
- 트리거가 서버에서 기록하므로 클라이언트에서 조작 불가 — 감사 기록으로 신뢰 가능
- 읽기는 로그인 계정만 가능 (미러 사이트의 비로그인 조회로는 이력 접근 불가)

## 7. 타겟APP 실적 모니터링 (선택 — '26.7)

SNS 모니터링 탭의 "타겟APP" 세그먼트용 테이블. **팀 내부 전용** — 실적 수치를
코드(번들)에 싣지 않고 DB에만 두는 구조라, 이 SQL을 실행해야 화면이 채워집니다.

1. Supabase 대시보드 → 왼쪽 **SQL Editor** → **New query**
2. 리포의 `data/targetapp-seed.sql` 파일 내용을 **전체 복사**해서 붙여넣기
3. **Run** 클릭 (1회) — 테이블 2개 생성 + '26.1~4월 이관분(캠페인 50건·매체 누적 10종) 입력

- 읽기: 로그인 계정만 (anon 정책 없음 → 미러 사이트·외부에서는 접근 자체가 불가)
- 쓰기: team_writers 등록 계정만 (4장과 동일 체계)
- 실행 전까지: 세그먼트에 안내 문구만 뜨고 다른 기능 무영향
- 신규 실적 입력: 매월 초 전월 캠페인 단위 — 입력 폼은 어드민 페이지(2차)에서 제공 예정.
  그전에는 Table Editor → targetapp_stats → Insert row로 직접 입력 가능
  (year·month·office·name·period·media(배열)·exp·clk·vis·inst, note는 선택)

### 7-1. 예산·비용 컬럼 추가 ('26.7 실적 대장 업로드용 — 선택이지만 권장)

실적 대장 엑셀에는 매체별 예산·비용이 있어, 이 SQL을 1회 실행하면 업로드 시 함께 저장됩니다
(미실행 시 비용 있는 행 업로드가 실패할 수 있음 — 실행 권장):

```sql
alter table targetapp_stats add column if not exists budget bigint default 0;
alter table targetapp_stats add column if not exists cost bigint default 0;
```

## 8. RMN (APP 광고 판매) 부킹 관리 ('26.7)

"RMN" 탭용 테이블. 광고주·단가·수수료 정보라 **팀 내부 전용** (미러·번들 미노출).

1. Supabase 대시보드 → **SQL Editor** → **New query**
2. 리포의 `data/rmn-setup.sql` 내용 전체 복사 → 붙여넣기 → **Run** (1회)

- 읽기: 로그인 계정 전원 / 쓰기: team_writers 등록 계정
- 실행 전까지: RMN 탭에 안내 문구만 뜨고 다른 기능 무영향
- GA4 노출·클릭 자동 연동(3차)은 별도 — 이 테이블의 부킹 기간·구좌가 연동 기준이 됨

### 8-1. 상품 수량 컬럼 추가 ('26.7 — 같은 상품 N개 구매용, 선택)

같은 캠페인에서 같은 상품을 여러 개 사는 경우(예: 팝업배너 3개)를 한 행으로 저장하려면:

```sql
alter table rmn_bookings add column if not exists qty int default 1;
```

- 미실행 시: 수량 1개짜리 부킹은 정상 동작. **수량 2개 이상으로 등록할 때만** 저장이
  막힙니다(그 외 기존 기능 무영향). 위 한 줄 실행하면 수량 판매가 열립니다.

## 9. 정산 탭 ('26.7 테스트 — 노규빈·박준영·한은비 3인)

"정산" 탭용 테이블 + 증빙 파일 저장소(Storage). 금액·증빙 정보라 **팀 내부 전용**
(미러·번들 미노출). 탭 노출은 config.js `SETTLE_EMAILS` 3인 게이트.

1. Supabase 대시보드 → **SQL Editor** → **New query**
2. 리포의 `data/settle-setup.sql` 내용 전체 복사 → 붙여넣기 → **Run** (1회)
   - settlements 테이블 + `settle-docs` 비공개 Storage 버킷 + 정책이 한 번에 생성됨

- 읽기: 로그인 계정 전원 / 쓰기: team_writers 등록 계정
- 실행 전까지: 정산 탭에 안내 문구만 뜨고 다른 기능 무영향
- 증빙 이미지는 업로드 시 브라우저에서 자동 압축(긴 변 1600px JPEG) — 폰 사진 3~5MB가
  ~300KB로 저장돼 무료 플랜 Storage 1GB로 장기간 운영 가능. 파일당 상한 10MB
- 용량 관리: 회기 마감 후 "증빙 일괄 다운로드"(ZIP, 월별/건별 폴더)로 백업 → 지난 회기
  건 삭제 권장. 그래도 1GB에 근접하면 Supabase Pro($25/월, 100GB) 검토
