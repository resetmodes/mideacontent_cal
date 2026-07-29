-- RMN 광고주 공유 리포트 ('26.7.29) — Supabase SQL Editor에서 1회 실행
-- 구조: 팀이 캠페인 결과를 "스냅샷"으로 발급(rmn_share) → 광고주는 링크의 토큰(+임시 비밀번호)으로
--       RPC(get_rmn_share)를 통해서만 열람. 원본 rmn_bookings/rmn_ga_daily에는 접근 불가.
--       만료(기본 30일) 지나면 RPC가 아무것도 반환하지 않음. 다른 광고주 데이터는 스냅샷에 없음.

create table if not exists rmn_share (
  id          uuid primary key default gen_random_uuid(),
  token       uuid not null unique default gen_random_uuid(),  -- 링크 키 (?share=)
  advertiser  text not null,
  campaign    text,
  pw          text,                        -- 임시 비밀번호 (null = 링크만으로 열람)
  data        jsonb not null,              -- 발급 시점 스냅샷 (해당 캠페인 데이터만)
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  created_by  text
);

alter table rmn_share enable row level security;

-- 팀: 로그인 계정 조회, 발급·회수는 team_writers (기존 패턴과 동일)
drop policy if exists rmn_share_select on rmn_share;
create policy rmn_share_select on rmn_share for select to authenticated using (true);
drop policy if exists rmn_share_insert on rmn_share;
create policy rmn_share_insert on rmn_share for insert to authenticated with check (is_team_writer());
drop policy if exists rmn_share_delete on rmn_share;
create policy rmn_share_delete on rmn_share for delete to authenticated using (is_team_writer());
-- anon 정책 없음 = 광고주는 테이블 직접 조회 불가 (아래 RPC로만)

-- 열람 메타 (비밀번호 입력 전) — 비밀번호 필요 여부·만료 여부만
create or replace function get_rmn_share_meta(p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'advertiser', advertiser, 'campaign', campaign,
    'needsPw', pw is not null,
    'expired', expires_at <= now(),
    'expiresAt', expires_at)
  from rmn_share where token = p_token limit 1
$$;

-- 본문 열람 — 토큰 + (비밀번호 있으면) 일치 + 미만료일 때만 스냅샷 반환
create or replace function get_rmn_share(p_token uuid, p_pw text default null)
returns jsonb language sql security definer stable set search_path = public as $$
  select data || jsonb_build_object('expiresAt', expires_at)
  from rmn_share
  where token = p_token
    and expires_at > now()
    and (pw is null or pw = p_pw)
  limit 1
$$;

grant execute on function get_rmn_share_meta(uuid) to anon, authenticated;
grant execute on function get_rmn_share(uuid, text) to anon, authenticated;

-- 설치 확인
select 'rmn_share ready' as ok, count(*) from rmn_share;
