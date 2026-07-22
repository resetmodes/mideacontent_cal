-- 정산 탭 ('26.7 테스트 — 노규빈·박준영·한은비 3인) 테이블 + 증빙 파일 저장소
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (1회)
-- 내부 전용: anon(미러) 정책 없음 — 로그인 계정만 조회, 쓰기는 team_writers만
-- 탭 노출 자체는 config.js SETTLE_EMAILS 3인 게이트 (UI 게이트, 실제 차단은 RLS)

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  stype text not null,                  -- 법인카드 / 세금계산서
  title text not null,
  owner_email text,                     -- 담당자 (로그인 계정 자동)
  owner_name text,
  month text,                           -- 귀속월 YYYY-MM
  amount bigint default 0,              -- 정산 금액 (원)
  account text,                         -- 계정과목 (법인카드 일반 정산 가능 건)
  easy_doc text,                        -- 간편결재 문서번호 (법인카드 별도 정산 건)
  alloc text,                           -- 점 배분 프리셋 id (dept/all, 빈값 = 배분 없음)
  alloc_excluded jsonb,                 -- 배분 제외 점 목록 ["미아","동대문"]
  recurring boolean default false,      -- 반복 정산 템플릿 (매달 같은 파일 재사용)
  status text not null default '작성',  -- 작성/증빙 완료/(계산서 발행)/전표 처리/완료
  files jsonb default '[]'::jsonb,      -- [{name,path,size,slot}] — 실파일은 Storage
  memo text,
  created_at timestamptz default now()
);
alter table settlements enable row level security;
create policy "settle read signed-in" on settlements for select to authenticated using (true);
create policy "settle write writers" on settlements for all to authenticated
  using (is_team_writer()) with check (is_team_writer());

-- 증빙 파일 버킷 (비공개 — 로그인 읽기, team_writers 쓰기·삭제)
insert into storage.buckets (id, name, public) values ('settle-docs', 'settle-docs', false)
  on conflict (id) do nothing;
create policy "settle docs read" on storage.objects for select to authenticated
  using (bucket_id = 'settle-docs');
create policy "settle docs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'settle-docs' and is_team_writer());
create policy "settle docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'settle-docs' and is_team_writer());
