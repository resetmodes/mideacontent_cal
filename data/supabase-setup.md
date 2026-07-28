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

### 8-2. 상품 세부 구성 컬럼 ('26.7 — 카카오톡·인스타그램 상품용, 선택)

카카오톡(타겟팅 여부)·인스타그램(구성·형식) 세부를 저장하려면:

```sql
alter table rmn_bookings add column if not exists option text;
```

- 미실행 시: 기존 상품 7종은 정상. **카카오톡 타겟팅 체크·인스타그램 부킹 저장만** 실패
  (그 외 무영향). 위 한 줄 실행하면 열립니다.

### 8-3. 상품별 이미지 첨부 컬럼 ('26.7 — 집행 화면·결과 캡처, 선택)

캠페인 펼침의 상품 행마다 이미지를 첨부하려면 (버킷은 10장의 event-images 공용 —
10장을 먼저 실행할 것):

```sql
alter table rmn_bookings add column if not exists images jsonb;
```

- **10장 2단계 SQL을 실행했다면 이 컬럼도 이미 포함되어 있음** (아래는 단독 실행용)
- 미실행 시: RMN "이미지" 버튼에서 저장만 실패(안내 문구) — 그 외 무영향
- 파일은 event-images 공개 버킷의 `rmn/{부킹id}/` 경로 — 붙여넣기(Ctrl+V) 업로드 지원

### 8-4. GA 노출·클릭 컬럼 ('26.7 — GA4 자동 수집용)

GA4 파이프라인(ga4-collect.yml)이 매일 부킹에 노출·클릭을 채우려면:

```sql
alter table rmn_bookings add column if not exists impressions bigint;
alter table rmn_bookings add column if not exists clicks bigint;
```

- 미실행 시: GA 수집만 실패(다른 기능 무영향). 실행 후 다음 수집부터 자동 반영

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

## 10. 일정 이미지 첨부 ('26.7 — 결과·시안 보고용)

매체 캘린더 일정 상세 모달에 이미지를 첨부하는 기능(시안·집행 결과 스크린샷 공유).
캘린더를 매체 보고용으로 쓰는 목적이라 **미러(로그인 없는 읽기 전용)에서도 이미지가
보이도록 공개 버킷**을 씁니다 — 일정 자체가 미러 anon SELECT로 공개되는 것과 같은 수준이며,
파일 경로에 일정 UUID + 타임스탬프가 들어가 링크 소지자 외에는 사실상 열람 불가.
업로드·삭제는 로그인 + team_writers 전용.

