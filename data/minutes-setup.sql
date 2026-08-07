-- 회의록 ('26.8) — 브라우저 녹음, 전사, 요약
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (1회, setup.md 16장)
-- 미실행 시 회의록 탭이 안내 문구만 표시 (다른 기능 무영향)
-- 재실행해도 안전합니다 (컬럼은 if not exists, 정책은 지우고 다시 만듭니다)
--
-- ★ 회의 내용은 개인 데이터와 같은 급으로 다룬다
--   my_* 와 같은 owner-or-shared RLS를 쓴다. media_events에 절대 넣지 않는다
--   (미러가 열리면 그 테이블은 무로그인으로 읽힌다)

create table if not exists meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title text not null,
  met_on date not null default current_date,
  dur_sec int default 0,                -- 녹음 길이 (초)
  audio_path text,                      -- minutes-audio 버킷 경로, 없으면 붙여넣기로 만든 것
  source text default 'browser',        -- browser(크롬 인식) | paste(붙여넣기) | upload
  transcript text,                      -- 전사문 원본
  summary jsonb,                        -- {overview, decisions[], actions[], topics[]}
  todo_ids jsonb,                        -- 액션아이템에서 만든 my_todos id (중복 등록 방지)
  shared_with text[] default '{}',
  shared_edit boolean default false,
  created_at timestamptz default now()
);
alter table meeting_minutes add column if not exists todo_ids jsonb;

alter table meeting_minutes enable row level security;
drop policy if exists "minutes read" on meeting_minutes;
create policy "minutes read" on meeting_minutes for select to authenticated
  using (owner_email = auth.jwt()->>'email' or auth.jwt()->>'email' = any(shared_with));
drop policy if exists "minutes insert" on meeting_minutes;
create policy "minutes insert" on meeting_minutes for insert to authenticated
  with check (owner_email = auth.jwt()->>'email');
drop policy if exists "minutes update" on meeting_minutes;
create policy "minutes update" on meeting_minutes for update to authenticated
  using (owner_email = auth.jwt()->>'email'
         or (shared_edit and auth.jwt()->>'email' = any(shared_with)));
drop policy if exists "minutes delete" on meeting_minutes;
create policy "minutes delete" on meeting_minutes for delete to authenticated
  using (owner_email = auth.jwt()->>'email');

create index if not exists minutes_owner_date on meeting_minutes (owner_email, met_on desc);

-- ── 녹음 파일 버킷 (비공개) ──
-- 회의 음성이라 링크만 알면 열리는 수준도 안 된다. 경로 첫 칸이 소유자 폴더고,
-- 폴더 이름 규칙(이메일의 @ 와 . 을 _ 로)은 src/lib/minutesStore.js folderOf 와 같아야 한다
-- (내 일정 첨부 mytask-img 와 같은 방식)
insert into storage.buckets (id, name, public) values ('minutes-audio', 'minutes-audio', false)
  on conflict (id) do nothing;

drop policy if exists "minutes audio insert" on storage.objects;
create policy "minutes audio insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'minutes-audio'
    and (storage.foldername(name))[1] = replace(replace(auth.jwt()->>'email', '@', '_'), '.', '_'));
drop policy if exists "minutes audio read" on storage.objects;
create policy "minutes audio read" on storage.objects for select to authenticated
  using (bucket_id = 'minutes-audio'
    and (storage.foldername(name))[1] = replace(replace(auth.jwt()->>'email', '@', '_'), '.', '_'));
drop policy if exists "minutes audio delete" on storage.objects;
create policy "minutes audio delete" on storage.objects for delete to authenticated
  using (bucket_id = 'minutes-audio'
    and (storage.foldername(name))[1] = replace(replace(auth.jwt()->>'email', '@', '_'), '.', '_'));
