-- 내 일정 탭 ('26.8) — 개인 투두와 개인 일정
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (1회, setup.md 15장)
-- 미실행 시 내 일정 탭이 안내 문구만 표시 (다른 기능 무영향)
--
-- ★ 개인 데이터는 media_events에 절대 넣지 않는다
--   미러 사이트를 열면 media_events에 "로그인 없이 누구나 읽기" 정책이 걸린다
--   (data/mirror-setup.md). 그 정책은 테이블 전체에 적용되므로 개인 메모가 무로그인으로
--   읽히게 된다. 그래서 별도 테이블로 물리적으로 분리한다.
--
-- ★ 이 저장소에서 처음 쓰는 권한 방식
--   기존 테이블은 전부 "로그인하면 다 보임"이지만, 여기는 본인과 공유 대상만 본다.
--   읽기  = 본인이거나 shared_with에 내 이메일이 있을 때
--   수정  = 본인, 또는 공유 대상이면서 shared_edit이 켜져 있을 때
--   생성과 삭제 = 본인만

-- ── 스페이스 (각자 자유 생성) ──
create table if not exists my_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  name text not null,
  color text not null default '#0B4336',
  sort int default 0,
  created_at timestamptz default now()
);
alter table my_spaces enable row level security;
drop policy if exists "spaces own" on my_spaces;
create policy "spaces own" on my_spaces for all to authenticated
  using (owner_email = auth.jwt()->>'email')
  with check (owner_email = auth.jwt()->>'email');

-- ── 투두 ──
create table if not exists my_todos (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  txt text not null,
  space_id uuid references my_spaces(id) on delete set null,
  done boolean default false,
  shared_with text[] default '{}',      -- 공유 대상 이메일
  shared_edit boolean default false,    -- 공유 대상도 완료 처리 가능
  memo text,                            -- 상세 메모
  images jsonb,                         -- 첨부 메타 [{name, path, size}]
  sort int default 0,
  created_at timestamptz default now()
);
-- 이미 앞 버전을 실행한 뒤라면 아래 두 줄이 컬럼을 채운다 (재실행 안전)
alter table my_todos add column if not exists memo text;
alter table my_todos add column if not exists images jsonb;
alter table my_todos enable row level security;
drop policy if exists "todos read" on my_todos;
create policy "todos read" on my_todos for select to authenticated
  using (owner_email = auth.jwt()->>'email' or auth.jwt()->>'email' = any(shared_with));
drop policy if exists "todos insert" on my_todos;
create policy "todos insert" on my_todos for insert to authenticated
  with check (owner_email = auth.jwt()->>'email');
drop policy if exists "todos update" on my_todos;
create policy "todos update" on my_todos for update to authenticated
  using (owner_email = auth.jwt()->>'email'
         or (shared_edit and auth.jwt()->>'email' = any(shared_with)));
drop policy if exists "todos delete" on my_todos;
create policy "todos delete" on my_todos for delete to authenticated
  using (owner_email = auth.jwt()->>'email');

-- ── 개인 일정 ──
-- linked_id = 팀 캘린더에도 등록했을 때 media_events의 id (연동 해제 시 그 행만 지운다)
create table if not exists my_events (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title text not null,
  on_date date not null,
  at_time text,                         -- 'HH:MM', 비우면 종일
  dur_min int default 60,
  space_id uuid references my_spaces(id) on delete set null,
  linked_id uuid,                       -- media_events.id (팀 캘린더 연동분)
  shared_with text[] default '{}',
  shared_edit boolean default false,
  memo text,
  images jsonb,                         -- 할 일에서 넘어온 첨부도 그대로 유지된다
  created_at timestamptz default now()
);
alter table my_events add column if not exists images jsonb;
alter table my_events enable row level security;
drop policy if exists "myev read" on my_events;
create policy "myev read" on my_events for select to authenticated
  using (owner_email = auth.jwt()->>'email' or auth.jwt()->>'email' = any(shared_with));
drop policy if exists "myev insert" on my_events;
create policy "myev insert" on my_events for insert to authenticated
  with check (owner_email = auth.jwt()->>'email');
drop policy if exists "myev update" on my_events;
create policy "myev update" on my_events for update to authenticated
  using (owner_email = auth.jwt()->>'email'
         or (shared_edit and auth.jwt()->>'email' = any(shared_with)));
drop policy if exists "myev delete" on my_events;
create policy "myev delete" on my_events for delete to authenticated
  using (owner_email = auth.jwt()->>'email');

create index if not exists my_events_owner_date on my_events (owner_email, on_date);
create index if not exists my_todos_owner on my_todos (owner_email);

-- ── 첨부 이미지 버킷 (비공개) ──
-- event-images(공개)와 달리 비공개다. 개인 할 일의 첨부라 링크만 알면 열리는 수준도 안 된다.
-- 경로 첫 칸이 소유자 폴더라, 로그인해도 남의 폴더는 정책에서 막힌다.
-- 폴더 이름은 이메일의 @ 와 . 을 _ 로 바꾼 값 (Storage 키 안전 문자만 쓰려는 것) —
-- 클라이언트(src/lib/myTaskImages.js)의 folderOf와 반드시 같은 규칙이어야 한다.
insert into storage.buckets (id, name, public) values ('mytask-img', 'mytask-img', false)
  on conflict (id) do nothing;

drop policy if exists "mytask img insert" on storage.objects;
create policy "mytask img insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'mytask-img'
    and (storage.foldername(name))[1] = replace(replace(auth.jwt()->>'email', '@', '_'), '.', '_'));
drop policy if exists "mytask img read" on storage.objects;
create policy "mytask img read" on storage.objects for select to authenticated
  using (bucket_id = 'mytask-img'
    and (storage.foldername(name))[1] = replace(replace(auth.jwt()->>'email', '@', '_'), '.', '_'));
drop policy if exists "mytask img delete" on storage.objects;
create policy "mytask img delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mytask-img'
    and (storage.foldername(name))[1] = replace(replace(auth.jwt()->>'email', '@', '_'), '.', '_'));
