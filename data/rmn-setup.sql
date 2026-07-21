-- RMN (APP 광고 판매) 부킹 테이블 — '26.7
-- 실행: Supabase → SQL Editor → 전체 붙여넣기 → Run (1회)
-- 내부 전용: anon(미러) 정책 없음 — 로그인 계정만 조회, 쓰기는 team_writers만

create table if not exists rmn_bookings (
  id uuid primary key default gen_random_uuid(),
  advertiser text not null,             -- 광고주명
  campaign text,                        -- 캠페인명
  product text not null,                -- 스플래시/푸쉬/메인배너/팝업배너/하단배너/헤드라인 뉴스/이벤트 메뉴
  start_date date not null,
  end_date date,
  send_at timestamptz,                  -- 푸쉬 발송 일시 (푸쉬만)
  push_qty int,                         -- 푸쉬 발송 건수 (5만 단위)
  list_price bigint default 0,          -- 공시가 (원)
  discount_rate numeric default 0,      -- 할인율 %
  actual_price bigint default 0,        -- 실판가 = 총광고비 (원)
  net_amount bigint default 0,          -- 입금가 (판매사 30% 수수료 차감)
  agency text,                          -- 판매사 (null = 직접 판매)
  agency_manager text,
  agency_phone text,
  agency_email text,
  agency_bizno text,                    -- 사업자등록번호 (연동값 확보 후)
  agency_addr text,                     -- 주소 (연동값 확보 후)
  status text not null default '부킹',  -- 가부킹/부킹/집행/결과 리포트/세금계산서/입금 확인/완료/취소
  memo text,
  created_at timestamptz default now()
);
alter table rmn_bookings enable row level security;
create policy "rmn read signed-in" on rmn_bookings for select to authenticated using (true);
create policy "rmn write writers" on rmn_bookings for all to authenticated
  using (is_team_writer()) with check (is_team_writer());