**버킷은 클릭으로, SQL은 한 번만.** 버킷 생성까지 SQL로 하면 뒤쪽 정책문이 실패할 때
**앞의 버킷 생성까지 함께 롤백**된다 (SQL Editor의 한 Run = 한 트랜잭션 — 성공한 줄 알았는데
버킷이 없는 상태가 됨, '26.7.24 실제 발생). 버킷만 대시보드로 만들면 그 함정이 사라진다.

**1단계 — 버킷 만들기 (클릭)**

1. 좌측 **Storage** → **New bucket**
2. Name: `event-images`
3. **Public bucket 토글 켜기** (미러에서 이미지가 보이려면 필수)
4. **Create**

**2단계 — SQL 1회** (SQL Editor → New query → 붙여넣기 → Run)

```sql
alter table media_events add column if not exists images jsonb;
alter table rmn_bookings add column if not exists images jsonb;

-- 업로드·삭제 = 로그인 계정 전체 ('26.7.27 완화 — team_writers 한정이 팀원 계정을 막던
-- 문제. 계정 발급 자체가 팀 내부 전용이라 로그인 = 팀원. 메타 저장(일정 수정)은 여전히
-- team_writers RLS라 뷰어 계정은 최종 저장 단계에서 차단됨)
drop policy if exists "event-images write" on storage.objects;
create policy "event-images write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-images');

drop policy if exists "event-images delete" on storage.objects;
create policy "event-images delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-images');
```

`must be owner of table objects` 오류가 나면 SQL로는 정책을 못 만드는 프로젝트다 —
Storage → event-images → **Policies** → New policy → INSERT/DELETE 각각
대상 `authenticated`, 조건 `is_team_writer()` 로 생성.

**설치 확인** (Run — 3행이 모두 true면 완료):

```sql
select 'images 컬럼' as 항목,
       exists(select 1 from information_schema.columns
              where table_name='media_events' and column_name='images') as ok
union all
select '버킷', exists(select 1 from storage.buckets where id='event-images')
union all
select '쓰기 정책', exists(select 1 from pg_policies
       where tablename='objects' and policyname='event-images write');
```

- 실행 전까지: 일정 상세의 "＋ 이미지 첨부" 저장만 실패(안내 문구) — 기존 기능 무영향
- 업로드 시 브라우저 자동 압축(긴 변 1600px JPEG) — 폰 사진 3~5MB → ~300KB.
  일정당 최대 5장, 파일당 상한 10MB. 무료 플랜 Storage 1GB ≈ 3,000장 이상
- 일정을 삭제해도 실파일은 남습니다(어드민 "삭제 복원"이 이미지까지 살리기 위함) —
  이미지 개별 × 버튼으로 지울 때만 실파일 삭제. 대량 정리는 Storage 대시보드에서

## 11. 노션 캘린더 동기화 ('26.7 — 인스타 전용, 단방향)

대행사 공용 "업무 요청 현황" DB를 매체 캘린더로 끌어옵니다 (매시 자동,
`.github/workflows/notion-sync.yml`). 전 행이 인스타 일정 — "업로드 일정" 날짜는
매체 캘린더로, "촬영 일정" 날짜는 촬영일정 탭으로 (한 행 = 최대 2건). 날짜 없는 행은
날짜가 생기면 자동으로 들어옴. 노션에서 지운 일정은 자동 삭제하지 않고 규빈 계정
검토 배너에서 [삭제/유지]로 결정.

### 11-1. SQL 1회 (컬럼 2개)

```sql
alter table media_events add column if not exists notion_id text;
alter table media_events add column if not exists notion_gone boolean default false;
create unique index if not exists media_events_notion_id
  on media_events (notion_id) where notion_id is not null;
```

### 11-2. 노션 통합 만들기 + DB 연결 (각 2분)

1. notion.so/my-integrations → **New integration** → 이름 `media-cal-sync`
   → 대행사 공용 워크스페이스 선택 → 만들기 → **Internal Integration Secret 복사**
2. 노션에서 대상 캘린더 DB 열기 → 우측 상단 **⋯** → **연결(Connections)** →
   `media-cal-sync` 선택 — **이 DB 하나만** 연결 (통합은 연결된 페이지만 읽을 수 있음)

### 11-3. GitHub Secret 등록

github.com/resetmodes/mideacontent_cal → Settings → Secrets and variables → Actions:
- `NOTION_TOKEN` = 11-2의 시크릿
- (통합에 DB를 2개 이상 연결한 경우만) `NOTION_DB` = 대상 DB ID

### 11-4. 크론 활성화 — GitHub 웹에서 본인 커밋 1회 (필수)

앱 토큰 push로는 스케줄이 등록되지 않으므로 (notify.yml 사고와 동일),
웹에서 `.github/workflows/notion-sync.yml` 열어 주석 한 글자 수정 → main 직접 커밋.
즉시 1회 실행은 Actions → "노션 캘린더 동기화" → Run workflow.

- 동기화 규칙: 제목·기간만 갱신 — 우리 쪽에서 붙인 캠페인 변경·메모·이미지는 보존.
  노션발 일정은 작성자 "노션" + 메모에 원본 페이지 링크
- 미실행 시: 아무 영향 없음 (기존 캘린더 그대로)

### 8-5. GA 일별 실적 테이블 ('26.7 — 결과보고서 자동 생성용)

캠페인 결과보고서(부쉐론 양식 xlsx)의 일자별 노출·클릭을 채우려면:

```sql
create table if not exists rmn_ga_daily (
  id bigserial primary key,
  advertiser text not null,
  slot text not null,
  date date not null,
  impressions bigint default 0,
  clicks bigint default 0,
  unique (advertiser, slot, date)
);
alter table rmn_ga_daily enable row level security;
create policy "ga_daily_read" on rmn_ga_daily
  for select to authenticated using (true);
```

- 쓰기는 GA 수집 워크플로(service key — RLS 우회)만, 읽기는 로그인 계정
- 미실행 시: 부킹 합계(노출·클릭)는 정상, **결과보고서 다운로드만** 데이터 없음으로 실패
