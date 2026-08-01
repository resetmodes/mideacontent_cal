-- 미디어 바이럴 라운지 ('26.8) — 타 팀 매체 신청 테이블 + 브랜드 소스 저장소
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (1회, setup.md 14장)
-- 미실행 시 라운지 탭이 안내 문구만 표시 (다른 기능 무영향)
--
-- 접근 설계 ('26.7 확정 거버넌스 — 사내 타 팀에게도 계정 발급 금지):
--   신청(INSERT)  = anon 허용 — 2차에 미러(무로그인)에서 폼 공개 예정. 쓰기 전용이라
--                   신청자는 남의 신청을 못 봄 (SELECT anon 정책 없음)
--   열람(SELECT)  = 로그인 계정만 (팀 관리함)
--   수정, 삭제    = team_writers만 (배정, 상태 진행, 반려)

create table if not exists media_requests (
  id uuid primary key default gen_random_uuid(),
  req_no text,                          -- 접수번호 MR-YYMMDD-NN (표시용)
  dept text not null,                   -- 신청 부서
  name text not null,                   -- 신청자 이름
  email text not null,                  -- 사내 이메일 (회신처)
  agenda text not null,                 -- 아젠다명 (행사, 브랜드)
  sell_points jsonb default '[]'::jsonb, -- 소구점 칩 ["할인","국내 최초"]
  sell_note text,                       -- 소구점 한 줄 설명
  goal text,                            -- 목적 (방문 유도 등)
  media jsonb default '[]'::jsonb,      -- 희망 매체 채널 id 배열, 빈 배열 = 추천 요청
  event_start date,                     -- 행사 시작
  event_end date,                       -- 행사 종료
  wish_date date,                       -- 희망 게시일
  wish_end date,                        -- 희망 게시 종료 (기간 노출 구좌)
  details jsonb default '{}'::jsonb,    -- 구좌별 상세 (appSlot, title, body, landing, audience 등)
  sources jsonb default '[]'::jsonb,    -- 브랜드 소스 파일 메타 [{name,path,size}]
  source_link text,                     -- 영상 등 대용량 소스 사내 공유 링크
  source_later boolean default false,   -- 소재 추후 전달
  has_plan boolean default false,       -- 계획안 보유 (파일은 안 받음 — 팀즈 개별 공유)
  status text not null default '접수',  -- 접수/배정/협의/확정/게시 완료/반려
  owner text,                           -- 배정 담당 (이름 직급)
  reject_reason text,                   -- 반려 사유
  linked_events jsonb default '[]'::jsonb, -- 확정 시 등록한 캘린더 일정 id 목록
  memo text,                            -- 팀 내부 메모
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table media_requests enable row level security;

-- 신청 = 누구나 (쓰기 전용 폼 — 미러 공개 대비. 열람 정책이 없어 신청자는 조회 불가)
create policy "lounge insert anyone" on media_requests
  for insert to anon, authenticated with check (true);
-- 열람 = 로그인 계정 전체 (내부 관리함)
create policy "lounge read signed-in" on media_requests
  for select to authenticated using (true);
-- 수정, 삭제 = team_writers만
create policy "lounge update writers" on media_requests
  for update to authenticated using (is_team_writer());
create policy "lounge delete writers" on media_requests
  for delete to authenticated using (is_team_writer());

-- ── 공개 진행 현황 보드 ('26.8 — 신청 전사 공개, 사용자 지시 "홍보효과 + 투명한 집행") ──
-- 미러(무로그인)에서 모든 팀이 신청 현황을 본다. 원본 테이블의 anon SELECT는 계속 없음,
-- 대신 공개해도 되는 컬럼만 담은 뷰를 anon에 연다.
-- 제외: email(연락처), details(문안·타겟 상세), sources(비공개 버킷 경로), source_link,
--       reject_reason(민감), memo(팀 내부)
-- linked_events(확정 시 등록한 캘린더 일정 id)는 포함 — 게시 완료 카드가 집행 결과
-- 이미지(일정 첨부, event-images 공개 버킷)를 보여주는 데 쓴다. 일정 자체가 미러
-- 캘린더 anon SELECT로 이미 공개인 데이터라 id 노출은 추가 공개가 아니다
-- 이미 lounge-setup.sql을 실행했다면 이 블록만 다시 실행하면 된다 (create or replace = 재실행 안전)
create or replace view lounge_board as
  select id, req_no, dept, name, agenda, media, goal,
         event_start, event_end, wish_date, wish_end,
         status, owner, linked_events, created_at
  from media_requests;
grant select on lounge_board to anon, authenticated;

-- 브랜드 소스 버킷 (비공개 — 미공개 행사 로고일 수 있어 event-images와 달리 공개 안 함)
-- 업로드는 신청 폼(anon 포함), 읽기는 로그인 계정만, 삭제는 team_writers
insert into storage.buckets (id, name, public) values ('lounge-src', 'lounge-src', false)
  on conflict (id) do nothing;
create policy "lounge src insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'lounge-src');
create policy "lounge src read" on storage.objects for select to authenticated
  using (bucket_id = 'lounge-src');
create policy "lounge src delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lounge-src' and is_team_writer());
