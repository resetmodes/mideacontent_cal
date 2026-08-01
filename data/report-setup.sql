-- 월간 운영 리포트 스냅샷 ('26.7.31) — 실행: Supabase SQL Editor 1회 (setup.md 13장)
-- 확정한 리포트의 수치와 서술을 발행 시점 그대로 보관한다.
-- 미실행 시 리포트 열람과 생성은 되고 저장만 실패한다 (다른 기능 무영향)

create table if not exists monthly_reports (
  id uuid primary key default gen_random_uuid(),
  ym text not null unique,            -- '2026-07'
  data jsonb not null,                -- reportDeck.js 계산값 스냅샷
  narration jsonb,                    -- 서술 문단과 인사이트
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table monthly_reports enable row level security;

-- 읽기 = 로그인 계정 전체 (내부 전용, anon 정책 없음 — 미러에 안 나감)
create policy "reports read" on monthly_reports
  for select using (auth.uid() is not null);

-- 쓰기 = team_writers 등록 계정만 (일정과 같은 기준)
create policy "reports write" on monthly_reports
  for insert with check (is_team_writer());
create policy "reports update" on monthly_reports
  for update using (is_team_writer());
create policy "reports delete" on monthly_reports
  for delete using (is_team_writer());
